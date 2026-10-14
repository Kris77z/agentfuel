<img src="frontend/public/brand/tabby/brand-square.png" alt="Tabby logo" width="88" />

# Tabby

**Reputation you can spend.** An agent workspace with task-backed inference credit on Monad.

Tabby connects the cost of doing work to the payment for delivering it. An agent accepts an escrowed task, purchases inference with cash and approved credit, executes through Pi, and submits its result to an independent verifier. Settlement repays the advance and fees, credits the remaining income, and records delivery and repayment history through ERC-8004. That history informs the next task's funding conditions.

The same workspace supports cash-funded personal goals: writing, analysis, code generation, and evidence-backed Monad contract or transaction analysis, with specialist execution and a separate model review stage.

[中文介绍](README.zh-CN.md) · [Architecture and code map](docs/ARCHITECTURE.md) · [Verification and public receipts](docs/VERIFICATION.md) · [Contributing](CONTRIBUTING.md)

## Why this exists

Task income arrives after delivery; inference must be purchased before delivery. Agent operators otherwise coordinate funding, model access, execution, verification, and repayment separately. Tabby makes these steps one auditable lifecycle with explicit authority and spending limits.

InferCredit, Tabby's financial protocol, advances execution funding against an **already escrowed reward**. Reputation affects eligibility, limits, and fees; it does not replace the task's financial backing. Credit is paid directly to an allowlisted provider instead of becoming freely withdrawable cash.

## Two workflows, one workspace

| Workflow | What the agent does | Funding and verification |
| --- | --- | --- |
| **Earn from verified work** | Select an eligible coding task, accept it, buy model access, solve it with Pi, and optionally continue to another task within hard limits. | Cash first, then approved task-backed credit. A separate Docker Arena checks hidden tests; a separate settler authorizes onchain distribution. |
| **Complete a personal goal** | Plan the user's goal, choose built-in specialists, produce staged outputs, and review or revise the result. Contract addresses and transaction hashes trigger bounded Monad RPC/Sourcify research. | Cash-funded model calls. Model review and explicit output checks determine delivery; this path does not create task income, loans, or repayment reputation. |

Sponsored poker rewards offer another resource source: test USDC or agent-bound inference credits. Four free practice games are also included. Game play does not borrow against task credit. See the [game runner](docs/gamefi-runner.md) and [practice API](docs/free-arena.md).

## What has been demonstrated

These are dated runs with tracked evidence, not promises about every future run. Monetary examples use **6-decimal test USDC on Monad Testnet, chain 10143**.

| Demonstration | Recorded result | Inspect the evidence |
| --- | --- | --- |
| **Real Kimi K2.6 and K3, credit to settlement** · Oct 12 | Task 12 and Task 13 each used 0.04 cash + 0.08 credit to buy a 0.12 inference allowance. Independent verification accepted the work; 0.092 repaid principal and fees, leaving 0.058 cash and zero debt. | [Canonical audit](frontend/acceptance/monad-hosted-20261012/final-canonical-audit.json), [run explanation](docs/monad-hosted-acceptance-20261012.md) |
| **Bounded autonomous continuation** · Oct 12 | One new run completed Task 16 and Task 17, then stopped at its two-task limit. Agent 2202's audited cumulative state was three repayments, zero defaults, 710/A, 0.07224 cash, and zero debt. | [Task 17 settlement](https://testnet.monadvision.com/tx/0xf3cdfecb48f6ec12e0a848538730b19df75a5d252f36e52efda309f5b35c0802), [audit](frontend/acceptance/monad-hosted-20261012/final-canonical-audit.json) |
| **An unknown paid call reaches a recorded resolution** · Oct 12 | Task 14 remained Unknown until an explicit operator decision sealed its allowance, compensated the original 0.12 payment, closed the loan by refund, and independently returned the escrowed reward. It was not counted as a success or repayment. | [Resolution and receipts](docs/VERIFICATION.md) |
| **Evidence-backed contract analysis** · Oct 13 | A successful USDC-proxy analysis used a saved fixed-block research snapshot, bytecode-matched Sourcify material, and three paid K2.6 calls: planning, ABI specialist, and model review. Replaying its UUID added no payment or model call. | [Public evidence JSON](frontend/acceptance/chain-lookup-20261013/execution-evidence.json), [lookup implementation and limits](docs/chain-lookup-acceptance-20261013.md) |

