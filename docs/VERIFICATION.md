# Tabby verification guide

This is an index of reviewable acceptance evidence, updated on **2026-10-15**. Historical claims **A–E** preserve the source revision `0526070` and the real-network runs recorded on **2026-10-12 and 2026-10-13**. Claims **F–H** retain their separate **2026-10-14 local controlled** reports. Fresh [Oct 15 public Monad collaboration](monad-collaboration-live-20261015.md) has passed external hiring, a model-downgrade recheck and a separately prepared automatic token-funded task loop; original failures/defaults and explicit operator remediation remain recorded. Historical balances and reputation are snapshots, not assertions about current live state.

All linked evidence files are included in the repository. This guide does not require private runtime directories, supplier credentials, signed raw transactions, or the original operators' wallets. It reuses the published acceptance records rather than copying them into a second evidence set.

The [Oct 14 public deployment checks](monad-vps-20261014.md) separately establish HTTPS availability, signature authentication and preservation of the migrated runtime. They add no new paid model or chain execution to the historical cases below.

## Scope of the evidence

The historical real-network cases use **Monad Testnet, chain ID 10143**, with **6-decimal test USDC**. Application services ran locally. Recorded real Kimi K2.6/K3 responses and usage establish the model paths observed by the services; public transaction receipts independently establish contract execution and funds movement. An onchain payment does not prove model quality or the supplier's final bill.

The Oct 14 F–H integration reports use **local Anvil, chain ID 31337**, local HTTP services and **controlled LLM responses**. They record actual local contract payments and recovery; automatic task acceptance also uses Docker and a separate Arena settler. Their external identity/reputation fixture is local, not proof of public Monad registration. JSON reports are recorded case results; linked test source explains the assertions and generation path, and does not by its existence prove that a whole test suite passed. Those local reports do not establish fresh Monad or supplier execution; the Oct 15 records below have their own scope. See [the local acceptance guide](autonomous-collaboration-20261014.md) for setup, reproduction and boundaries.

The escrowed-task path buys an inference allowance, then meters model usage inside that allowance. Its USDC package price, internal microcredit rates, and supplier billing are separate quantities. Personal goals instead use cash-funded, per-call payments; they do not create task rewards, loans, repayments, or ERC-8004 reputation.

## Fresh public Monad execution · 2026-10-15

The deployed public frontend, owner-signature authentication, original request journals, Magpie gateway and Monad Testnet `10143` were used for these new cases. The [dated acceptance](monad-collaboration-live-20261015.md) explains maintenance, actual usage, costs and current automatic-task status; the [public report guide](../frontend/acceptance/monad-collaboration-20261015/README.md) identifies each JSON file.

