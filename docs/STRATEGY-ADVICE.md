# Read-only strategy advice

Tabby can compare an original task decision with its recorded result, then preview the next choice using conservative costs and profit requirements. This is a separate read model: it does not update execution settings, select a live task, recover a request, purchase inference, or write an admission journal.

## Reproduce the feedback loop

With Node.js 22+ and the locked dependencies installed:

```sh
npm run strategy:demo
npm run review:check
```

The [offline demonstration](../scripts/strategy-advice-demo.ts) creates temporary controlled execution records, reads them through the history projection, and checks how a cost overrun and a paid failure change the next hypothetical choice. It also checks cash reserves, credit, absolute profit, margin requirements and unresolved payments. It needs no wallet, model credentials, Foundry or Docker. These are controlled observations, not a measured production success rate.

For real local payments and settlement, `npm run economics:local` also reads the fresh Anvil execution journals after profitable work, a paid failure, an Unknown payment and its original refund. Each advice read checks that journal bytes, cash, wallet nonce, quote requests and model calls stay unchanged. Its candidates are explicitly hypothetical. See the [local economic lifecycle guide](economic-loop-local.md) for prerequisites and the boundaries of this integration check.

## Original decision and actual result

The [history reader](../services/hosted-agents/src/strategy-history.ts) joins retained accounting entries to their original task executor and workflow journals. A successful task's original decision lives in the workflow session; the task executor's rejection record does not substitute for it. Missing old predictions stay missing. Existing snapshots and recovery bindings are never backfilled.

The projection exposes original execution, planning and borrowing cost estimates, the original minimum reward requirement, confirmed task income, realized costs, execution cost deviation, and failed-task losses. It distinguishes an exact loss from a known lower bound when evidence is incomplete. Planning costs are allocated from the original autonomous step; parent totals and child costs are not charged twice.

Revenue, refunds, borrowing fees, principal, subsidies and capital retain the [operating accounting rules](ECONOMICS.md#after-execution). In particular, a net charge already includes refunds, and borrowed principal is not an extra expense. Unknown settlement or borrowing fees remain unknown. Game awards and reward tokens are not customer revenue.

## Next-choice calculation

For each owner-supplied hypothetical candidate, the [pure evaluator](../services/hosted-agents/src/strategy-advice.ts) applies:

```text
cost buffer         = maximum confirmed positive execution overrun in a comparable cohort
adjusted execution  = hypothetical execution quote + cost buffer
failure cushion     = maximum confirmed failed-task loss in that cohort
net task revenue    = reward - floor(reward × protocol fee bps / 10000)
completion profit   = net task revenue - adjusted execution - planning - borrowing fee
required profit     = max(absolute minimum, ceil(net task revenue × margin bps / 10000))
                      + failure cushion
```

The failure cushion raises the threshold for new work. It is not charged again as a new task's actual expense. Eligible candidates are ranked by `completion profit - required profit`, with deterministic tie breaking. A loss can therefore change the next preferred route without inventing a success probability.

Comparable observations must share the problem, provider, tier, funding mode and original route binding. The binding is an opaque digest of the frozen execution context; a reused provider name alone does not establish the same route. Obtain it from the history response when constructing a preview. Missing or incompatible samples produce an evidence gap, not an assumed zero overrun. The digest identifies local retained context; it is not an external attestation or a current provider quote.

Default advisory requirements retain one per-run budget as cash, require at least 1 raw USDC unit of profit, and require a 1000 bps margin on net task revenue. These are explicit preview defaults, not calibrated economic policy or a change to the runtime's existing admission rule. An owner can supply all three numeric requirements in a preview.

Confirmed cash is reduced by outstanding commitments and known outstanding debt before applying the reserve. Debt is reserved as a cash obligation, not charged again as an operating expense. Credit is never added to cash. Cash-first payment semantics mean a borrowing candidate cannot preserve earmarked cash by pretending to borrow while actual account cash remains. Planning needs cash. Incomplete liabilities, unavailable cash, missing comparable evidence and unverified credit capacity prevent a recommendation. MON gas, reward-token opportunity cost and success probability remain outside the priced scope.

## Owner API

The hosted API uses the existing owner session, origin checks and `private, no-store` responses:

- `GET /agents/:id/strategy-advice`: original decisions, realized outcomes, cash and default requirements. With no current candidate source, the recommendation is explicitly unavailable.
- `POST /agents/:id/strategy-advice`: read-only calculation with an optional `policy` and `candidates` array. It accepts the closed schema in [strategy types](../services/hosted-agents/src/strategy-types.ts), labels every candidate `owner-hypothetical`, and persists nothing.

Policy amounts and prices are decimal strings in raw six-decimal USDC units. `minMarginBps` is also a string. Candidate task/provider IDs, costs, rewards and deadlines are assumptions for the preview; the response does not certify availability, allowlists, an executable quote, or authorization to spend. No front-end or production rollout is part of this change.

The existing browser session can use the same methods at `/api/hosted/agents/:id/strategy-advice`. The proxy enforces the existing cookie and origin checks, validates preview fields, and projects the response through a recursive public whitelist. Previews allow at most 32 candidates; browser requests also retain the 8192-byte body limit, so larger previews must be split. The direct hosted endpoint allows 64 KiB. The Finance page has no new controls in this change; these are API and reproduction entry points.

The API does not export private journal objects, model responses, endpoint URLs, key paths or signed transactions. Historical evidence remains bounded to retained hosted records, with explicit truncation and missing-record gaps. A complete local accounting result is not a lifetime ledger or a fresh Monad business run.

The [October 17 P1 acceptance](p1-strategy-local-20261017.md) links the fresh offline and Anvil reports, source fingerprints, tested boundaries and preserved-history checks.
