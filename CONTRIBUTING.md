# Contributing to Tabby

Start with the [architecture](docs/ARCHITECTURE.md) and [verification guide](docs/VERIFICATION.md). Each public implementation claim should have a source-code entry point and dated evidence that another developer can inspect.

## Set up and choose checks

For a first review, use Node.js 22+ and npm: `npm ci --ignore-scripts`, then `npm run review:check`. The command checks documentation, saved evidence and negative cases, root/frontend types, selected controlled mechanism tests, and an isolated offline SDK consumer without wallet/model credentials, Docker or Foundry. It loads no operator configuration; it does not establish fresh chain/vendor execution or a network sandbox. See the [review scope](docs/REVIEW.md).

For full protocol development, use Node.js 22.19+, npm, and Foundry. A complete coding-task run also needs Docker and the pinned Python image. Follow the [root setup](README.md#run-locally); the zero-key demo uses an isolated Anvil chain and explicitly mocked inference/registries.

| Change | Appropriate validation |
| --- | --- |
| README, architecture, module guides | `npm run docs:check` and review the linked source/evidence |
| Saved acceptance checker or evidence relationships | `npm run evidence:check` and `npm run test:evidence`; retain failed attempts and dated scopes |
| TypeScript services or shared types | `npm run typecheck:all` and the affected workspace tests |
| Solidity financial behavior | `forge test --root contracts --offline`; review invariants and affected integrations |
| Full local payment/verification/settlement path | `npm run test:demo` with local Anvil and Docker |
| Economic lifecycle and independent publisher/Worker integration | `npm run review:integration` with Foundry, Docker and the pinned Python image; see the [economic loop](docs/economic-loop-local.md) and [consumer guide](examples/publisher-worker/README.md) |
| UI behavior and wallet interactions | Frontend unit/browser checks described in [frontend README](frontend/README.md) |
| Monad recovery or real-model integration | Explicit opt-in configuration and dated evidence; use the relevant runbook |

`npm run test:all` covers workspace tests, including tests that need local Anvil/Docker. It does not establish that Foundry, script integrations, browsers, public forks, or real vendors were exercised. State which group ran and whether the model/chain was real or controlled.

## Preserve the economic invariants

- Bind chain, identity, assigned task, asset, provider, and request digest through quotation, authorization, payment, and settlement.
- Preserve raw integer asset units. Test USDC has six decimals; allowance microcredits, model tokens, quote prices, and loan fees are separate quantities.
- Recover the original UUID, route, payment handle, and signed transaction. Do not replace an uncertain paid request with a new purchase.
- Keep solver tools separate from hidden-test verification and settlement authority. Personal-goal model review is not proof of task income or repayment.
- Financial settlement and best-effort reputation feedback have different failure handling. Preserve pending feedback and settled financial history.
- Keep owner-scoped sessions, agent locks, budget reservations, and public projections intact. Browser input and model output cannot choose private RPC endpoints or operator keys.

## Document a change

Update the affected module guide with its API, authority, units, and recovery behavior. Explain why a non-obvious invariant exists in a short source comment; avoid comments that repeat the code.

Record acceptance date, chain ID, tested revision, real/controlled model mode, expected invariant, confirmed receipts or exact local assertion, and unresolved boundary. Keep failed attempts and extra funding visible. Do not add overlapping test batches into one headline number.

Publish only needed, redacted evidence. `demo-output/`, keys, authenticated RPC URLs, sessions, provider secrets, private IPC, and raw signed transaction journals stay outside Git. Public JSON receipt summaries and transaction hashes are appropriate when their schema excludes those fields.

CI runs `review:check` on pull requests and main/master pushes after dependency installation. Its explicit test list excludes public-chain, paid-model and Anvil/Docker integrations. A separate `local-economy` job prepares Foundry and the pinned Docker image, then runs `review:integration` against temporary Anvil chains and controlled model responses. Neither job deploys services or reads production configuration. Keep these verification scopes separate.

The [documentation checker](scripts/check-doc-links.mjs) validates the public guide set and accepts additional Markdown paths as arguments. Use repository-relative links so documents work on GitHub and in a clone.

## Propose work

Use a focused branch and a pull request describing the concrete change and validation. Report failures with enough context to reproduce them. Use [GitHub Issues](https://github.com/Kris77z/tabby/issues) for bugs; exclude credentials and live signing journals.

The project's original code is [MIT-licensed](LICENSE). Preserve upstream notices and the provenance recorded in [attribution](docs/ATTRIBUTION.md).
