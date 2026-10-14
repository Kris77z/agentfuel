# Monad VPS deployment

Target: Ubuntu 24.04, `154.12.34.51`, **https://monad.tabbyai.xyz**, Monad Testnet **10143 / USDC**. Tempo remains its own application at `tempo.tabbyai.xyz`, with separate Unix user, services, code, model journals, wallets, sessions and chain configuration.

The instance was deployed on **2026-10-14**; [the dated deployment checks](../../docs/monad-vps-20261014.md) record public availability, authentication and state preservation. This runbook does not establish a new public-chain/model execution.

## Files and ports

| Item | Monad | Existing Tempo |
| --- | --- | --- |
| Service user / units | `tabby-monad`, `tabby-monad-{gateway,runtime,frontend}` | `tabby-tempo`, its existing units |
| Physical checkout | `/Users/jungle/Desktop/dev/agentfuel` | `/Users/jungle/Desktop/dev/agentfuel-tempo` |
| Operator env / toolchain | `/etc/tabby-monad`, `/opt/tabby-monad` | `/etc/tabby-tempo`, `/opt/tabby-tempo` |
| Next / Hosted | `127.0.0.1:3024` / `8792` | `127.0.0.1:3028` / `8794` |
| Magpie / credential bridge | `127.0.0.1:3426` / `3427` | `127.0.0.1:3436` / `3437` |
| Public host | `monad.tabbyai.xyz` | `tempo.tabbyai.xyz` |

Internal Relay, Underwriter, Arena and external-specialist ports are retained from the Monad runtime journal. Only nginx listens publicly on 80/443. Its new site explicitly forwards the Monad host and HTTPS headers to Next; it does not proxy Hosted, wallets, suppliers or Magpie directly. [The Hosted bridge](../../frontend/lib/hosted-agents-proxy.ts) requires `HOSTED_FRONTEND_TRUST_PROXY=1` and exact matching headers. Cookies remain host-only, `HttpOnly`, `Secure`, and `SameSite=Strict`.

The frontend uses `FRONTEND_RPC_URL_FILE` for the private operator endpoint without putting its value in public metadata. `FRONTEND_LOG_PAGE_BLOCKS=10` accommodates the current provider's log-range cap while retaining all 2000 recent blocks. Its direct RPC honors the configured pacing, call gas cap and existing read-only 503 retry policy. The current frontend output is `.next-monad-vps-rpcfix`; for subsequent releases, build into a fresh output directory, then set the production env's `NEXT_DIST_DIR` to that completed build before restarting the frontend.

## Preserve the existing state

Keep the original absolute paths used by recorded requests:

```sh
export MONAD_PROJECT_ROOT=/Users/jungle/Desktop/dev/agentfuel
export MONAD_RUNTIME="$MONAD_PROJECT_ROOT/demo-output/monad-hosted-20261012/runtime"
export MONAD_BOOTSTRAP="$MONAD_PROJECT_ROOT/demo-output/monad-hosted-20261012/bootstrap.json"
export MONAD_GATEWAY="$MONAD_PROJECT_ROOT/demo-output/local-hosted-20261012/gateway"
```

Before transfer, confirm that all local writers for the same contract deployment are stopped, including legacy demo/settler processes. Preserve the complete runtime and gateway directories, original external key/RPC file paths, request snapshots, wallet locks, transaction journals, model responses and settlement archives. Transfer these through the authenticated SSH connection into private directories; exclude them from the public checkout and nginx document roots. Keep a cold snapshot and file checksums before migration. Linux rebuilds Magpie instead of using the Mac binary. Recreate the recorded IPC directory with correct ownership; do not copy an active socket.

Do not run a new contract deployment or reset the database. The migration changes only the recorded deployment configuration and authentication boundary. Ordinary stopped `Paused` requests are not assumed safe: the migrator admits only its explicitly checked, zero-charge, direct-transport provisioning case with no recorded transaction; all other unfinished work needs reconciliation first. Such admitted requests stay paused and are not dispatched at service startup.

## Prepare the host and build

