# Project facts and operations

User-facing communication defaults to Simplified Chinese. Preserve the original `agentfuel` package names and recorded absolute paths when maintaining Tabby.

## Public Monad instance

- Product: `https://monad.tabbyai.xyz`; Monad Testnet `10143`, six-decimal test USDC.
- VPS: `154.12.34.51`. Physical checkout: `/Users/jungle/Desktop/dev/agentfuel`; `/srv/tabby-monad` is its symlink.
- Unix user: `tabby-monad`. Units: `tabby-monad-gateway`, `tabby-monad-runtime`, `tabby-monad-frontend`.
- Private env: `/etc/tabby-monad`; pinned tools: `/opt/tabby-monad`. Next/Hosted/Magpie/bridge ports: `3024/8792/3426/3427`, all loopback.
- Existing Tempo at `tempo.tabbyai.xyz` uses its own checkout, `tabby-tempo` user, units, ports and journals. Scope changes to Monad; preserve Tempo.
- The [deployment bundle](deploy/monad-vps/README.md) is the operational contract. [The dated acceptance](docs/monad-vps-20261014.md) records observed checks and their limits.

## Runtime state and evidence

Keep original Bootstrap/runtime/gateway paths from the deployment bundle. Request snapshots, payment journals, model attempts, wallet files and recovery bindings must not be reset or rebased to a different path.

The public-origin migration uses `scripts/monad-vps-migrate.ts` and a matching `Applied` audit; launch the runtime with `--recover`. Do not bypass bindings or redispatch saved paid/Unknown calls. Existing paused work remains paused until its original request is explicitly resumed or resolved.

Stop all three Monad units together during stack maintenance (`Upholds` dependencies). Build a new Next output directory before switching the frontend's `NEXT_DIST_DIR`. Validate nginx before reloading only the new site configuration.

Deployment health checks read state and authenticate a temporary wallet; they do not create Agents, call paid models or broadcast transactions. New business acceptance must have its own dated evidence. Never print credential contents, private RPC URLs, raw signed transactions, or private model responses.

Frontend changes also follow `frontend/AGENTS.md` and the bundled Next.js documentation. Record actual production changes and verification in the dated deployment evidence; historical local acceptance does not establish a fresh Monad execution.
