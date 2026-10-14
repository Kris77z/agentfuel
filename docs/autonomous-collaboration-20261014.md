# Automatic resource acquisition, model choice, and external collaboration

This guide explains three acceptance summaries recorded on **2026-10-14**: automatic game-funded work, affordable model routes within a mission, and hiring a separately identified HTTP specialist. The [evidence directory](../frontend/acceptance/autonomous-collaboration-20261014/README.md) contains the readable JSON records.

**All three use local Anvil `31337`, six-decimal test assets, fixture identity/reputation registries, and controlled LLM responses.** They exercise actual application code, local HTTP services, signed local contract transactions, and recovery. The automatic-game task cases additionally run real Docker tests and a separate Arena settler. Personal-goal cases use a separate model review call; their text artifacts are not Docker-verified.

These are controlled local acceptance runs, not new Monad transactions, real Kimi/vendor calls, public deployments, or evidence of model skill or sustainable earnings. Model names are fixture routing labels. Each case starts its own isolated environment; their balances cannot be combined into a cumulative Agent history.

## Capability → input → action → result

| Capability | Input and actions | Result | Record and fields |
| --- | --- | --- | --- |
| **Automatic game-funded work** | One provisioned Agent starts with zero Account cash and reward tokens. A bounded parent creates a game child, receives a verified reward, then runs a task child for that same Agent. | USDC: reward → planning → cash-plus-credit allowance → independently verified work → repayment/income. Tokens: reward-funded Pi work → independently verified income without a loan. | [automatic-game.json](../frontend/acceptance/autonomous-collaboration-20261014/automatic-game.json): `cases`, parent/game/task IDs, `balanceBefore/After`, `taskFunding`, `settlement`, `plannerPayments`, `canonicalReceipts`, `readOnlyRecovery`. |
| **Affordable model routes** | A two-phase launch-note goal begins with selected model `strong` and a `70000` reservation. New calls preserve budget and cash capacity for remaining work/review. | `strong → cheap → cheap → cheap`, total `60000`; separate cash-limited case uses four cheap calls for `40000`. Prior output survives and separate review passes. | [model-fallback.json](../frontend/acceptance/autonomous-collaboration-20261014/model-fallback.json): `modelSequence`, `payments`, `priorOutputPreserved`, `independentReview`, `replay`, `cashFallback`. |
| **Configured external hiring** | A cash-funded goal discovers an approved writer through HTTP metadata, checks fixture registry identity/reputation, pays its separate provider through 402/SDK, and reviews its output. | Planner `5000` + writer `10000` + Reviewer `5000` = `20000`; cash `30000 → 10000`. A separate Unknown request resolves by explicit full refund without redispatch. | [external-hire.json](../frontend/acceptance/autonomous-collaboration-20261014/external-hire.json): `discoveredService`, `mission.phases/calls/review`, cash fields, `modelDispatches`, `replay`, `unknownRecovery`. |

`10000` raw settlement-asset units means `0.01` test token. Reward tokens and package microcredits are separate off-chain inference units, distinct from cash and loan principal.

## 1. Automatic game reward → task income and repayment

The generator provisions one actor per reward branch, prepares native test gas, sets Account cash to zero, and enables bounded game/task actions. Budget reservation is a ceiling, not deposited money. Each recorded parent completes **one game and one task** for its original actor.

Initial resource bootstrap is a **host policy**, not an unpaid LLM decision. [Hosted autonomy](../services/hosted-agents/src/autonomy-executor.ts)'s `runtimeDecision` chooses an eligible game or reward-funded task when paid planning/work is unaffordable. The USDC branch buys a controlled planner call after receiving cash. The token branch has **no paid planner call**. Both games use controlled legal actions: actor all-in, bot fold; the actual rule engine and replay check yield `winners=[0]`. This validates the integration, not poker skill.

| USDC branch action | Raw amount/result | Saved field |
| --- | --- | --- |
| Start | Cash `0`, reward tokens `0` | `balanceBefore` |
| Win sponsored game; deposit award | `100000`; three transfer/approve/deposit receipts | `rewardRaw`, `gameAwardTxHashes` |
| Pay planner | Cash `10000`, credit `0` | `plannerPayments[0]` |
| Buy allowance | Cash `90000` + credit `30000` = `120000` | `taskFunding` |
| Independent task settlement | Repayment `34500`; residual `115500`; loan status `2` (`Repaid`) | `settlement` |
| Finish | Cash `115500`, debt `0`, one success; purchases charged `130000` | `balanceAfter`, `parent` |