| Case | Actual result and cost | Public evidence |
| --- | --- | --- |
| External Agent hiring | Agent `2363`, original UUID `b88e9a24-8e6f-412c-b020-3ae5acff0700`: three real K2.6 calls, `30000` cash, separate review passed. Three canonical payments and real response mappings audited; same-UUID replay adds no nonce/model call. | [external-public-summary.json](../frontend/acceptance/monad-collaboration-20261015/external-public-summary.json): `discovery`, external phase/service bindings, `payments`, gateway `usage`, answer digest, `independentReview`, finance and replay. |
| Same-goal budget downgrade | Agent `2365`, successful recheck UUID `02d89b0a-72a6-463e-a6b7-ebd18789b0dd`: K3 `20000` → K2.6 `10000` × 3 within the unchanged `50000` per-run budget. Prior output preserved, review passed, four payments/responses audited, replay adds no payment/model. | [fallback-recheck-public-summary.json](../frontend/acceptance/monad-collaboration-20261015/fallback-recheck-public-summary.json) links the [original failed request](../frontend/acceptance/monad-collaboration-20261015/fallback-failed-public-summary.json), which charged `50000` and correctly failed a 208-character output against 200. Both goal charges total `100000`; neither is hidden or refunded. |
| Automatic game-token-to-task loop | **Passed after explicit preparation.** Same Agent `2364`, new parent `271844c4-88eb-4e9d-9eb3-dc892ad709b9`: two games (first lost, second won `4096` tokens), `235` tokens consumed, task 19 Docker `5/5`, `150000` income, normal empty-catalog stop and original-UUID replay without new effects. Final cash `160000` includes the explicit `10000` seed; no new loan. | [automatic-recheck-public-summary.json](../frontend/acceptance/monad-collaboration-20261015/automatic-recheck-public-summary.json): actual game/solver usage, canonical guardian/settlement receipts, preserved original failure/default and all terminal replay counters. [Task 18's failed cash-credit attempt](../frontend/acceptance/monad-collaboration-20261015/automatic-failed-public-summary.json) remains failed/defaulted, liquidation `34500`; it is not reported as successful repayment. |

The successful goal cases create no escrow task reward, loan repayment or repayment reputation. The model Reviewer is a separate paid invocation, not an external factual oracle. Defaulted task 18 has not been transformed into a success. Guardian unfreeze for the new token-only run was explicit operator remediation; before/after default count remained `1` and the old loan fingerprint was unchanged. The successful recheck also increased the cumulative Agent budget `130000 → 140000`, retained old spend `130000`, and disabled additional borrowing. It does not establish a new zero-cash start or automatic recovery.

[Final read-only deployment checks](../frontend/acceptance/monad-collaboration-20261015/deployment-public-summary.json), observed at `2026-10-15T09:46:53.035341+00:00`, record six active Monad/Tempo units, all three public pages `200`, anonymous Hosted `401`, wrong Origin `403`, matching deployed source hashes, original 6 Agents / 36 runs / 86 files unchanged, and both task-catalog appends `Applied`. These checks create no Agent, model request or chain transaction; they are separate from the business records above.

## Oct 14 local additions: claim, source, test and evidence

| ID and bounded claim | Source checkpoints | Test source | Recorded local evidence and fields |
| --- | --- | --- | --- |
| **F. An autonomous parent acquires a configured game reward, then completes an escrow task with independent settlement.** Both USDC and model-token cases start without cash; original-request replay performs no new dispatch or transaction. A separate replenishment case resumes the original accepted task. | [Hosted autonomy](../services/hosted-agents/src/autonomy-executor.ts) observes confirmed resources and journals game/task children; [bounded controller](../packages/pi-loop/src/autonomy.ts) enforces game/task/spend limits and preserves pending tasks; [game executor](../services/hosted-agents/src/game-executor.ts) owns reward confirmation. | [Automatic game and replenishment acceptance](../services/hosted-agents/test/autonomy-game-live.test.ts). | [automatic-game.json](../frontend/acceptance/autonomous-collaboration-20261014/automatic-game.json): `cases[*].rewardKind`, `modelMode`, parent/game/task request IDs, `taskFunding`, `parent`, `settlement`, `canonicalReceipts`, and `readOnlyRecovery`. `usdc` awards `100000`, then repays `34500`; `llm-credits` grants `4096`, consumes `30`, and creates no loan. `manualRefuel.taskIdPreserved`, `acceptTxHashPreserved`, `settlementCanonical` and unchanged actor nonce bind replenishment to the original task. |
| **G. A goal discovers and pays a separate approved external service, then reviews its output.** Capability/reputation/budget admit candidates; the fixed execution/payment binding and returned provenance must match. Replay and Unknown stop/refund retain the original payment. | [Discovery/ranking](../services/hosted-agents/src/external/registry.ts), [hire/payment/provenance binding](../services/hosted-agents/src/external/hiring.ts), [paid service adapter](../services/hosted-agents/src/external/service.ts), and [goal stage orchestration](../services/hosted-agents/src/goals/executor.ts). | [External ranking, discovery, paid hiring and recovery](../services/hosted-agents/test/external-hiring.test.ts). | [external-hire.json](../frontend/acceptance/autonomous-collaboration-20261014/external-hire.json): `discoveredService` identity/reputation/provider/price, `mission.calls[*].external` service/payment/request/assignment bindings, `mission.review`, `modelDispatches`, `chargedRaw`, `replay`, and `unknownRecovery`. Planner + external writer + reviewer cost `5000 + 10000 + 5000 = 20000`; replay adds no dispatch or nonce. Unknown resolution records the same handle and a `10000` refund without redispatch. |
| **H. A goal uses cheaper approved routes within the same mission as budget/cash tightens, preserving earlier outputs and a separate review.** Selection is before a new quote; replay does not pay or dispatch again. Metered Pi has an equivalent admission rule for a new round's full credit reserve. | [Per-call goal route and future reserve](../services/hosted-agents/src/goals/executor.ts), [cash admission](../services/hosted-agents/src/goals/payment.ts), [metered credit admission](../services/hosted-agents/src/metered-task.ts), and [persisted actual solver tier](../packages/pi-loop/src/provider.ts). | [Paid goal downgrade acceptance](../services/hosted-agents/test/goals-model-fallback-paid.test.ts); [metered downgrade/freeze regression](../services/hosted-agents/test/model-fallback.test.ts). | [model-fallback.json](../frontend/acceptance/autonomous-collaboration-20261014/model-fallback.json): `reservedRaw=70000`, `chargedRaw=60000`, `modelSequence=[strong,cheap,cheap,cheap]`, per-stage `payments`, `priorOutputPreserved`, `independentReview`, and `replay`. `cashFallback` starts with `40000` cash and uses four cheap calls. This report covers paid goals; metered Pi coverage is the separate regression source, not an additional recorded Monad or paid-model run. |

Game rewards, cash and credit are separate resources: the USDC case borrows only for the later escrow-bound task, while the model-token case uses confirmed reward tokens. F–H demonstrate controlled execution and payment/recovery mechanisms, not profitable strategy, natural model quality or an open external-service market.

## Separate Monad provider admission

[external-provider-monad.json](../frontend/acceptance/autonomous-collaboration-20261014/external-provider-monad.json) records Agent `1999` in the canonical identity registry and a successful provider-whitelist transaction on Monad Testnet `10143`. The [transaction receipt](https://testnet.monadvision.com/tx/0x6db97c6add9261de6153df80d7afc876bea2817bc6f3202f82d0074e4d5bce3d) has status `1`, block `70914363`, and the saved block hash. This proves provider admission, without adding another full game/hiring/model execution to F–H. [Admission implementation](../scripts/prepare-external-provider.ts) and [local recovery tests](../scripts/test/prepare-external-provider.test.ts) preserve the original signed transaction.

## Historical claim-to-evidence matrix (`0526070` scope)

| ID and bounded claim | Chain, model, and date | Published evidence and fields to inspect | Implementation checkpoints |
| --- | --- | --- | --- |
| **A. Two real model tiers complete escrowed work and repay task-bound credit.** Task 12 uses K2.6; Task 13 uses K3. Each pays `40000` cash + `80000` credit for a `120000` allowance, repays `92000`, and ends with `58000` cash and zero debt. | Monad 10143; real Kimi via Magpie; 2026-10-12. | [Canonical audit](../frontend/acceptance/monad-hosted-20261012/final-canonical-audit.json): `tasks` with IDs `12`/`13`, their `models`, `payment`, `settlement`, and `loan`; `agents` with IDs `2200`/`2201`. [Financial evidence](../frontend/acceptance/monad-hosted-20261012/financial-evidence.json): `taskResults`, `ledgers`, `vendorCalls`, and `replay`. | [AgentAccount.payProvider](../contracts/src/AgentAccount.sol) combines cash and credit; [CreditManager](../contracts/src/CreditManager.sol) handles drawing and repayment; [TaskEscrow](../contracts/src/TaskEscrow.sol) applies the settlement waterfall. [Metered task](../services/hosted-agents/src/metered-task.ts), [inference gateway](../services/hosted-agents/src/inference-gateway.ts), and [Arena settler](../services/arena/src/settler.ts) connect allowance, model usage, and independent settlement. |
| **B. A bounded parent run completes two consecutive tasks and stops at its task limit.** The new parent completes Task 16/17; Agent 2202's cumulative history reaches three repayments, score 710/Tier A, and zero debt. | Monad 10143; real K2.6 planning/execution; 2026-10-12. | [Canonical audit](../frontend/acceptance/monad-hosted-20261012/final-canonical-audit.json): `autonomyParents` request `f4a39eb2-8161-4cb6-86fc-62f15f0530b9`, `tasks` `16`/`17`, `agents` `2202`, `deposits`, `budgetChange`, and `global`. [Financial evidence](../frontend/acceptance/monad-hosted-20261012/financial-evidence.json): `decisions`, `runs.autonomy`, and `replay`. | [Pi autonomy](../packages/pi-loop/src/autonomy.ts) enforces allowed decisions, cumulative spend, task/decision counts, and deadline; [hosted autonomy executor](../services/hosted-agents/src/autonomy-executor.ts) owns parent/child journals. [ERC8004Adapter](../contracts/src/ERC8004Adapter.sol) writes feedback; [underwriter rules](../services/underwriter/src/rules.ts) derive score/Tier from feedback and true repayments. |
| **C. An unknown paid inference remains a failure, then receives operator-funded compensation and independent termination.** Task 14's original delivered allowance and Unknown invocation remain recorded. Full-price compensation closes its loan as `ClosedByRefund`; termination returns the publisher's escrow. It is neither a repayment nor a default. | Monad 10143; real K2.6 route returned HTTP 503 with unknown usage/cost; 2026-10-12. | [Canonical audit](../frontend/acceptance/monad-hosted-20261012/final-canonical-audit.json): `abortedTasks[0]`, including `originalAllowanceDelivered`, `unknownInvocations`, `sealedLedger`, `operatorCompensation`, `refund`, `termination`, and both counting flags. [Financial evidence](../frontend/acceptance/monad-hosted-20261012/financial-evidence.json): `runs.autonomy-aborted` and the failed `taskResults` entry. | [Inference closure](../services/hosted-agents/src/inference-closure.ts) permanently seals the original ledger; [allowance relay](../services/provider-relay/src/allowance.ts) verifies the compensation binding; [closure reader](../services/hosted-agents/src/allowance-closure-reader.ts) checks the actual sealed ledger. [Independent abort settler](../scripts/monad-abort-settler.ts) requires the canonical full refund before returning escrow. |
| **D. Address/transaction analysis uses saved, fixed-block chain evidence with bytecode-matched sources and individually paid model stages.** Final address and transaction examples each use planner, specialist, and Reviewer calls totaling `30000` cash. Replaying the original UUID records no new payments or model requests. | Monad 10143; real RPC, Sourcify, and K2.6 via Magpie; 2026-10-13. | [Chain execution evidence](../frontend/acceptance/chain-lookup-20261013/execution-evidence.json): `cases["address-final"]` and `cases["transaction-final"]`; inspect `result.mission.research`, `receipts`, `replay`, and address `manualAcceptance`. Earlier failed/rejected cases remain in the same file. | [Chain lookup](../services/hosted-agents/src/goals/chain-lookup.ts) pins blocks and matches source bytecode; [public evidence projection](../services/hosted-agents/src/chain-evidence.ts) limits exported fields. [Commander](../services/hosted-agents/src/goals/commander.ts), [executor](../services/hosted-agents/src/goals/executor.ts), [acceptance](../services/hosted-agents/src/goals/acceptance.ts), and [payment](../services/hosted-agents/src/goals/payment.ts) preserve request, stage, research, and payment bindings. |
| **E. An expired signed payment is reconciled before a goal ends.** Recovery and explicit cancellation consume the original nonce with a zero-value self-transfer, confirm the old payment is zero, retain earlier charges, and do not purchase another model call. | Monad 10143; real earlier K2.6 calls and real nonce-voiding transactions; 2026-10-13. | [Recovery proof](../frontend/acceptance/chain-lookup-20261013/expired-payment-proof.json) and [explicit-stop proof](../frontend/acceptance/chain-lookup-20261013/expired-payment-stop-proof.json): `voidTxHash`, `nonce`, `blockHash`, `oldPaymentRaw`, `sameNonce`, retained charges, and `replay`; the stop proof records terminal phase `Cancelled`. | [Payment reconciliation](../services/hosted-agents/src/goals/reconciliation.ts) checks the original binding and canonical payment state; [void-payment](../services/hosted-agents/src/goals/void-payment.ts) persists and recovers the same nonce replacement. Expiry alone does not establish that an already signed transaction cannot execute. |

## Public receipts and expected results

### A/B: credit purchase, verified work, repayment

Amounts below are raw test-USDC units: `10000 = 0.01 test USDC`. `principal + fee = repaid`; `reward - repaid = residual` in these zero-protocol-fee examples.

| Task / model | Allowance payment: cash + credit | Settlement: principal + fee; residual |
| --- | --- | --- |
| 12 / K2.6 | [Payment](https://testnet.monadvision.com/tx/0xcb5a9c316792f4bddd8f9fd78c011bc5dc33767facc48ba6b2c38f2cc7bf5f10): `40000 + 80000` | [Settlement](https://testnet.monadvision.com/tx/0x477a0d920648e0cae3b83ca392a9b3e7363e65d8e5d269c9ed759bf37dd809e2): `80000 + 12000`; `58000` |
| 13 / K3 | [Payment](https://testnet.monadvision.com/tx/0x68c66c95bc92cf298172a1222dd74f06ca844d556488e2b5133142255afd1f37): `40000 + 80000` | [Settlement](https://testnet.monadvision.com/tx/0x38567f28918d3ef072b8092709b515d6ca08838122923715bf465fff8f3e3802): `80000 + 12000`; `58000` |
| 16 / K2.6 | [Payment](https://testnet.monadvision.com/tx/0x5afb7ebee623d24dc84aff6143b0637c4c016967c49420fd641f64f33fe3c215): `40000 + 80000` | [Settlement](https://testnet.monadvision.com/tx/0x9a22f120a078e9ea4abbc2bafa8176e1f464726ff58f298534b02e0bf04428df): `80000 + 12000`; `58000` |
| 17 / K2.6 | [Payment](https://testnet.monadvision.com/tx/0x05a72ea2103233f42d3a3454f914551bff35e0c9a9daea4d6a88500c300af303): `48000 + 72000` | [Settlement](https://testnet.monadvision.com/tx/0xf3cdfecb48f6ec12e0a848538730b19df75a5d252f36e52efda309f5b35c0802): `72000 + 5760`; `72240` |

On payment receipts, inspect `ProviderPaid` from AgentAccount. On settlement receipts, inspect `LoanRepaid`, `TaskSettled`, and feedback. Event definitions are in [IAgentAccount](../contracts/src/interfaces/IAgentAccount.sol), [ICreditManager](../contracts/src/interfaces/ICreditManager.sol), and [ITaskEscrow](../contracts/src/interfaces/ITaskEscrow.sol).

The final audit fixes its read at block **70307385**, hash `0xec8c1f62ba27cc1cc774e9958af047f357479d8594501bb5f9f749454d6f59a5`. Agent 2202's three successes/repayments include Task **15**, not just the new two-task run. The new run spent `260000` on two planning calls and two allowance purchases. Additional deposits of `12000`, prior failed planning costs, and the recorded budget change remain in the audit. The final `72240` cash is not a claim of net profit or self-sustaining unattended operation.

### C: Unknown is not rewritten as success

The [Task 14 compensation receipt](https://testnet.monadvision.com/tx/0x63407e364d560cd60ef5c833237b2ad139549ea200b5196c96174a679dba367f) records `RefundProcessed(amount=120000, debtReduced=92000, toCash=40000)` and `LoanClosedByRefund(principalForgiven=80000, feeForgiven=12000)`. The debt reduction includes the forgiven fee; fee forgiveness is not additional USDC paid out. The separate [termination receipt](https://testnet.monadvision.com/tx/0xde78da05a19819c316f7143db9dcc7bfa84a44f660a2083b481d16d8f4d4f311) ends Task 14 and returns `150000` to its publisher.

The operator accepted uncertain supplier cost; the record does not establish that the supplier charged nothing. This compensation path requires the original single allowance grant, a permanently sealed ledger, no completed/in-flight invocation, exact payment binding, and a canonical full refund. It is not a general automatic refund rule for mixed or successful model consumption, and it does not manufacture a hidden-test failure verdict.

### D: fixed-block research and three stage payments

For final address request `66fed270-f8c2-45b1-8f23-6a52b18c2724`, the saved research reads USDC proxy `0x534b2f3A21130d7a60830c2Df862319e593943A3` and implementation `0x21240161521D6854BE79F7D3a0A65c6BeDDB42fb` at block **70656749**, hash `0x96f8f0f61b5539041fec44717744928050d82abe70cade0e196bd973b311aa60`. Both source records have `codeMatched=true` and `truncated=true`. The snapshot digest is `0x1a82917355266316fec0b7f8e0155310838bc3363b5aba3364b9b8fe2728d5d0`.

| Stage | Payment receipt | Expected `ProviderPaid` |
| --- | --- | --- |
| Commander plan | [Receipt](https://testnet.monadvision.com/tx/0x70a14415d0639c8551d9d07a6e59b253a3f8a2627aab41dfbfe88e0eacbdc549) | Agent `2201`, `fromCash=10000`, `fromCredit=0` |
| ABI specialist (`abi-reader-v1`) | [Receipt](https://testnet.monadvision.com/tx/0xfc1de5233ac40779dad74b94241f21d5c000e30ee391ee22c106e643accb55cd) | Agent `2201`, `fromCash=10000`, `fromCredit=0` |
| Independent Reviewer | [Receipt](https://testnet.monadvision.com/tx/0x7e04ee06cd6452789e04a811d6586530a8468c78b3b9d5e054b3e5be5cfe6153) | Agent `2201`, `fromCash=10000`, `fromCredit=0` |

The transaction case analyzes [this USDC transfer](https://testnet.monadvision.com/tx/0xc801dd8afa572df307f50af02df5b2de8a7408e14124d08c52c7ab7b8a53a447) at its receipt block **70283233**. Its saved calldata decodes `transfer(address,uint256)` with amount `40000`; its receipt has one captured `Transfer` log. `130640` gas × `102000000000` wei per gas = `13325280000000000` wei (**0.01332528 MON**). The evidence retains its three separate model-payment receipts too.

These snapshots are RPC/source-service observations with hashes, not Merkle/state proofs. Source matching and model review do not establish a full security audit. Proxy storage is distinguished from implementation storage; missing admin/role configuration stays unknown. In the same evidence file, `address-before-scope-correction` remains **manually rejected**, even though the model Reviewer accepted it: its supplementary risk table overinterpreted ABI event declarations as proof of capabilities.

### E: expired signed transactions

| Branch | Canonical nonce-voiding receipt | Preserved result |
| --- | --- | --- |
| Recover original request | [Nonce 26](https://testnet.monadvision.com/tx/0xa554ef4977f552951c0496d1acfc0a7370c27f16af5b673a8ac9cbae30930400) | Old payment `0`; earlier `30000` charges remain; no new model calls/payments. |
| Explicitly stop original request | [Nonce 36](https://testnet.monadvision.com/tx/0x7f2887e82baeaf087bab286f02745b5dc690d3e2fcd36b9cfded20d989cd05dd) | Old payment `0`; earlier `20000` charges remain; terminal `Cancelled`; no new model calls/payments. |

These are zero-value wallet self-transfers signed at the same nonce as the original payment. The code preserves uncertainty when the original payment wins the race or canonical confirmation is unavailable. Test-wallet MON funding is recorded operational setup; the product does not provide gas sponsorship.

## Minimal review path

### 1. Inspect the committed records without running a service

Run from the repository root. Use Node.js 22 or newer; `npm ci` installs the locked dependencies once. The following command reads historical A–D JSON and recomputes the research digests. It does not contact a network or dispatch an inference call. It checks consistency of the saved records, not their external provenance. For F–H, inspect the report fields and matching test source above; the [local acceptance guide](autonomous-collaboration-20261014.md) provides their reproduction path.

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keccak256, toUtf8Bytes } from 'ethers';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const base = 'frontend/acceptance/';
const audit = read(base + 'monad-hosted-20261012/final-canonical-audit.json');
const finance = read(base + 'monad-hosted-20261012/financial-evidence.json');
const chain = read(base + 'chain-lookup-20261013/execution-evidence.json');
assert.equal(audit.chainId, '10143');
assert.equal(audit.passed, true);
for (const taskId of ['12', '13', '16', '17']) {
  const t = audit.tasks.find(t => t.taskId === taskId);
  assert.equal(t.loan.status, 'Repaid');
  assert.equal(t.loan.principalOutstandingRaw, '0');
  assert.equal(BigInt(t.settlement.principalRepaidRaw) + BigInt(t.settlement.feeRepaidRaw), BigInt(t.settlement.repaidRaw));
  console.log('task', taskId, t.models[0].responseModel, t.settlement.txHash);
}
const a = audit.agents.find(a => a.agentId === '2202');
assert.deepEqual([a.repayments, a.creditScore, a.creditTier, a.debtRaw], ['3', '710', 'A', '0']);
const parent = audit.autonomyParents.find(p => p.requestId === 'f4a39eb2-8161-4cb6-86fc-62f15f0530b9');
assert.deepEqual(parent.successfulTaskIds, ['16', '17']);
assert.equal(finance.replay.noNewTransactions && finance.replay.noNewModelRequests, true);
const abort = audit.abortedTasks.find(t => t.taskId === '14');
assert.deepEqual([abort.loanStatus, abort.countedAsRepayment, abort.countedAsDefault], ['ClosedByRefund', false, false]);
assert.equal(abort.unknownInvocations[0].supplierCostKnown, false);
assert.equal(abort.refund.amountRaw, '120000');
assert.equal(abort.termination.rewardReturnedRaw, '150000');
for (const name of ['address-final', 'transaction-final']) {
  const c = chain.cases[name], r = c.result.mission.research;
  const core = { version: r.version, chainId: r.chainId, observedAt: r.observedAt, records: r.records };
  assert.equal(keccak256(toUtf8Bytes(JSON.stringify(core))), r.digest);
  assert.equal(c.result.status, 'Succeeded');
  assert.equal(c.receipts.length, 3);
  assert.ok(c.receipts.every(r => r.status === 1 && r.chargedRaw === '10000'));
  assert.ok(Object.values(c.replay).every(v => v === true));
  assert.ok(r.records.filter(r => r.kind === 'address').every(r => r.source.codeMatched));
  console.log(name, r.digest, c.result.chargedRaw);
}
assert.equal(chain.cases['address-before-scope-correction'].manualAcceptance.passed, false);
console.log('Saved-record consistency checks passed; failed and rejected cases remain present.');
JS
```

### 2. Compare the public receipts with those records

Use the explorer links above to inspect transaction status, emitting contract, event arguments, and block hashes. The deployed addresses recorded by the canonical audit are:

| Contract | Monad Testnet address |
| --- | --- |
| AgentAccount | [0x275414a20bF00746A9B8A691e04224092a690c32](https://testnet.monadvision.com/address/0x275414a20bF00746A9B8A691e04224092a690c32) |
| CreditManager | [0x83e82a5c330E8c029C5F72C4f73dABCabac7fB02](https://testnet.monadvision.com/address/0x83e82a5c330E8c029C5F72C4f73dABCabac7fB02) |
| TaskEscrow | [0x3d2161d2d0f30254ecA5f9Cca323f69b5E76BA41](https://testnet.monadvision.com/address/0x3d2161d2d0f30254ecA5f9Cca323f69b5E76BA41) |
| ERC8004Adapter | [0xEBF8eB6eBf724e25eC69c5b3d4C0796E18913548](https://testnet.monadvision.com/address/0xEBF8eB6eBf724e25eC69c5b3d4C0796E18913548) |
| Canonical IdentityRegistry | [0x8004A818BFB912233c491871b3d84c89A494BD9e](https://testnet.monadvision.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| Canonical ReputationRegistry | [0x8004B663056A597Dffe9eCcC1965A193B7388713](https://testnet.monadvision.com/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |

Optional direct RPC check, using only public read methods:

```bash
curl --max-time 30 --silent --show-error \
  --header 'Content-Type: application/json' \
  --data-binary @- https://testnet-rpc.monad.xyz <<'JSON'
[
  {"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]},
  {"jsonrpc":"2.0","id":2,"method":"eth_getTransactionReceipt","params":["0xf3cdfecb48f6ec12e0a848538730b19df75a5d252f36e52efda309f5b35c0802"]},
  {"jsonrpc":"2.0","id":3,"method":"eth_getBlockByNumber","params":["0x43622ed",false]}
]
JSON
```

Expected chain ID is `0x279f`; the Task 17 receipt has `status=0x1`; the requested research block is 70656749 with the hash listed in D. Check raw logs against the event ABIs linked above. A provider timeout is not a contradictory task result; it means the fresh read was not completed.

### 3. Review the mechanism boundaries with controlled tests

The following focused regression command uses controlled model/RPC dependencies and local temporary journals, not real supplier calls or public-chain transactions:

```bash
npx --no-install tsx --test --test-concurrency=1 \
  packages/pi-loop/test/autonomy.test.ts \
  services/hosted-agents/test/chain-lookup.test.ts \
  services/hosted-agents/test/goals-reconciliation.test.ts
```

These cover bounded decisions/spending and replay, source mismatch/unavailability and block reorganization, public-field projection, and signed-payment replacement/recovery races. They establish controlled mechanism behavior, not another real-network business run. For deeper **local Anvil** contract coverage, [abort-settler.test.ts](../scripts/test/abort-settler.test.ts) exercises sealed-ledger/refund preconditions and original-transaction recovery with controlled inference; [contracts/TEST_PLAN.md](../contracts/TEST_PLAN.md) maps the financial contract tests. Their setup requires Foundry and, for the workflow fixture, the documented Arena environment. Test counts from different or overlapping batches are not added into a single total here.

## Preserved failures and unproven scope

The [initial observed audit](../frontend/acceptance/monad-hosted-20261012/observed-audit.json), [first final browser attempt](../frontend/acceptance/monad-hosted-20261012/browser-final-attempt-1/final-report.json), failed autonomy parents, Task 14 Unknown, and failed/manually rejected chain-analysis cases are retained. The [final browser report](../frontend/acceptance/monad-hosted-20261012/final-report.json) belongs to the later successful historical attempt; it does not replace those earlier records. Oct 15 additionally retains the [failed budget goal](../frontend/acceptance/monad-collaboration-20261015/fallback-failed-public-summary.json) and [task 18 failure/default](../frontend/acceptance/monad-collaboration-20261015/automatic-failed-public-summary.json), including their charges and actual financial outcomes.

This guide does not claim extension-wallet end-to-end acceptance, natural multi-round repair for the successful escrowed real-model tasks, standard x402 interoperability, gas sponsorship, arbitrary-chain/URL access, a full security audit, or an independently registered ERC-8004 identity for every built-in specialist role. The Oct 14 external fixture remains local. The Oct 15 hiring report now establishes paid external execution using the separately admitted Monad Agent `1999`; it does not establish an unrestricted provider marketplace. Historical browser evidence used real hosted HTTP and owner signatures supplied by an acceptance wallet in Node; controlled browser screenshots elsewhere must not be treated as fresh chain evidence. The Reviewer is a separate model invocation, not an external authority or a guarantee of factual correctness.
