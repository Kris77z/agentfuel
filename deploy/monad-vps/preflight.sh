#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]] || { printf '%s\n' 'Run preflight as root.' >&2; exit 1; }
readonly project_root=/Users/jungle/Desktop/dev/agentfuel
readonly runtime_root="$project_root/demo-output/monad-hosted-20261012/runtime"
readonly gateway_root="$project_root/demo-output/local-hosted-20261012/gateway"
readonly bootstrap_file="$project_root/demo-output/monad-hosted-20261012/bootstrap.json"
[[ "$(realpath "$project_root")" == "$project_root" ]]
[[ -L /srv/tabby-monad && "$(readlink /srv/tabby-monad)" == "$project_root" ]]
[[ "$(/opt/tabby-monad/node/bin/node --version)" == v22.23.2 ]]
/opt/tabby-monad/go/bin/go version
for file in "$bootstrap_file" "$project_root/.data/monad-vps-operator/model-upstream.json" \
  "$runtime_root/runtime-journal/session.json" "$gateway_root/ready.json" \
  "$project_root/.data/magpie-linux-build/magpie" "$project_root/.data/magpie-linux-build/build.json"; do
  runuser -u tabby-monad -- test -r "$file"
done
for binary in /usr/bin/bwrap /usr/bin/socat /usr/bin/docker /usr/sbin/nginx /usr/bin/certbot; do
  test -x "$binary"
done
printf '%s\n' 'Testing the same unprivileged namespace boundary used by Magpie.'
args=(--die-with-parent --new-session --unshare-all --ro-bind /usr /usr)
for directory in /bin /lib /lib64; do
  [[ ! -e "$directory" ]] || args+=(--ro-bind "$directory" "$directory")
done
args+=(--proc /proc --dev /dev -- /usr/bin/true)
if ! runuser -u tabby-monad -- /usr/bin/bwrap "${args[@]}"; then
  printf '%s\n' 'Namespace preflight failed. Inspect VPS virtualization and the installed bwrap AppArmor profile.' >&2
  printf '%s\n' 'Do not disable global AppArmor or its user namespace restriction; do not use unsandboxed Magpie.' >&2
  sysctl kernel.unprivileged_userns_clone user.max_user_namespaces kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || true
  journalctl -k --since '-5 minutes' --no-pager | tail -60 >&2
  exit 1
fi
# Only the runtime unit receives docker as a supplementary group.
runuser -u tabby-monad -g tabby-monad -G docker -- docker info --format '{{.ServerVersion}}'
runuser -u tabby-monad -g tabby-monad -G docker -- docker image inspect \
  python:3.12-alpine@sha256:4c47124a8391cb7a9f571164147d154777cf012a4ece5f86097130d7a4478111 >/dev/null
for port in 3426 3427 8792 3024; do
  if ss -H -ltn "sport = :$port" | read -r socket_entry; then
    printf 'Port %s is already in use. Confirm its owner before starting services.\n' "$port" >&2
    exit 1
  fi
done
printf '%s\n' 'Preflight passed: files readable, namespace sandbox available, Docker image present, fixed ports free.'
printf '%s\n' 'No RPC, model, chain, or application startup was performed.'
