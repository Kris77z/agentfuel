# Reproduce the local economic lifecycle

Run from the repository root with Node.js 22+, installed workspace dependencies, Foundry (`forge` and `anvil`), a running local Docker daemon, and the pinned Python image already present:

```sh
docker pull python:3.12-alpine@sha256:4c47124a8391cb7a9f571164147d154777cf012a4ece5f86097130d7a4478111
npm run economics:local
```

The image pull is an explicit prerequisite; acceptance never downloads models or images. The command builds the local Solidity artifacts, starts its own Anvil on a dynamic loopback port, deploys the contracts, starts the underwriter, fixed-price relay, Arena HTTP service and an independent settler, and stops them after verification. It does not load deployment configuration or contact production. Business environment and HTTP proxy overrides are cleared for the worker, Arena uses the pinned image, and the Docker transport must be a local Unix socket.

The launcher is [check-economic-loop.mjs](../scripts/check-economic-loop.mjs); its worker is [economic-loop-local.ts](../scripts/economic-loop-local.ts). They reuse the existing local integration fixture and production economic admission, execution, contract settlement and accounting code. HTTP services use dynamic loopback ports; keys, bindings, signed bytes and private journals exist only in a temporary directory. A separate short `/tmp` directory holds the owned settler socket. Cleanup removes both directories, stops the owned process group and removes only containers whose creation was recorded by this run. The worker has a six-minute deadline with a further twenty-second termination grace; individual build, RPC, Docker and polling operations are also bounded.

The final stdout value is a JSON report. Progress labels go to stderr. To retain a separate report, use a new absolute filename:

```sh
npm run economics:local -- --report /tmp/agentfuel-economic-loop-unique.json
```

`--report` opens with exclusive creation and refuses an existing file. It never overwrites historical evidence. Exit status is nonzero for missing prerequisites, failed predicates, timeout or cleanup failure. An interrupted run also fails. Reports include source revision, tracked-diff and harness hashes, tool versions, contract artifact hashes, journal hashes, receipt block hashes, decoded financial event values, before/after balances and accounting coverage. Private RPC URLs, signed transaction bytes, model responses and credentials are excluded.

The six published tasks are pre-funded on the local chain. One Agent receives `40000` raw units of startup capital once. All amounts below use six-decimal test USDC; native gas is outside these figures.

| Scenario | Required observation |
| --- | --- |
| Losing task | A funded `100000` reward cannot cover `120000` execution plus `12000` borrowing fee. Admission records `ECONOMICS_NOT_WORTHWHILE`; quote count, model count, Agent nonce, cash and provider balance stay unchanged. |
| First profitable task | `200000` revenue, `120000` execution, `80000` borrowed and `12000` fee. Independent settlement repays `92000`; retained cash becomes `108000`. |
| Second profitable task | Another `200000` revenue, `120000` execution, `12000` borrowed and `1800` fee. Retained cash becomes `186200`. |
| Earnings pay the next task | Credit is disabled. The Agent pays the entire `120000` from retained cash, earns `200000`, and ends at `266200`, with no new owner funding or game subsidy. |
| Paid failure | A controlled answer passes the public sample but fails real Docker hidden tests. The independent settler records failure. `120000` remains an expense and task revenue is zero. Cash falls to `146200`. |
| Unknown recovery | A controlled dispatch fault occurs after real payment. Resuming the original request preserves accept/payment bytes, payment ID, nonce, model-call count and cash. Accounting remains partial with no asserted net result while unresolved. |
| Original refund | The fixed-deliverable provider refunds the original `120000` payment by an actual transaction. Recovery marks that request `Refunded`; it never becomes task income or a successful task. Cash returns to `146200`. |

Final accounting must be complete: task revenue `600000`, inference expense `480000` after the separate `120000` refund, borrowing expense `13800`, operating result `106200`, startup capital `40000`, owner topups `0`, and game subsidy `0`. Final on-chain cash must equal startup capital plus operating result: `146200`. Exactly five `ProviderPaid` events exist for this Agent: three successful tasks, one failed task and one later-refunded Unknown request.

The suite also reads [strategy advice](STRATEGY-ADVICE.md) at four points: after profitable work, the paid failure, the Unknown payment, and its original refund. It verifies the original successful admission against realized costs, keeps the `120000` failure loss, applies a `120000` cash reserve, and blocks recommendations while payment evidence is unresolved. Before/after journal hashes, input hashes, cash, nonce, model calls and quote calls must match for every advice read. Candidate inputs are labeled owner-hypothetical; the test does not claim current market quotes or execute a recommendation. Reports include hashes of the advisory source files and require them to stay stable throughout the run.

This is real local-chain and real Docker evidence with controlled model responses and failure injection. The host supplies the task sequence, so this does not exercise autonomous planning or external publisher integration. It does not prove public Monad availability, live model quality, probability-weighted profitability or USDC-valued native gas costs. Mock token/identity contracts, initial lender liquidity, publisher reward funding and startup gas are declared inputs. Nonzero game subsidies are not exercised by this command; the existing game integration tests cover their classification separately. Economic admission is a successful-completion bound, as specified in [ECONOMICS.md](ECONOMICS.md).
