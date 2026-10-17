# Documentation map

The repository contains current guides and dated engineering/acceptance records. Start with the current guides to understand the implementation; use dated records to inspect a particular experiment or historical decision.

## Current public guides

| Question | Read |
| --- | --- |
| Where is the short review and one-command check? | [Five-minute review](REVIEW.md): latest evidence, source route, `review:check`, submission/date boundaries and deeper checks. |
| How can I integrate the SDK outside this workspace? | [Standalone SDK example](../examples/sdk-standalone/README.md). |
| What does Tabby solve, and what can I run? | [English overview](../README.md), [中文介绍](../README.zh-CN.md) |
| Where is each behavior implemented? | [Architecture and code map](ARCHITECTURE.md) |
| What evidence supports a claim? | [Verification, amounts, receipts and replay checks](VERIFICATION.md) |
| Where are automatic games, paid external collaboration and budget downgrade verified? | [Latest 2026-10-17 public business evidence](VERIFICATION.md#latest-public-monad-execution--2026-10-17); [2026-10-15 public Monad results](monad-collaboration-live-20261015.md): external hiring, downgrade and token-funded automatic task recheck passed, with explicit remediation and original failures preserved. [2026-10-14 local acceptance and reproduction](autonomous-collaboration-20261014.md) retains its controlled scope. |
| Where is Monad deployed, and how is it maintained? | [Public deployment checks](monad-vps-20261014.md); [VPS deployment and state migration](../deploy/monad-vps/README.md) |
| Is the current public instance ready for a live demo? | [Oct 17 public rehearsal and evidence](monad-hackathon-live-20261017.md): fresh credit, games, external hiring, model fallback and presenter-wallet execution; final deployment and readiness checks are recorded there. |
| How should I change and validate the implementation? | [Contributing](../CONTRIBUTING.md) |
| Which components are original or adapted? | [Attribution](ATTRIBUTION.md) |

## Runbooks and implementation details

- [Zero-key local protocol demo](demo-runbook.md).
- [Local hosted workspace with real models](local-hosted-testing.md).
- [Core metered runtime and bounded autonomy](core-runtime.md).
- [Hosted configuration and HTTP API](hosted-agents.md).
- [Magpie version, no-retry patch, and reproduction](magpie-gateway.md).
- [Backend service startup](backend-runtime.md).
- [Sponsored game runner](gamefi-runner.md) and [free practice games](free-arena.md).
- [Contract/transaction lookup and expired-payment handling](chain-lookup-acceptance-20261013.md).
- [Brand assets and interface provenance](tabby-brand.md).

Runbooks retain Chinese operational detail. Real-model or public-chain execution requires explicit private operator configuration; it is distinct from the zero-key local demo.

## Dated evidence

| Date | Scope |
| --- | --- |
| Oct 16, 2026 | [Public demo readiness audit](monad-demo-readiness-20261016.md): current preparation gaps, local corrections, verification scope and a seven-step rehearsal script; no new public business execution. |
| Oct 17, 2026 | [Public hackathon rehearsal](monad-hackathon-live-20261017.md) and [evidence index](../frontend/acceptance/monad-hackathon-20261017/README.md): real Monad execution, independent verification, recovery and presenter preparation. |
| Oct 15, 2026 | [Public Monad real-model collaboration](monad-collaboration-live-20261015.md), [public report guide](../frontend/acceptance/monad-collaboration-20261015/README.md): external hiring, a separate model-fallback recheck and task 19's automatic token branch passed; original fallback failure and task 18's production failure/default retained. |
| Oct 12, 2026 | [Real models and Anvil](local-real-acceptance-20261012.md); [local services connected to Monad](monad-hosted-acceptance-20261012.md) |
| Oct 13, 2026 | [Personal goals and workspace](dashboard-goal-workspace-20261013.md); [fixed-block Monad lookup](chain-lookup-acceptance-20261013.md) |
| Oct 14, 2026 | [Execution-scene design](tabby-agent-scenes-20261014.md); [scene/UI acceptance](../frontend/acceptance/tabby-scenes-20261014/README.md) using labeled fixtures/local integrations |
| Oct 14, 2026 | [Automatic games, external hiring and model downgrade](autonomous-collaboration-20261014.md): local Anvil + controlled LLM responses; [game/task and replenishment report](../frontend/acceptance/autonomous-collaboration-20261014/automatic-game.json), [external hire report](../frontend/acceptance/autonomous-collaboration-20261014/external-hire.json), [goal model downgrade report](../frontend/acceptance/autonomous-collaboration-20261014/model-fallback.json) |

These dates describe recorded work. The Oct 12–13 real-network records preserve the historical `0526070` implementation scope; the Oct 14 collaboration reports validate the new paths locally. Oct 15 records fresh public Monad execution under its own outcomes and costs. A screenshot or controlled fixture does not establish a new testnet transaction, supplier call, public deployment, or earlier submission date.

## Design and development history

[Implementation status](implementation-status.md) preserves the development ledger, including failed attempts. Historical local `demo-output/` paths are operator archives, not files shipped in a fresh clone. Public proof links for selected claims are collected in [VERIFICATION](VERIFICATION.md).

The original [reference architecture](../AGENT_CREDIT_ARCHITECTURE.md), [engineering plan](../AGENT_CREDIT_ENGINEERING.md), [risk/MVP decisions](../AGENT_CREDIT_RISK_AND_MVP.md), and [track narrative](../AGENT_CREDIT_TRACK_NARRATIVE.md) preserve design intent and dated scope changes. Planned capabilities are not an implementation checklist completed by default.
