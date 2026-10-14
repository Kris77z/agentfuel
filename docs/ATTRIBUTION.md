# Attribution and provenance

Tabby's original code is distributed under [MIT](../LICENSE). This does not replace the notices or licenses of dependencies, fonts, source adaptations, or third-party material.

| Component | Source and role | Repository record |
| --- | --- | --- |
| Magpie | [yetone/magpie](https://github.com/yetone/magpie), pinned `v0.1.814`; a small patch disables implicit retry of uncertain paid calls. | [Lock/hashes](../scripts/magpie.lock.json), [patch](../scripts/magpie-no-retry.patch), [MIT notice](../scripts/magpie-UPSTREAM-LICENSE), [integration](magpie-gateway.md) |
| Pi | `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`, pinned npm dependencies `1.0.1`, used for bounded model/tool execution. | [Package manifest](../packages/pi-loop/package.json), [solver integration](../packages/pi-loop/README.md) |
| Specialist prompts/configuration | Adapted monad-rebel ABI, gas, token, transaction and yield definitions. Internal roles and configured external adapters reuse those definitions; each external provider's identity is checked separately from its role name. | [Provenance](../services/hosted-agents/src/specialists/monad-rebel/provenance.json), [catalog](../services/hosted-agents/src/specialists/catalog.ts), [external discovery and ranking](../services/hosted-agents/src/external/registry.ts) |
| Workspace components and workflow | Adapted Agora Mesh / monad-rebel terminal components, styles, onboarding flow, and Commander/Timeline patterns. Tabby integrates them with its hosted execution, payment, budgets, recovery and public projections. | [Component migration](frontend-agora-migration.md), [goal integration](dashboard-goal-workspace-20261013.md) |
| Landing layout and decorative asset | Adapted the Oberon layout and motion structure from the recorded source snapshot; copied `oberon-wave.png` remains a decorative asset. Current execution/rewards/reputation images are generated concepts, not execution evidence. | [Source, asset and adaptation record](frontend-oberon-landing.md), [wave asset](../frontend/public/landing/oberon-wave.png) |
| Fonts and brand | Inter/Geist Mono notices are retained. The selected Tabby mark and export process are recorded separately. | [Brand assets](../frontend/public/brand/tabby/README.md), [Inter notice](../frontend/public/brand/tabby/Inter-LICENSE.txt), [workspace font notice](../frontend/components/hosted/fonts/LICENSE.txt), [brand decisions](tabby-brand.md) |
| Contract test utilities | Bundled forge-std supplies Foundry test helpers. | [Upstream project documentation](../contracts/lib/forge-std/README.md) and bundled notices |

These references credit reuse. They do not assert blanket rights to redistribute an upstream design or asset under Tabby's MIT license. Retain each component's own notice and verify its terms when extracting it for another project.

## Names and historical records

The repository and product are **Tabby**. **InferCredit** names the financial protocol. Internal `@agentfuel/*` names and saved-request identifiers preserve compatibility with the original AgentFuel implementation.

Dated reports distinguish testnet execution, real vendor calls, controlled models, local chains, and synthetic UI fixtures. Private archives are excluded from Git; the [verification guide](VERIFICATION.md) links published receipt summaries and source code.
