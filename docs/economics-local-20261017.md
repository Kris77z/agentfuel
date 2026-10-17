# Economic decisions and accounting: local verification, 2026-10-17

This records local verification of the working-tree changes based on `c56664ebcefcf70f17cbf8afadef1ebc52dcbc05`. It is separate from the [Oct 17 public Monad evidence](monad-hackathon-live-20261017.md). No production deployment, public-chain transaction, paid vendor call, or historical journal migration was performed for this change.

## Checks

| Check | Result and scope |
| --- | --- |
| `npm run review:check` | Passed: documentation/evidence checks, 33 evidence negative tests, root/frontend types, 64 controlled mechanism tests, and 11 standalone SDK consumer tests. No Foundry/Docker or business credentials required by this entry point. |
| `npm test --workspace @agentfuel/frontend` | 96 passed. Includes controlled frontend and local chain fixtures; does not establish public-service availability. |
| New browser accounting scenarios | 10 passed across desktop/mobile. Covers partial/negative/micro-unit figures, stale refresh, Agent/owner switches, revision refresh, 401 handling and the login cookie barrier after closing Finance. The later history-gap display was rechecked on both viewports. |
| Selector and workflow | 22 cases covered: 20 passed initially; two corrected cases passed focused reruns. Legacy workflows retain their original wall-clock behavior; economic snapshots additionally respect chain time. An ethers `Result` assertion was normalized to compare actual returned values. |
| Hosted economic decisions | 56 passed, including refusal before paid planning, financing fees turning an affordable task into a loss, model-specific task eligibility, zero-cash game replenishment, and actual paid/runtime planner allocation. The 39 controller cases also pass in the review entry point. |

Counts above overlap; they are not added into a headline total. Browser responses and model endpoints are controlled fixtures, not fresh real-vendor evidence.

## Main-agent integration acceptance

The main agent exercised these five test files serially with local Anvil and Docker:

```sh
node --import tsx --test --test-concurrency=1 \
  services/hosted-agents/test/task-executor.test.ts \
  services/hosted-agents/test/recovery-snapshot.test.ts \
  services/hosted-agents/test/metered-recovery.test.ts \
  services/hosted-agents/test/autonomy-live.test.ts \
  services/hosted-agents/test/autonomy-game-live.test.ts
```

The initial batch passed 19 of 20 cases. The remaining assertion compared ethers proxy objects rather than their returned policy values; it was corrected to compare plain arrays and the affected case passed its focused rerun. No production behavior was relaxed to make that assertion pass. The tests cover unchanged policy/nonce on rejection, two actual task wallets, paid/Unknown recovery, same-task allowance recovery, both game subsidy types, manual refueling, and a paid two-task autonomous loop.

Additional accounting assertions use the actual execution journals and settlement results:

- A real local credit-funded task earns `150000`, costs `120000`, borrows `80000` and pays `12000` in fees: operating result `18000`, even though the settled loan's current principal and fee are both zero. Principal is not subtracted twice.
- A real hosted reward task is paused, replenished with a manual game and resumed under the original task. The accounting endpoint records `150000` task revenue once, zero USDC inference spend, zero USDC game subsidy, and `8192` granted tokens. A direct ledger redemption outside hosted history is not fabricated as a hosted entry. Accounting reads leave the hosted database and signer nonce unchanged.

The focused reproduction commands are:

```sh
node --import tsx --test --test-name-pattern='two hosted agents' services/hosted-agents/test/task-executor.test.ts
node --import tsx --test --test-name-pattern='real service replenishes' services/hosted-agents/test/autonomy-game-live.test.ts
```

The game integration test now writes its generated summaries to a cleaned temporary directory. It previously overwrote the dated Oct 14 summary during ordinary test runs. That generated change was restored byte-for-byte; all **416 pre-existing deployment and historical evidence files** matched the before-work SHA-256 baseline after verification.

See [the economic contract](ECONOMICS.md) for fee rounding, successful-completion assumptions, coverage limits, unpriced native gas/token costs, and legacy recovery behavior. Accounting is derived from retained financial records; missing or conflicting evidence yields a partial view and `netOperatingRaw: null`.
