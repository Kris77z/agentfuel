# Agent, platform and supplier operating reports

This read-only layer separates each role's recorded contribution, declared operator costs and hypothetical funding runway. It does not change execution policy or saved requests. An Agent's service expense is a supplier's receipt, so adding the role totals would double-count internal transfers. The report does not claim consolidated external revenue or full profit.

## Reproduce and inspect

```sh
npm run operating:demo
npm run operating:demo -- --report /absolute/new-report.json
npm run review:check
```

The demo creates bounded synthetic execution journals in a temporary directory, reads them through the production report reader, checks their bytes and removes the temporary directory. It includes nonzero protocol and borrowing fees, refunds, cash grants, mixed token usage, duplicate payments, invalid receipts, unresolved payments and explicit operator declarations. The fixtures include pre-generated synthetic signed payment envelopes for local chain `31337`, with no private keys. The demo performs no RPC, model call, transaction signing or broadcast and loads no production configuration. The report contains source hashes; these identify inspected bytes, not authenticated invoices.

For real local transactions with controlled models, run `npm run economics:local`. Its isolated Anvil/Docker lifecycle reconciles supplier receipts and refunds with the Agent's books and checks that report reads leave cash, provider balances, wallet nonce, model calls and original journal bytes unchanged. See the [dated acceptance](p1-role-local-20261017.md) for actual results and limits.

## Role and funding boundaries

| View | What it can establish | What remains unknown |
| --- | --- | --- |
| Agent | Settled task revenue minus net service charges and borrowing fees, using the existing retained-history accounting rules. | Complete profit after hosting, gas and other unrecorded costs. Supplier wholesale costs are not an additional Agent expense. |
| Platform | Protocol fees derived from the original task reward/rate and matching successful settlement; separately, known credit fees settled into the credit vault. | Actual treasury receipt, complete platform costs and profit. Credit-vault fees are not labeled platform-wallet income. |
| Supplier | Original bound payment receipts, refunds and net receipts, grouped by the original route, chain, account, asset, recipient, service and model. | Upstream invoice costs and full supplier profit. A current provider name cannot replace historical routing evidence. |
| Cash subsidy | Game USDC grants recorded for this Agent; startup funding remains unattributed capital. | Which fungible cash expenditure consumed a grant and how much grant cash remains. |
| Token subsidy | Recorded reward tokens granted and total inference tokens used, in separate token units. | Paid-versus-reward consumption allocation and remaining reward tokens. No USDC conversion is invented. |

Borrowed principal and owner deposits are funding, not revenue. Principal is not subtracted again after charging the purchased service. Refunds are exposed separately but already netted in service cost. Failed work retains its known costs. The role reader bounds journal reads and returns at most 200 supplier receipts; truncation preserves aggregate Agent costs and reports the unattributed difference. Truncated, unreadable, mismatched or uncertain evidence stays partial; known subtotals are distinct from complete totals. `actualProfitRaw` stays `null` for all roles when full books are unavailable.

## Owner report and hypothetical runway

The owner-authenticated hosted API exposes `GET /agents/:id/operating-report`. `POST` on the same path accepts only the following optional, flat preview fields:

```json
{
  "reserveCashRaw": "200000",
  "recurringCostRaw": "50000",
  "burn": { "amountRaw": "100000", "windowMs": 86400000, "taskCount": 2 },
  "subsidyBudgetRaw": "600000",
  "subsidyBurn": { "amountRaw": "50000", "windowMs": 86400000 }
}
```

Amounts are integer six-decimal USDC units. `recurringCostRaw` is an assumed additional cost for the retained-history period shown in `costPeriod`; it is not an automatically measured monthly bill. The adjusted contribution remains hypothetical. These inputs are never persisted as evidence, budgets, policies or invoices.

```text
spendable cash = max(current cash − pending reservations − outstanding debt − reserve, 0)
cash shortfall = max(pending reservations + outstanding debt + reserve − current cash, 0)
horizon ms    = floor(spendable cash × burn window ms / burn amount)
full tasks    = floor(spendable cash × assumed tasks per window / burn amount)
```

Credit capacity is excluded from cash. Finance must match the Agent and be fresh. Unknown liabilities or missing cash evidence withhold a finite horizon. No rate gives `unknown`; a zero rate gives `zero-burn` with no finite horizon, never an assertion of infinite survival. The rates are explicit assumptions, not forecasts calibrated from success probability or future task demand.

The owner's subsidy budget is a hypothetical **total game-distribution budget for this Agent's retained history**. Its remainder deducts recorded game USDC grants, not startup capital or attributed consumption. `subsidyBurn` measures the assumed future award-distribution rate; `burn` measures Agent cash consumption. They are independent. The budget view cannot establish remaining money in a platform treasury or grant consumption inside the Agent.

The browser bridge forwards the report through the existing authenticated same-origin proxy, uses a recursive output whitelist and disables caching. This round adds API access and reproducible examples; it does not add a new Finance-page interface.

## Offline platform and supplier declarations

An operator can supply sanitized financial observations to an offline CLI:

```sh
npm run operating:report -- --input /absolute/sanitized-observation.json --report /absolute/new-report.json
```

The input must be an explicit regular JSON file, at most 1 MiB. Output files use exclusive creation and are never overwritten. No environment files, relay journals or private upstream responses are discovered or uploaded. An example input is:

```json
{
  "version": 1,
  "source": "operator-declared",
  "role": "platform",
  "subjectId": "example-platform",
  "period": { "from": "2026-10-16T00:00:00.000Z", "to": "2026-10-17T00:00:00.000Z" },
  "evidenceDigest": "0000000000000000000000000000000000000000000000000000000000000000",
  "receiptsRaw": "100000",
  "refundsRaw": "0",
  "costsRaw": "200000",
  "subsidyGrantedRaw": "400000",
  "subsidyAllocatedRaw": "150000",
  "subsidyCommittedRaw": "100000",
  "subsidyBudgetRaw": "1000000",
  "cashRaw": "1000000",
  "reservationsRaw": "100000",
  "debtRaw": "100000",
  "reserveCashRaw": "200000",
  "burn": { "amountRaw": "100000", "windowMs": 86400000 },
  "subsidyBurn": { "amountRaw": "50000", "windowMs": 86400000 }
}
```

Replace the example values and digest with the operator's observations. The digest is a reference, not invoice authentication. `role` may also be `supplier`. Such declarations are never accepted by the owner HTTP preview as actual financial evidence.

```text
reported contribution = receipts − refunds − non-subsidy costs − cash grants issued
unallocated grant     = grants issued − explicitly attributed recipient consumption
distribution budget   = max(total budget − grants issued − unpaid commitments, 0)
```

Attributed consumption is a subset of issued grants and is not another cash expense. Unpaid commitments reduce available distribution budget; they are not already-paid costs. The operator must include outstanding cash obligations in `reservationsRaw` or `debtRaw` when supplying a cash snapshot. Missing required cash components withhold cash runway. The report labels all results `operator-declared`, keeps full profit unknown, and never merges these private books into a public owner's view.

See [task economics](ECONOMICS.md), [strategy feedback](STRATEGY-ADVICE.md) and the [review entry](REVIEW.md) for the adjacent layers.
