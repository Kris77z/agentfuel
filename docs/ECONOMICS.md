# Task decisions and operating accounts

Tabby separates **affordability**, **task economics**, and **recorded operating results**. Credit can make a task affordable without making it profitable. A game award can fund work without becoming customer revenue. This implementation adds local code and controlled checks; it does not change the public deployment or establish a new Monad business run.

## Before accepting a task

The host owns the economic policy. Task text and model output cannot set rewards, prices, or fees. The [selector](../packages/pi-loop/src/selector.ts) evaluates trusted task/provider combinations using escrow observations; the [workflow](../packages/pi-loop/src/workflow.ts) applies the decision before accepting or buying inference. The [economic calculation](../packages/pi-loop/src/economics.ts) uses integer settlement-asset units:

```text
protocol fee       = floor(task reward × task protocol fee bps / 10000)
task net revenue   = task reward − protocol fee
credit principal   = max(execution price − available cash, 0)
borrower fee bound = floor(credit principal × allowed fee bps / 10000)
completion margin  = task net revenue − execution price − borrower fee bound − planning cost
```

The default new hosted-task policy requires a margin of at least **1 raw USDC unit** (0.000001 USDC) and bounds the borrowing rate at **1500 bps**. A signed credit authorization above that bound cannot be broadcast through this path. The allowance package's full purchase price is an expense, even if not all allowance credits are consumed. The principal is already included in the execution price; subtracting it again would double-count the cost.

This is a **successful-completion calculation with conservative known costs**, not a probability-weighted expected profit or a guarantee of success. MON gas, operator supplier invoices, and the opportunity cost of subsidized tokens have no trusted USDC conversion here. Reward-token execution therefore has zero direct USDC purchase price, but is not described as having zero economic cost. Budget, credit eligibility, task deadlines and recovery constraints still apply independently.

New autonomous sessions also check task economics before buying a planner call. The actual child selector applies the policy to the task it will execute, including the allocated planning cost. An available profitable task cannot authorize execution of a different loss-making task.

The policy is saved with new execution snapshots. Existing snapshots without it retain their previous bindings and recovery behavior. A saved payment, pending settlement or uncertain model response is not replaced with a new task to satisfy a newer admission rule.

## After execution

The owner-authenticated accounting endpoint and Finance panel derive a separate view from retained hosted execution records. They do not rewrite journals, replay tasks, or equate a wallet balance with income. A complete view means complete **within those retained records and declared asset scope**, not complete lifetime books or a fresh chain audit.

| Category | Treatment |
| --- | --- |
| Settled task revenue | Successful settlement `residualRaw + repaidRaw`, already net of protocol fees. The portion used to repay debt is still earned task revenue. |
| Inference and service spend | Recorded net charges, including paid planning and delegated work; a parent aggregate and its children must not both be charged. |
| Borrowing fees | Separate from inference spend. Closed loans can report zero current principal/fee, so those balances do not establish the original borrowing expense. |
| Refunds | Shown separately; already-net charges must not have the same refund subtracted twice. |
| Game USDC awards | Subsidy, excluded from task revenue and the operating result. |
| Reward tokens | Separate token quantities, never added to USDC. |
| Deposits and initial funding | Capital/funding flows, excluded from task revenue. |
| Borrowed principal | Financing flow; neither revenue nor an additional expense on top of the paid service price. |
| Failed or unresolved executions | Retain known charges; no invented revenue or zero-cost assumption. Missing evidence makes coverage partial. |

For example, a successful task pays 100 USDC with a 2 USDC protocol fee. Inference costs 10 USDC, funded by 2 cash and 8 credit, and the borrowing fee is 1 USDC. Settlement returns 89 to cash and repays 9. Task revenue is **98**, execution expense is **10**, borrowing expense is **1**, and the operating result is **87**. Adding a 5 USDC game subsidy changes available funding but does not change that operating result. Depositing 20 USDC is also not revenue.

Where settlement, payment, nested execution, or refund evidence is missing or inconsistent, the view labels the gap and withholds a complete operating result. It does not manufacture historical profit from current balances. The [verification guide](VERIFICATION.md) retains the separate dated public business evidence.

## Review and scope

The [Oct 17 local verification record](economics-local-20261017.md) lists the exercised layers, corrected test failures and actual local accounting assertions. It does not replace the public-chain evidence.

Start with [the review entry](REVIEW.md) and run `npm run review:check` on Node.js 22+. The controlled economic tests exercise rejection, raw-unit arithmetic, funding and fee boundaries, subsidy/capital classification, duplicate accounting, and incomplete records. Local chain and browser integration checks are distinct from this offline entry point; their fixtures do not establish real model or public-chain performance.
