# P1 read-only strategy acceptance — October 17, 2026

The decision → actual result → next hypothetical choice loop was implemented by GPT-6.1 sol agents at ultra reasoning effort and independently reviewed and exercised by the main agent. This acceptance is for local code, controlled observations and an isolated Anvil chain. It does not establish a new production deployment or a new public Monad execution.

Baseline revision: `a84ee9422e4d84d77fc11625785e08abb96a5e8a`. The accepted changes are an uncommitted working-tree addition to that revision. The reports fingerprint the evaluated source files; they do not claim that the baseline commit already contains P1.

## Saved fresh evidence

| Report | Scope | SHA256 |
| --- | --- | --- |
| [Controlled feedback demonstration](acceptance/p1-strategy-offline-20261017.json) | Seven synthetic tasks, fourteen bound journal files, nine assertions, nine source hashes; no RPC, model call, signing or production access. Its fixed `observedAt` is the synthetic scenario clock, not a public execution timestamp. | `74b7862a8c126bc1b9382043645ef7d066869576fd0de7a16124775dfc7f82f9` |
| [Fresh economic lifecycle and advice reads](acceptance/p1-strategy-economic-loop-20261017.json) | Owned Anvil `31337`, real contract payments and pinned Docker evaluation, controlled model responses, ten advisory-source hashes. Ran 07:47:29–07:48:12 UTC on October 17. | `1977d74f7d2bcedc46fd8827efce1208e81ccb1d7aea6f10faea9b0ac3692a0b` |

The main agent checked every recorded advisory-source hash against the final implementation. Both report destinations were created exclusively; neither replaced an earlier record. The Anvil launcher confirmed cleanup of its private directory, owned processes, containers and IPC directory.

## Confirmed behavior

The offline example initially prefers route A. An original `80000` execution estimate followed by an actual `120000` charge creates a `40000` cost buffer, changing the next preference to route B. A separate route C's `70000` failed-task loss raises its next profit requirement and also changes the preference to B. These are controlled examples of deterministic feedback, not production loss rates or calibrated success probabilities.

Cash reserves and debt commitments stay separate from income and profit. A candidate cannot preserve cash by counting new credit as cash. The absolute-profit floor and the margin floor on net task revenue are checked independently, using integer arithmetic. Game subsidies, owner capital and borrowed principal do not become task revenue. Net costs are not charged for their refunds a second time.

The fresh local-chain run produced these observations, in raw six-decimal USDC units:

| Advice read | Cash | Cash after reserving `120000`, before new work | Result |
| --- | --- | --- | --- |
| After three settled profitable tasks | `266200` | `146200` | Original selected predictions are recovered; execution cost deviation is zero; the hypothetical next cash task is eligible. |
| After paid hidden-test failure | `146200` | `26200` | Exact failed-task loss remains `120000`; reserve and profit requirements reject the hypothetical choices. |
| While original paid request is Unknown | `26200` | `0` after withholding its `120000` reservation | Advice is blocked; operating result remains `null`. |
| After original full refund | `146200` | `26200` | Liability is resolved; known failed loss remains `120000` and the operating result is `106200`. |

Every advice read preserved the exact local journal digest, input digest, cash, wallet nonce, provider balance, quote count and model-call count. Final accounting stayed at task income `600000`, inference expense `480000`, borrowing fees `13800`, operating result `106200`, startup capital `40000`, and no new owner topup or game subsidy. There were exactly five provider payments, including the original later-refunded Unknown payment.

## Validation

- `npm run review:check` passed: documentation links, saved evidence checks, 33 evidence-checker negative cases, root/frontend TypeScript, 92 selected controlled tests, and the standalone SDK's 11 tests and smoke check. The selected tests include the P1 history/math, authenticated HTTP, browser proxy and offline demonstration checks.
- An additional existing-regression run passed all 40 tests in hosted `service.test.ts`, `http.test.ts`, `finance-http.test.ts`, and frontend `hosted-agents-proxy.test.ts`. These overlap other checks and are not added into a single headline count.
- The independent P1 audit was then extended to 21 tests. The main agent reran all 21 with those 40 existing regression tests: 61/61 passed against the final source. The added cases verify combined pending/debt reserves, actual-cash-first funding, negative cash shortfalls, conservative credit fees/caps, and a paid planning cost of `7` allocated exactly once (`1000 - 120 - 7 = 873`). The one-command review list includes this extended audit file for subsequent runs.
- `npm run strategy:demo -- --report <new absolute file>` passed all nine demonstration assertions.
- `npm run economics:local -- --report <new absolute file>` passed all nine financial/read-only predicates using Node `v22.23.2`, Foundry `1.8.1`, Docker `28.1.1`, and the pinned Python image declared in the report.
- `git diff --check` passed.

Independent review corrected finance identity/freshness checks, future-history contamination, original route/domain binding, conflicting loss evidence, serialized rejected decisions, planning attribution, and finance-read concurrency before acceptance. Tests verify that a concurrent reservation invalidates the stale cash snapshot, and that an incomplete autonomous parent cannot supply a confirmed planning allocation.

## Preserved scope

The main agent compared 542 pre-existing dated evidence, acceptance and deployment files with a pre-edit SHA256 manifest; all 542 were unchanged. The baseline manifest digest was `d0b743e7f5856614ec30071085ca98606c31820227939ee516263250f204431e`. No runtime selector, historical admission, saved policy, production service, deployment configuration or public-chain history was changed. No commit or push was performed for this P1 implementation request.

The API and the existing browser proxy expose preview calculations. No Finance-page interaction or automatic execution was added. `GET` has no live candidate source; `POST` accepts explicitly owner-hypothetical candidates. Missing, truncated or incompatible observations remain visible as gaps. Native gas, token opportunity cost and probability-weighted profitability are not established by this acceptance. See [the strategy guide](STRATEGY-ADVICE.md) for formulas, defaults and reproduction.
