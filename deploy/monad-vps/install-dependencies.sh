#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--apply" || "$#" != 1 ]]; then
  printf '%s\n' 'Usage: sudo bash deploy/monad-vps/install-dependencies.sh --apply' >&2
  exit 64
fi
[[ "$EUID" == 0 ]] || { printf '%s\n' 'Run as root.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { printf '%s\n' 'Requires Ubuntu 24.04.' >&2; exit 1; }

readonly project_root=/Users/jungle/Desktop/dev/agentfuel
readonly node_version=22.23.2
readonly go_version=1.26.3
case "$(dpkg --print-architecture)" in
  amd64)
    node_arch=x64; go_arch=amd64
    node_sha=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307
    go_sha=2b2cfc7148493da5e73981bffbf3353af381d5f93e789c82c79aff64962eb556
    ;;
  arm64)
    node_arch=arm64; go_arch=arm64
    node_sha=fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8
    go_sha=9d89a3ea57d141c2b22d70083f2c8459ba3890f2d9e818e7e933b75614936565
    ;;
  *) printf '%s\n' 'Only amd64/arm64 are supported.' >&2; exit 1 ;;
esac

# The shared VPS already runs Tempo. Validate its system dependencies without
# changing packages, Docker repositories, nginx defaults, or its service units.
for binary in /usr/bin/bwrap /usr/bin/socat /usr/bin/docker /usr/sbin/nginx /usr/bin/certbot /usr/bin/jq; do
  [[ -x "$binary" ]] || { printf 'Missing host dependency: %s\n' "$binary" >&2; exit 1; }
done
getent group docker >/dev/null

staging=$(mktemp -d /tmp/tabby-monad-install.XXXXXXXX)
trap 'rm -r -- "$staging"' EXIT
node_archive="node-v${node_version}-linux-${node_arch}.tar.xz"
go_archive="go${go_version}.linux-${go_arch}.tar.gz"
download() {
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 240 --retry 3 "$1" --output "$2"
}
# SHA256 values verified against the official sources on 2026-10-14.
# https://nodejs.org/dist/v22.23.2/SHASUMS256.txt
# https://go.dev/dl/?mode=json&include=all
download "https://nodejs.org/dist/v${node_version}/${node_archive}" "$staging/$node_archive"
download "https://go.dev/dl/${go_archive}" "$staging/$go_archive"
printf '%s  %s\n' "$node_sha" "$staging/$node_archive" | sha256sum --check --status
printf '%s  %s\n' "$go_sha" "$staging/$go_archive" | sha256sum --check --status
install -d -m 0755 /opt/tabby-monad
node_target="/opt/tabby-monad/node-v${node_version}-linux-${node_arch}"
go_target="/opt/tabby-monad/go${go_version}-linux-${go_arch}"
if [[ ! -e "$node_target" ]]; then
  install -d -m 0755 "$node_target"
  tar -xJf "$staging/$node_archive" -C "$node_target" --strip-components=1
fi
if [[ ! -e "$go_target" ]]; then
  install -d -m 0755 "$go_target"
  tar -xzf "$staging/$go_archive" -C "$go_target" --strip-components=1
fi
[[ "$("$node_target/bin/node" --version)" == "v$node_version" ]]
[[ "$("$go_target/bin/go" version)" == "go version go${go_version} linux/${go_arch}" ]]
for alias in /opt/tabby-monad/node /opt/tabby-monad/go; do
  [[ ! -e "$alias" || -L "$alias" ]] || { printf 'Conflicting toolchain directory: %s\n' "$alias" >&2; exit 1; }
done
ln -sfn "$node_target" /opt/tabby-monad/node
ln -sfn "$go_target" /opt/tabby-monad/go

getent group tabby-monad >/dev/null || groupadd --system tabby-monad
if ! id tabby-monad >/dev/null 2>&1; then
  useradd --system --gid tabby-monad --home-dir /var/lib/tabby-monad --create-home --shell /usr/sbin/nologin tabby-monad
fi
[[ "$(id -gn tabby-monad)" == tabby-monad ]] || { printf '%s\n' 'Existing tabby-monad user has an unexpected primary group.' >&2; exit 1; }
install -d -m 0755 -o tabby-monad -g tabby-monad "$project_root"
[[ "$(realpath "$project_root")" == "$project_root" ]] || { printf '%s\n' 'Project must be a physical path, not a symlink.' >&2; exit 1; }
if [[ -e /srv/tabby-monad || -L /srv/tabby-monad ]]; then
  [[ -L /srv/tabby-monad && "$(readlink /srv/tabby-monad)" == "$project_root" ]] || { printf '%s\n' '/srv/tabby-monad conflicts with the required symlink.' >&2; exit 1; }
else
  ln -s "$project_root" /srv/tabby-monad
fi
install -d -m 0750 -o root -g tabby-monad /etc/tabby-monad
install -d -m 0755 /var/lib/letsencrypt/.well-known/acme-challenge
printf '%s\n' 'Dependencies installed. No project state was initialized and no application unit was started.'
printf '%s\n' 'Existing Tempo/system packages and service units were not changed.'