Arithmetic: `100000 - 10000 = 90000` available cash; `30000` credit fills the allowance shortfall. Repayment is `30000` principal + `4500` fee. A `150000` task reward minus `34500` repayment leaves `115500`. Parent charges include the planner and allowance purchase, not the loan fee or native gas. This is a complete single-Agent game-reward → borrowing → work → repayment example **on the local controlled chain**, with sponsored resources and a configured reward task.

The **separate token branch** wins `4096`, consumes `30` for Pi work, retains `4066`, and receives the full `150000` task reward in cash. `fromCashRaw`, `fromCreditRaw`, parent charges, and repayment are zero; loan status `0` means no loan. Award transaction hashes and planner payments are empty because this reward is ledger-issued and no cash planner call occurs.

The generator compares actual local settlement/award receipts with their block hashes, then replays the original parent. `readOnlyRecovery` preserves request counts, nonce arrays, and result. `canonical=true` means this check passed while Anvil was running; it is not a public-chain proof.

Source: [generating test](../services/hosted-agents/test/autonomy-game-live.test.ts), [hosted autonomy](../services/hosted-agents/src/autonomy-executor.ts), [Pi controller](../packages/pi-loop/src/autonomy.ts), [game executor](../services/hosted-agents/src/game-executor.ts), [task workflow](../packages/pi-loop/src/workflow.ts), [Docker executor](../services/arena/src/docker.ts), and [separate settler](../services/arena/src/settler.ts).

### Game refill resumes the accepted task

The additional `manualRefuel` case begins with `4096` reward tokens, consumes `3584`, and pauses with `512` available. One manual sponsored-game award adds `4096`; the original task then consumes `30`, leaving `4578` and earning `150000` cash. The original task ID and acceptance transaction remain unchanged, the actor nonce does not advance during task resume, and the independent settlement passes. This is a separate local case, not another task in either branch above.

## 2. Model downgrade preserves the original goal

The goal is a launch note containing supplied facts A and B. A controlled planner produces two specialist phases, followed by separate review. Two actual local Relay HTTP endpoints quote `strong=30000` and `cheap=10000`. Their upstream model responses are injected deterministically; they do not come from Kimi or Magpie.

| Stage | Route / physical fixture label | Cash payment |
| --- | --- | --- |
| `plan` | `strong` / `physical-strong` | `30000` |
| `phase-0` | `cheap` / `physical-cheap` | `10000` |
| `phase-1` | `cheap` / `physical-cheap` | `10000` |
| `review` | `cheap` / `physical-cheap` | `10000` |

The generator checks these cash-only `taskId=0` payments against Account records and local receipt block hashes. Total `60000` fits the `70000` reservation. The second phase receives the first output (`priorOutputPreserved=true`). Review is a separate controlled invocation, not an independent fact oracle or code execution.

`cashFallback` is a **different request/Agent fixture**: its budget still permits `70000`, but cash is only `40000`; all four calls use cheap and spend `40000`. Authorized budget does not substitute for available cash. Route choice happens only at an unstarted call boundary. Existing paid/Unknown calls retain their route and handle; the mechanism does not replace an uncertain inference with a second purchase. Successful replay keeps dispatch count `4` and the wallet nonce unchanged.

Source: [generating test](../services/hosted-agents/test/goals-model-fallback-paid.test.ts), [route selection](../services/hosted-agents/src/goals/executor.ts), [cash/payment admission](../services/hosted-agents/src/goals/payment.ts), [SDK](../packages/sdk/src/index.ts), [Relay](../services/provider-relay/src/relay.ts), and [controlled fallback boundaries](../services/hosted-agents/test/model-fallback.test.ts).

## 3. External specialist → paid artifact → review

Input: **“Write a launch note containing only supplied facts A and B.”** The approved writer is `partner-writer`, service `external/partner-writer`, quote `10000`. Local `/services` and `/identity` metadata are checked against operator-approved endpoint, provider, price, and model. Its provider wallet differs from the internal model provider. The fixture registers it and seeds one feedback, giving the saved score **4.8 with one sample**. This is fixture data, not a measured quality rating.

