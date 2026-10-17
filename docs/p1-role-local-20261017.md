# P1 role accounting and subsidy runway acceptance — October 17, 2026

GPT-6.1 sol agents at ultra reasoning effort implemented and independently audited the backend, consumer CLI and browser bridge. The main agent reviewed the final implementation and ran the tests and fresh local-chain acceptance below. This is local code acceptance; it establishes no new production deployment, public Monad transaction, authenticated supplier invoice or measured commercial profit.

Baseline: `3a56e3234e20b56aac5d14a51891b99ee8670152`. The changes were uncommitted working-tree additions at acceptance. Reports fingerprint the evaluated source; the baseline commit alone does not contain this implementation.

## Saved fresh evidence

| Report | Scope | SHA256 |
| --- | --- | --- |
| [Offline role and subsidy demonstration](acceptance/p1-role-offline-final-20261017.json) | Five synthetic tasks, ten bound journal files, thirteen assertions and nine source hashes. Uses pre-generated synthetic signed local payment envelopes, but performs zero signing, broadcasting, RPC or model calls. The fixed scenario clock is not a public execution timestamp. | `08ec58577c19b48b11ae8901d63e5cb7e1dfccca58882684bb758cb30f1f11a3` |
| [Fresh local economic lifecycle](acceptance/p1-role-economic-loop-final-20261017.json) | Owned Anvil `31337`, real local payments/settlements, controlled models and pinned Docker evaluation. Eleven predicates and thirteen operating-source hashes; ran 14:14:20–14:15:00 UTC. | `d233b5af3d3d40d1651c6786b901eb5522cbf2f199bd826719acc76f8e59f275` |

The main agent matched the final reports’ saved source hashes to the final source. Both reports were saved as new files without replacing prior evidence. The local launcher confirmed removal of its private directory, owned containers, processes and IPC directory.

The initial [offline report](acceptance/p1-role-offline-20261017.json) and [local-chain report](acceptance/p1-role-economic-loop-20261017.json) are retained as earlier observations from this round. Final review found that missing grant evidence could still produce a numeric subsidy-budget remainder. The corrected version withholds the remainder, shortfall and budget runway, adds an independent regression, and was rerun into the final reports above. The earlier source hashes identify that earlier implementation, not the final one.

## Financial results and limitations

The fresh local chain ended with these raw six-decimal USDC amounts:

| Item | Amount | Treatment |
| --- | --- | --- |
| Agent task revenue | `600000` | Settled task earnings. |
| Supplier gross receipts | `600000` | Five original bound payments, including the later-refunded Unknown call. |
| Supplier refunds | `120000` | Returned against the original payment. |
| Supplier net receipts / Agent net service cost | `480000` | Same transfer seen from each role; never summed as additional system revenue. |
| Borrowing fees | `13800` | Agent expense; credit-vault fee receipt, not platform-wallet revenue. |
| Agent operating result | `106200` | `600000 − 480000 − 13800`, before unrecorded costs. |
| Startup capital / final cash | `40000` / `146200` | Capital is not operating revenue. |

This Anvil fixture has zero protocol fees and zero game grants. Nonzero protocol-fee derivation, subsidy distribution, mixed tokens, costs and declared operator books are exercised by the separate offline example. That example reports Agent contribution `1205000`, derived protocol fees `100000`, supplier net receipts `180000`, declared platform contribution `-500000` and declared supplier contribution `50000`. These are controlled inputs, not production earnings.

The offline platform example issues `400000` in grants and explicitly attributes `150000` of recipient consumption. Consumption attribution is not charged again. With a total budget of `1000000` and no unpaid commitments, the distribution budget remaining is `600000`. Tests separately exercise unpaid commitments and budget shortfalls. Startup capital has no established platform-subsidy source. Paid and reward token usage cannot establish remaining reward tokens without provenance.

Cash consumption and subsidy distribution use different explicit rates. In the offline owner preview, spendable cash `700000` at `100000` per day gives seven days; game-distribution budget remaining `200000` at `50000` per day gives four days. Missing rates yield unknown horizons; zero burn does not assert infinite survival. All full-profit fields remain unknown where invoices, hosting, native gas or other complete costs are unavailable.

On the fresh local chain, reserve `120000` and assumed cash burn `120000` per day produce:

| Read point | Spendable cash | Hypothetical horizon | Whole tasks |
| --- | --- | --- | --- |
| After three settled tasks | `146200` | `105264000` ms (29.24 hours) | 1 |
| After paid failure | `26200` | `18864000` ms (5.24 hours) | 0 |
| While original payment is Unknown | Unknown | Unknown | Unknown |
| After original full refund | `26200` | `18864000` ms (5.24 hours) | 0 |

Every report read preserved the exact journal and input digests, cash, provider balance, wallet nonce, quote count and model-call count. Reports did not redispatch the Unknown call or alter execution policy.

## Verification

- The main agent's new focused suite passed **28/28**: independent accounting/history/HTTP audit, operator CLI and offline demonstration, recursive browser projection, and actual reader-to-proxy compatibility including Unknown liabilities.
- Existing hosted service, HTTP, finance HTTP and browser-proxy regression tests passed **40/40**. A separate existing accounting/strategy HTTP and projection regression run passed **8/8**. These overlap the broader review set and are not added into one headline total.
- `npm run operating:demo -- --report <new absolute file>` passed all thirteen assertions.
- `npm run economics:local -- --report <new absolute file>` passed all eleven predicates on Node `v22.23.2`, Foundry `1.8.1`, Docker `28.1.1`, and the pinned Python image recorded in the report.
- Final `npm run review:check` passed: local documentation links, saved evidence consistency, **33** evidence-checker negative cases, root/frontend TypeScript, **128** selected controlled tests, and the standalone SDK’s **11** tests plus smoke check. The final selected set includes all **23** independent role-audit tests and the **8** consumer/demo/CLI tests, including the added missing-grant case and signed goal/planner receipts. `git diff --check` passed.

Review corrections included fresh finance identity/time checks, incomplete-history fee totals, receipt-group consistency, separate cash/subsidy burn assumptions, role-specific cost boundaries and partial-cash browser compatibility, and withholding subsidy-budget balances when grant evidence is incomplete. The historical receipt reader verifies the original bound workflow and signed payment envelope rather than current provider configuration; it does not re-query chain receipts or authenticate supplier invoices.

## Preserved scope

The main agent compared **545** pre-existing dated evidence, acceptance and deployment files against a pre-edit SHA256 manifest. All were unchanged. Manifest digest: `e65500a45f24fd753b19a6fb86beab667d1d7a9630ab4b8edf45c9fc7e4d2975`.

Production services, deployment configuration, historical execution records, runtime admission and existing accounting/strategy calculations were not changed. No production wallets, paid providers or public-chain transactions were used. The new API and browser bridge are read-only; operator cost declarations are accepted only by the offline CLI. This round adds no Finance-page interaction and performs no commit or push.

See [the operating report guide](OPERATING-REPORT.md) for input schemas, calculations and reproduction.
