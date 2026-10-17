# Review Tabby

Tabby is Agent economic execution infrastructure on Monad: task-bound credit, paid inference, independent task settlement, identity/reputation, and durable recovery share the same request history. The hosted arena is its reference application for games, work and paid collaboration. The selected hackathon track is [Trust, Identity & AI](https://hackathon.monad.xyz/tracks/trust-identity-ai).

## Five-minute reading route

1. Read the [architecture's two economic paths](ARCHITECTURE.md#two-economic-paths): escrow tasks can earn income and repay credit; personal goals spend cash on model calls and external services.
2. Inspect the [Oct 17 business evidence table](VERIFICATION.md#latest-public-monad-execution--2026-10-17), then open a linked JSON summary. Follow its original request, cash/credit units, payment, task settlement and replay counters.
3. Follow one implementation: [SDK payment and recovery](../packages/sdk/README.md), [bounded autonomy](../packages/pi-loop/src/autonomy.ts), [external hiring](../services/hosted-agents/src/external/hiring.ts), or [settlement waterfall](../contracts/src/TaskEscrow.sol).
4. Run the checks below. For application integration, use the [standalone SDK example](../examples/sdk-standalone/README.md).

## One command, no business credentials

With Node.js **22+** and npm, install the locked dependencies once, then run:

```sh
npm ci --ignore-scripts
npm run review:check
```

The review command checks local documentation links, saved evidence consistency, evidence-checker negative cases, root/frontend TypeScript, three controlled mechanism test files, and a standalone SDK consumer outside the workspace. It needs no wallet, model key, Docker or Foundry. The mechanism tests inject model/RPC/execution dependencies and write temporary local journals. This is a selected offline check set, not a network sandbox or a complete security/integration test suite. The standalone consumer packs the SDK and installs its exact dependencies from the npm cache into a temporary directory, then checks public declarations and a controlled loopback example; it cleans up afterward. A cache miss fails with explicit preparation instructions, without an online fallback. Dependency installation downloads packages; the review steps make no external business calls and load no operator environment files.

For machine-readable evidence results:

```sh
node scripts/check-acceptance-evidence.mjs --json
```

Each record identifies its source file/checksum, environment, original request and checked facts. The checker retains Oct 14 Anvil checks and adds eight Oct 17 summaries: both two-task credit loops, external hiring, budget downgrade, automatic USDC game/task, token supplement, settlement recovery, and a separately labeled read-only resource snapshot. It checks raw-unit arithmetic, model/usage and external-provider bindings, saved receipt references, original-request relationships and unchanged replay counters. Checksums identify the bytes inspected; they are not an external attestation. Saved canonical flags and private response/artifact digests are not independently verified.

## Dates, failures and deeper checks

The [original submitted overview](https://youtu.be/9Xxnqi52Kvo) remains available. The [Oct 15 video update record](video-update-20261015.md) states that locked submission fields were unchanged. Oct 15–17 business runs, videos and repository improvements are dated post-submission progress; this repository does not establish that organizers accepted them for scoring or backdate them into the original submission.

[Oct 15 results](monad-collaboration-live-20261015.md) retain the failed budget goal and task 18 default, including charges and explicit remediation. [Oct 17 results](monad-hackathon-live-20261017.md) retain verifier gas top-up, the same settlement transaction, and legacy Docker reevaluation. A later successful request does not erase either history. The Oct 17 credit loops are two explicit sequential requests, while the automatic case is a bounded parent that obtains game resources and runs a task.

For deeper verification, choose the appropriate [contribution checks](../CONTRIBUTING.md#set-up-and-choose-checks): Foundry contract tests; Anvil/Docker protocol integration; browser tests; or separately authorized real-model/Monad runs with fresh dated evidence. `review:check` does not execute those layers, re-query chain receipts, establish current public availability, audit custody/security, or verify supplier invoices. [Deployment and migration](../deploy/monad-vps/README.md) remain the operational contract.