The full goal makes three actual local HTTP model dispatches: Commander, external writer, and separate Reviewer. The writer returns **“Launch note: supplied facts A and B.”** The Reviewer accepts it. `mission.calls` binds each stage's model label, charge, payment ID, transaction hash, and request digest. The external call also carries provider/registry identity, prompt digest, and assignment digest. Discovery and phase reputation snapshots have different blocks because the relevant boundary rechecks metadata.

The successful goal spends `5000 + 10000 + 5000 = 20000`, reducing cash `30000 → 10000`. It creates no task income, credit loan, repayment, or Docker task verdict. Replay returns the same result without additional dispatch or nonce use.

`unknownRecovery` is a **separate follow-up request** with an external HTTP disconnect after payment. Stop keeps its original handle and payment without redispatch. Explicit operator resolution accepts unknown supplier cost; the external provider funds the dedicated refunder for `10000`. Recovery records net charge `0`, refund `10000`, and no extra dispatch after refund. This refund does not reduce the successful goal's `20000` cost.

This validates configured, admitted HTTP service integration, not arbitrary open provider discovery or a production/decentralized marketplace. `reputation.source="erc8004"` names the local fixture read path, not Monad canonical registries.

Source: [generating test](../services/hosted-agents/test/external-hiring.test.ts), [discovery/ranking](../services/hosted-agents/src/external/registry.ts), [hiring/payment binding](../services/hosted-agents/src/external/hiring.ts), [external service adapter](../services/hosted-agents/src/external/service.ts), [goal executor](../services/hosted-agents/src/goals/executor.ts), and [reconciliation](../services/hosted-agents/src/goals/reconciliation.ts).

## Separate Monad provider admission

The [Monad admission record](../frontend/acceptance/autonomous-collaboration-20261014/external-provider-monad.json) uses chain `10143`, canonical identity Agent `1999`, and provider wallet `0x5C08F50F20609E4CF4ccD2Caf185F03F9BF09ceD`. Its [successful whitelist transaction](https://testnet.monadvision.com/tx/0x6db97c6add9261de6153df80d7afc876bea2817bc6f3202f82d0074e4d5bce3d) is saved with status and block hash. It establishes external-provider admission only; the three complete integrations described above remain local controlled runs. [Admission tool](../scripts/prepare-external-provider.ts) supports a read-only check and separately journaled apply/recovery; [tests](../scripts/test/prepare-external-provider.test.ts) exercise those boundaries locally.

## Offline consistency check

From the repository root, the shared [checker](../scripts/check-acceptance-evidence.mjs) reads the three local summaries. It checks saved arithmetic, payment and identity bindings, settlement references, and replay invariants. It does not access a network, call a model, send transactions, or reconstruct the original chain.

```sh
npm run evidence:check
node scripts/check-acceptance-evidence.mjs --json
```

The machine-readable output includes each capability, request ID, environment, report SHA-256, and checked facts. The Monad admission record is separate from these local checks.

## Reproduce fresh local runs

These optional commands create local Anvil chains, HTTP services, test transactions, temporary journals, and Docker execution where applicable. They **overwrite the summaries** with new IDs/hashes/timestamps. They use no real supplier credentials or Monad broadcasts. Fresh fixtures cannot recreate the exact original local hashes.

Prerequisites: Node **22.19+**, installed workspace dependencies, Foundry `forge`/`anvil` on `PATH`, cached Solidity **0.8.24**, and a running Docker daemon with the pinned image in [local setup](../README.md#run-locally). [Task fixtures](../services/hosted-agents/test/task-fixture.ts) and [workflow fixtures](../packages/pi-loop/test/workflow-fixture.ts) create and clean up their own environment.

```bash
forge build --root contracts --offline --skip-lint
EXTERNAL_ACCEPTANCE_OUTPUT=frontend/acceptance/autonomous-collaboration-20261014/external-hire.json \
node --import tsx --test --test-concurrency=1 \
  services/hosted-agents/test/autonomy-game-live.test.ts \
  services/hosted-agents/test/goals-model-fallback-paid.test.ts \
  services/hosted-agents/test/external-hiring.test.ts
```

The JSON fields, generators, and stable source paths explain these records without private keys, hidden hands, supplier credentials, signed raw transactions, or private runtime journals. The summaries do not export full original receipts. Production readiness and fresh public-chain/real-model execution need separate evidence; [earlier Monad acceptance](monad-hosted-acceptance-20261012.md) retains its original scope.