The shared VPS already has Docker, nginx, Certbot, `bwrap`, `socat` and `jq` from Tempo. [Dependency preparation](install-dependencies.sh) checks those tools and creates only Monad's user, directories and pinned Node/Go installations. It does not upgrade host packages or replace Tempo's Docker repository, units or nginx site. Node **22.23.2** and Go **1.26.3** archives are checked against pinned SHA256 values from [Node's release checksums](https://nodejs.org/dist/v22.23.2/SHASUMS256.txt) and [Go's official download metadata](https://go.dev/dl/?mode=json&include=all).

Run from the transferred checkout. Give `tabby-monad` ownership of its own application and migrated private files; do not recursively change Tempo or unrelated server directories.

```sh
cd "$MONAD_PROJECT_ROOT"
sudo bash deploy/monad-vps/install-dependencies.sh --apply
sudo -u tabby-monad env PATH=/opt/tabby-monad/node/bin:/usr/bin:/bin npm ci
sudo -u tabby-monad env PATH=/opt/tabby-monad/node/bin:/opt/tabby-monad/go/bin:/usr/bin:/bin \
  MAGPIE_GO_BIN=/opt/tabby-monad/go/bin/go GOTOOLCHAIN=local GOMAXPROCS=2 \
  node --import tsx scripts/magpie-build.ts --output "$MONAD_PROJECT_ROOT/.data/magpie-linux-build"
sudo -u tabby-monad /opt/tabby-monad/node/bin/node \
  deploy/monad-vps/prepare-operator.mjs --apply "$MONAD_BOOTSTRAP"
sudo -u tabby-monad env PATH=/opt/tabby-monad/node/bin:/usr/bin:/bin \
  NEXT_DIST_DIR=.next-monad-vps npm run build --workspace @agentfuel/frontend
sudo -u tabby-monad env PATH=/opt/tabby-monad/node/bin:/usr/bin:/bin \
  node --import tsx --test scripts/test/linux-magpie.test.ts
sudo bash deploy/monad-vps/preflight.sh
```

The operator helper reads the API-key file's metadata only and writes a configuration referencing that file. The gateway reads credential bytes only when actually launched. Preflight exercises the namespace boundary, Docker availability, the pinned Python image and unoccupied fixed ports without models, transactions or application startup. Existing `contracts/out` artifacts must match this checkout; transfer verified artifacts or build them with Foundry before starting the runtime.

## Audited offline migration

With all Monad writers stopped, first inspect the plan and then apply it on Linux. [The migration](../../scripts/monad-vps-migrate.ts) records original/target bytes and hashes before changing configuration, preserves original request/transaction state, and clears old login challenges/sessions. Recover an interrupted migration with the same directory, bootstrap and origin.

```sh
sudo -u tabby-monad env PATH=/opt/tabby-monad/node/bin:/usr/bin:/bin \
  MONAD_PUBLIC_ORIGIN=https://monad.tabbyai.xyz \
  node --import tsx scripts/monad-vps-migrate.ts --check \
  "$MONAD_RUNTIME" "$MONAD_BOOTSTRAP" https://monad.tabbyai.xyz
sudo -u tabby-monad env PATH=/opt/tabby-monad/node/bin:/usr/bin:/bin \
  MONAD_PUBLIC_ORIGIN=https://monad.tabbyai.xyz \
  node --import tsx scripts/monad-vps-migrate.ts --execute \
  "$MONAD_RUNTIME" "$MONAD_BOOTSTRAP" https://monad.tabbyai.xyz
```

The runtime must see the matching Applied audit and uses the original directory with `--recover`. Linux game/vendor transport is direct. A saved paid/Unknown model route is not rewritten or redispatched by this migration.

## Activate Monad's services and HTTPS

```sh
for service in gateway runtime frontend; do
  sudo install -m 0640 -o root -g tabby-monad "deploy/monad-vps/$service.env.example" "/etc/tabby-monad/$service.env"
  sudo install -m 0644 "deploy/monad-vps/tabby-monad-$service.service" /etc/systemd/system/
done
sudo systemd-analyze verify /etc/systemd/system/tabby-monad-{gateway,runtime,frontend}.service
sudo systemctl daemon-reload
sudo systemctl start tabby-monad-gateway tabby-monad-runtime tabby-monad-frontend
```

Configure **A `monad.tabbyai.xyz` → `154.12.34.51`**, and confirm no contradictory AAAA record. Activate only the new site:

```sh
sudo install -m 0644 deploy/monad-vps/nginx-http-bootstrap.conf /etc/nginx/sites-available/monad.tabbyai.xyz
sudo ln -s /etc/nginx/sites-available/monad.tabbyai.xyz /etc/nginx/sites-enabled/monad.tabbyai.xyz
sudo nginx -t
sudo systemctl reload nginx
: "${MONAD_ACME_EMAIL:?Use the existing operator ACME account email}"
sudo certbot certonly --webroot -w /var/lib/letsencrypt -d monad.tabbyai.xyz \
  --email "$MONAD_ACME_EMAIL" --agree-tos --non-interactive
sudo install -m 0644 deploy/monad-vps/nginx-monad.conf /etc/nginx/sites-available/monad.tabbyai.xyz
sudo nginx -t
sudo systemctl reload nginx
sudo install -m 0755 deploy/monad-vps/renew-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/tabby-monad-nginx
sudo systemctl enable tabby-monad-gateway tabby-monad-runtime tabby-monad-frontend
```

Use the existing Certbot account and renewal timer. Check `nginx -t` before each reload; preserve the Tempo site. A rollback stops only Monad's three services, disables only its nginx site and retains all business data. Never restore a stale business snapshot after new execution.

## Verify the release

```sh
sudo systemctl is-active tabby-monad-gateway tabby-monad-runtime tabby-monad-frontend
curl --fail --silent http://127.0.0.1:3427/health
curl --fail --silent http://127.0.0.1:3426/v1/models
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://monad.tabbyai.xyz/dashboard
curl --silent --show-error https://monad.tabbyai.xyz/api/hosted/agents
sudo systemctl is-active tabby-tempo-gateway tabby-tempo-runtime tabby-tempo-frontend
```

Expected: public homepage/Dashboard/Onboarding `200`; anonymous Hosted `401 / HOSTED_AUTH_REQUIRED`; wrong Origin `403`; login challenge bound to the Monad domain and chain `10143`. Compare Agent/run/wallet/payment records and gateway counters with the cold snapshot. These checks must not create an Agent, call a model, broadcast a transaction or reset a journal. Public availability and a wallet-signature login are deployment checks; a new game/hiring/model-credit/repayment run needs separately recorded execution evidence.

For maintenance, stop all three Monad services together because `Upholds` reconnects dependent services. Runtime keeps `PrivateTmp=false` so Docker sees the actual submission bind mounts; the gateway retains its namespace isolation. Neither operation requires stopping Tempo.