The [verification guide](docs/VERIFICATION.md) maps each claim to source code, public files, transaction links, and reproducible checks. It retains rejected outputs, failed attempts, additional wallet funding, and the distinction between onchain payment evidence and provider-reported token usage.

## Design choices worth inspecting

- **Enforced spending authority.** Identity binding, task assignment, provider allowlists, quote price ceilings, signed task-credit authorizations, and agent budgets constrain each purchase. User goals and model decisions cannot expand those permissions.
- **Atomic money movement.** Cash-plus-credit payment and reward settlement each execute in a transaction. Reputation feedback is best-effort with pending/retry handling, so a feedback failure does not undo settlement.
- **Separate evaluation boundaries.** Pi's public sample tool assists the solver; Arena's hidden tests and the independent settler decide coding-task settlement. A personal-goal model reviewer is a separate invocation on the same selected route, not an independent factual oracle.
- **Recovery preserves the original purchase.** UUIDs, payment handles, immutable route/research snapshots, and signed transaction journals are reused. An unknown upstream result pauses the original request; it does not justify another paid call or an automatic refund.
- **Observable execution.** The workspace projects recorded financial and execution events. The Tabby cat visualizes those events; an animation reaching a node cannot mark a task successful.

See the [architecture](docs/ARCHITECTURE.md) for the trust boundaries and the [protocol README](contracts/README.md) for enforced invariants.

## Why Monad

Monad is the shared settlement and reputation layer for the demonstrated economic loop. The same testnet hosts task escrow, provider payment, credit, reward distribution, and ERC-8004 identity/feedback. Receipts connect each funded task to its outcome, while the next underwriting decision reads the resulting history.

| Contract | Monad Testnet address |
| --- | --- |
| CreditManager | [0x83e82a5c330E8c029C5F72C4f73dABCabac7fB02](https://testnet.monadvision.com/address/0x83e82a5c330E8c029C5F72C4f73dABCabac7fB02) |
| AgentAccount | [0x275414a20bF00746A9B8A691e04224092a690c32](https://testnet.monadvision.com/address/0x275414a20bF00746A9B8A691e04224092a690c32) |
| TaskEscrow | [0x3d2161d2d0f30254ecA5f9Cca323f69b5E76BA41](https://testnet.monadvision.com/address/0x3d2161d2d0f30254ecA5f9Cca323f69b5E76BA41) |
| ERC8004Adapter | [0xEBF8eB6eBf724e25eC69c5b3d4C0796E18913548](https://testnet.monadvision.com/address/0xEBF8eB6eBf724e25eC69c5b3d4C0796E18913548) |

Addresses and the canonical registry pair are recorded in the [tracked audit](frontend/acceptance/monad-hosted-20261012/final-canonical-audit.json). The current runtime, model gateway, and verifier are operated services; their custody and decision authority are explicit in the architecture.

## Run locally

Use **Node.js 22.19+**, npm, Foundry (`forge` and `anvil` on PATH), and a running Docker daemon. Solidity is pinned to 0.8.24. Initial setup downloads dependencies, the compiler, and the pinned Python image.

```sh
git clone https://github.com/Kris77z/tabby.git
cd tabby
npm ci
forge build --root contracts --skip-lint
docker pull python:3.12-alpine@sha256:4c47124a8391cb7a9f571164147d154777cf012a4ece5f86097130d7a4478111
npm run demo
```

This complete local protocol demo needs **no wallet secret or model API key**. It creates an isolated Anvil chain, deploys the contracts, runs the Underwriter/Relay/Arena/settler path, and saves a new output directory. Registries and inference responses are explicitly mocked; real local transactions are not evidence of a new Monad or paid-model run. [Detailed demo runbook](docs/demo-runbook.md).

For the complete workspace with **labeled sample data**, without a wallet or backend:

```sh
node scripts/preview-dashboard.mjs
```

Open `http://localhost:3033/`. This isolated preview renders the actual workspace components, substitutes an in-memory session, and blocks external connections. It is a UI fixture, not evidence of a chain transaction or model call. [Preview implementation](scripts/preview-dashboard.mjs).

For a visual-only preview of the protocol dashboard:

```sh
npm run dev:fixture --workspace @agentfuel/frontend
```

Open `http://127.0.0.1:3000/advanced`. This fixture does not configure the hosted backend for `/dashboard`; the frontend shows its actual unavailable state there until that service is configured.

For the hosted workspace with real Kimi models on a local chain, follow the separate [local hosted setup](docs/local-hosted-testing.md) and [Magpie build/launcher guide](docs/magpie-gateway.md). The current real-model launcher is macOS-only. The recorded Monad integration and recovery procedure are documented in the [Monad acceptance report](docs/monad-hosted-acceptance-20261012.md). Those modes require explicit operator configuration and are separate from the zero-key demo.

## Validate a change

```sh
npm run docs:check
npm run typecheck:all
npm run test:all
forge test --root contracts --offline
```

`test:all` runs workspace tests. It excludes the full Foundry suite, script integrations, browsers, public-chain forks, and paid-model runs. Some workspace tests need local Anvil/Docker and cached artifacts. Use the [verification guide](docs/VERIFICATION.md) and [contribution guide](CONTRIBUTING.md) to select checks appropriate to a change; historical test counts are not presented as a current CI badge.

## Find the implementation

| Area | Entry point |
| --- | --- |
| Funding, task escrow, identity/reputation adapter | [contracts](contracts/README.md) |
| Eligibility, score/tier, task authorization | [Underwriter](services/underwriter/README.md) |
| Quote, payment confirmation, inference delivery/refund | [Provider Relay](services/provider-relay/README.md) |
| Original payment handle and signer abstraction | [SDK](packages/sdk/README.md) |
| Tool execution and bounded task continuation | [Pi loop](packages/pi-loop/README.md) |
| Owner-scoped agents, goals, budgets and recovery | [Hosted service](services/hosted-agents/README.md) |
| Hidden-test controller and settlement process | [Arena](services/arena/README.md) |
| Canonical registry client | [ERC-8004 tools](packages/erc8004/README.md) |
| Wallet login, task workspace, finance, games | [Frontend](frontend/README.md) |

## Scope and project links

Public hosting and an extension-wallet end-to-end walkthrough remain separate validation work. The project does not claim a decentralized inference/verifier network, an external expert marketplace, standard x402 interoperability, arbitrary web/shell tools for goals, public LP deposits, or unattended profitability. InferScore measures recorded delivery and repayment, not general model intelligence.

- [Configured product endpoint](https://monad.tabbyai.xyz/) — public availability is not established by the historical local-service testnet runs.
- [Product overview video](https://youtu.be/9Xxnqi52Kvo) — the submitted 34-second overview; inspect task outcomes through the public receipts and verification guide.
- [How Tabby uses Kimi](https://gist.github.com/Kris77z/e96d742861173717ef3eda1071cc5dcc) — the published integration article.
- [Documentation index](docs/README.md) — current guides, operational runbooks, and dated design/acceptance records.
- Maintained by [Kris77z](https://github.com/Kris77z). Concrete reproductions are welcome through [GitHub Issues](https://github.com/Kris77z/tabby/issues).

Tabby is the product; InferCredit is its financial protocol. npm package names, saved request keys, and some historical documents retain the original `agentfuel` identifier for compatibility.

## License and attribution

[MIT](LICENSE) for the project's original code. Dependencies, fonts, and adapted third-party material retain their own licenses and notices; see [attribution](docs/ATTRIBUTION.md). Private keys, authenticated RPC URLs, sessions, raw signed transaction journals, and local `demo-output/` are excluded from Git.
