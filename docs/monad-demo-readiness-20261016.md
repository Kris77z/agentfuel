# Monad 公网演示准备审计 · 2026-10-16

**状态：公网业务演示的前置条件尚未补齐，本轮没有重新执行 Monad 交易或真实模型调用，也不作上线就绪声明。** 2026-10-15 的提交 `ce1409d` 保存了外部 Agent 雇佣、同一目标预算降档、自动游戏 token → 独立验收任务收入三条真实闭环；那些结果仍是各自日期的历史实证，不能作为今天目录、资金、quota 和运行健康的即时证明。

本轮范围为本地源码与公开证据核对、匿名公网 GET、既有只读 Monad 探针，以及主 Agent 的 Chrome 产品路径检查。探针通过私有 RPC 文件建立连接，不导出其内容；未访问 VPS 私有运行数据、未创建公网 Agent、未付款、未调用付费模型、未广播交易。生产路径和历史恢复约束仍以 [项目规则](../AGENTS.md) 与 [部署运行手册](../deploy/monad-vps/README.md) 为准。

## 当天观察与尚未完成的核对

| 项目 | 已观察事实 | 尚不能据此得出的结论 |
| --- | --- | --- |
| 公网产品入口 | Chrome 已实际打开首页和 `/onboarding`。Dashboard 登录步骤等待用户通过 Rabby 连接钱包并签名。 | 尚未完成当天登录后的 Agent、余额、额度与交付浏览验收。 |
| 匿名 Hosted API | `/api/hosted/agents` 返回 `401 / HOSTED_AUTH_REQUIRED`，符合鉴权契约。 | 匿名请求不能证明指定 owner 的 Agent、quota、余额或后端业务可用性。 |
| 高级页面与网络 | `/advanced` 曾出现 `ERR_TUNNEL_CONNECTION_FAILED`；curl 请求超时，`/api/dashboard` 一次 25 秒内未返回。 | 没有收到足够的服务端故障证据，不能将浏览器隧道失败或超时直接写成服务 down。 |
| VPS 只读健康 | 现有 SSH helper 缺少所需的 root-password 输入，未取得当天 VPS 健康报告。 | 昨日六个 units active 的报告不能替代今天的 systemd、网关、RPC 和供应商可用性核对。 |
| Monad 只读探针 | `2026-10-16T13:43:44.459Z` 启动既有 `monad-hosted-preflight.ts`，确认 chain10143 后在部署核验阶段遇到 `ECONNRESET`，报告 `complete=false`。交易数、模型请求均为0。 | 未完成全量角色余额、任务目录和资金池核验；不能把未读到的数据当作0，也不能当作新业务验收。 |
| 原运营页面 API | 旧 `/api/arena/gamefi`、`/api/tasks/runs` 公网请求返回 Origin 拒绝；[guard](../frontend/lib/gamefi-origin.ts) 仅接受 loopback。 | 这些旧运营路由不是 Hosted 游戏主入口；其 `403` 不能说明 `/api/hosted/*` 游戏失败。 |

2026-10-15 的 [最终部署报告](../frontend/acceptance/monad-collaboration-20261015/deployment-public-summary.json) 观察时间为 `2026-10-15T09:46:53.035341+00:00`，包括六个 units active、页面 `200`、鉴权边界、源码 hash 与原历史保护。本轮没有生成可替代它的当天 VPS 报告。

## 确定的演示阻断与准备门槛

### 可执行任务目录

仓库中可核验的已知目录任务 **12–19 均已结算或终止**：[Task12–17](monad-hosted-acceptance-20261012.md)、[Task18/19](monad-collaboration-live-20261015.md)。Task19 的 [创建记录](../frontend/acceptance/monad-collaboration-20261015/task-19-creation.json) 保存期限 `1792143489`，即 **`2026-10-16T09:38:09Z` / 北京时间17:38:09**；本次核对时已过期。

[运行模板](../scripts/monad-hosted-runtime.ts) 使用原 journal 与有效目录的最大期限；重启不会新开24小时窗口。今天的新接单、任务信用和自主经营演示需要先准备新的 **Open、未分配、已真实托管报酬且期限充足** 的支持题型，再用既有 `append-tasks` 流程审计加入目录。Task18/19 创建报告里的 `catalogAppended=false` 是创建时点；昨日后续 `Applied` 记录仍有效，只是目录已消费且期限已过，并非没有加入目录。

追加目录仍须检查当前所有原请求：只允许终态或严格验证的未签名、零消费 provisioning 暂停；不能宽泛放过付费、Unknown、Running 或 Queued。维护时按运行手册一起停止三个 Monad units、冷备、执行受保护的迁移，再在原目录 `--recover`。不修改旧请求、旧 deadline、付款、钱包路径或恢复绑定，也不影响 Tempo。

### Agent、owner quota 与真实资金

| 前置项 | 当前已知限制 | 演示前应确认 |
| --- | --- | --- |
| 健康信用身份 | Agent2364 保留 default1、`PROTOCOL_DEFAULT`，不可借贷；昨日 guardian 解冻没有清除违约或恢复授信。 | 信用演示选链上身份正确、未冻结、无阻断违约且授信条件满足的 Agent。需要展示 B→A 时，事先准备两次真实还款的 B 档 Agent；不能手改评分。 |
| 游戏 owner quota | 2364 的 owner 已用 **3/3** 赞助 slots；新建同 owner Agent 不会获得新额度。昨日 global 为4，不代表今天仍是4。 | 现场读取持久 owner/global 额度，使用有剩余 quota 的 owner；自动单次最多2局，不能重置额度或许诺必胜。 |
| 授权预算 | 2364 已花130000，累计上限140000，只余 **10000**；其最终现金160000并不等于可再次授权消费160000。 | 分别确认实际 cash、累计剩余预算、单次预算、policy 与允许借贷设置。修改预算需要明确用户授权，不能由 Agent 自行提高。 |
| MON 与入账 | 生产新 Agent 初始 cash=0，没有产品 Gas 赞助。钱包有 USDC 不等于 Account cash 已入账。 | Agent 钱包及相关执行角色有足够 MON；准备测试 USDC，完成钱包 → Account deposit，并确认 canonical 回执和入账余额。 |
| 现金目标 | 外部雇佣 Agent2363 昨日最后 cash30000；降档 Agent2365 最后 cash0。 | 当天重新读取余额；为新目标准备实际 Account cash 和覆盖规划、专家、复核及可能修订的预算。设置预算本身不会充值。 |
| Provider 与奖励资源 | 外部服务需要已批准的独立身份、目录及可支付服务；游戏和奖励额度需要实际赞助资源及供应商响应。 | 核对已批准目录、服务身份/报价、赞助池、奖励 ledger、模型调用配置与角色 Gas；不能仅凭服务卡片或昨日响应判定可运行。 |

2364 的资金、解冻、default、quota 和失败保留证据见 [昨日 recheck 说明](monad-collaboration-live-20261015.md#successful-token-only-recheck-and-explicit-guardian-remedy)。同一 Agent 的旧失败和已付消费必须继续保留，不能为了演示重置账户、quota 或原 journal。

## 本地修复与界面工作状态

已修复 [自主执行器](../services/hosted-agents/src/autonomy-executor.ts) 的首轮空目录消费缺口：现在有游戏或纯规划模式都会在 **没有 pending task 的每个新决策边界**，复用可信 canonical 目录读取，先确认是否有可执行任务。

- 确认空目录时，不调用 planner，不参赛、不占赞助 admission、不创建子任务，不产生费用或链上交易。首次没有完成任务时返回 `Stopped / AUTONOMY_NO_AVAILABLE_TASKS`、`success=false`、任务数0；前端应显示“暂无可用任务”，不能显示交付成功。
- 已完成至少一个任务后，空目录仍是成功收尾；RPC 失败、错误链或重组产生 `Paused / AUTONOMY_OBSERVATION_UNAVAILABLE`，不当作目录为空。
- Pending child、已付规划、Unknown 对账和旧请求恢复先走原 UUID、原付款及冻结快照，不因新增预检改成新调用。

本地 [单元回归](../services/hosted-agents/test/autonomy-executor.test.ts) **48/48** 通过；实际 Anvil + HTTP + Docker 的相关 **5项** 已通过，含 [结算后新父请求零消费](../services/hosted-agents/test/autonomy-game-live.test.ts) 与 [纯付费两任务循环](../services/hosted-agents/test/autonomy-live.test.ts)。批跑首次有一处测试把旧 schema 中省略的 `startedGames` 与数字0直接比较；修正为 optional counter 的零值语义后，该实际 case 单独复跑 **1/1** 通过。新空目录 case 验证10个角色 nonce、模型请求、子任务、费用及同 UUID 重放均不增加。最终根目录 TypeScript 与改动文件 whitespace 检查通过。既有测试生成的 Oct14 证据文件已还原，未用今天的受控运行覆盖历史实证。

**上述首轮预检修复仅在本地通过，尚未部署公网。** 昨日文档“完成至少一个任务后才检查”的叙述描述昨日生产行为，保留为历史，不在原验收报告中追改。

前端本地已修复首页双语 FAQ 中“外部专家未开放”的过期描述；Dashboard 刷新后恢复原交付和付款凭证；任务、游戏、资金面板及操作入口同步 URL；执行过程显示持久化事件中的实际模型及降档原因。零 Agent 的认证快照显式携带 owner，代理校验所有 Agent 的归属；刷新可恢复身份，切换账户、退出或旧响应晚到时不会复活原会话或串用 pending 请求。

最终验证均使用项目支持的 **Node22.23.2**：前端全套 **83/83** 通过；认证相关服务、代理和 owner 解析 **36项** 通过；桌面/手机浏览器回归 **12/12** 通过（身份隔离6项，交付/降档/面板导航6项）；根目录与前端 TypeScript 均通过。浏览器使用拦截的受控响应，验证0新增业务 POST/钱包 RPC，不代表公网模型执行。初次误用 shell 默认 Node18 的全套出现3个拒付相关失败；定位为其 test worker 缺少全局 crypto，正确 Node22 全套通过，没有修改业务逻辑或降低断言。

独立 Next 生产构建通过，临时输出和生成的 TypeScript 引用已清理。文档链接、已保存证据一致性及 whitespace 检查通过；证据一致性检查只读本地记录，不重新调用模型或链。**全部本轮修改仍仅在本地，尚未部署或替换生产输出。**

## Dashboard 核心入口覆盖

以下为当前源码的入口核对，不替代待完成的登录后公网人工验收。六项核心能力、外部雇佣与降档均有 Hosted 主流程入口；无需从 `/advanced` 发起业务。

| 能力 | 当前界面路径 |
| --- | --- |
| 信誉与凭证 | 左侧 InferScore/Tier；点击 Agent 名字打开身份与凭证卡；资金面板查看还款、违约和核验区块。[金融面板](../frontend/components/hosted/financial-panel.tsx)、[身份卡](../frontend/components/hosted/agent-profile.tsx)。 |
| 借贷、模型与预算 | 运行设置，或资金与借贷 → 调整授权与预算；允许任务授信后由接单执行器申请。没有面向任意用途的独立提款入口。[设置表单](../frontend/components/hosted/agent-settings-form.tsx)。 |
| 游戏资源 | 游戏 tab → 选择 Agent 参赛 → 选择 USDC/LLM credits；K2.6 可在操作类型选择“用奖励额度接单”。练习局不产生真实奖励。[目标与操作输入栏](../frontend/components/hosted/goal-composer.tsx)。 |
| 目标、查链、雇佣与复核 | 指挥模式输入目标或当前链地址/交易哈希，执行过程展示持久模型事件、正文、独立复核与费用凭证；外部服务由执行器发现并付费雇佣。[目标执行器](../services/hosted-agents/src/goals/executor.ts)、[对话与凭证](../frontend/components/hosted/mission-chat.tsx)。 |
| Pi 自主与下一单 | 操作类型选择 Pi 自主运行；后端在授权预算、时限、任务数和游戏次数内决策。请求记录展示实际完成单数和参赛数。 |
| 同目标降档 | 运行设置选择较强模型及有限预算，再提交普通目标；只对未付款的新调用切换批准的廉价路线，执行过程显示实际模型与原因。 |

`action:"credits"` 的固定额度探针没有独立输入栏选项，但奖励资源消费已有 `reward-task` 路径，不构成主闭环缺口。旧高级页的固定运营比赛、自定义额度问答和旧 task runner 仍使用 loopback-only API；公网会拒绝这些旧工具动作，现场不要把它们当主入口。高级页仍保留这些折叠运营控件，属于已知的次要公网页面体验问题。内置角色卡的参考评分是原目录快照，不能当成该角色独立链上信誉；托管 Agent 的 InferScore 和外部服务身份/评价分别按实际来源展示。

## 可执行的现场演示顺序

以下为前置条件满足后的操作脚本；本轮审计没有执行这些公网业务动作。每段新业务使用新的请求 UUID 和独立日期证据；刷新/恢复则坚持使用该业务原 UUID。

1. **先做当天只读预检。** 确认首页、Onboarding、Dashboard 登录，选择 Monad Testnet10143；由用户完成 Rabby 签名。读取 Agent 身份、cash/debt、信用条件、MON、owner quota、预算与未来期限的 Open 目录。运营方另按运行手册取得六个 units、网关、RPC、模型目录和历史保护的当天报告。前置项不满足时不点击新经营或付费任务。
2. **展示创建与授权。** 创建或选择已准备的托管 Agent，展示独立钱包和链上身份，再设置模型、单次/累计预算及是否允许任务信用。展示 MON 与 USDC deposit 回执；说明预算是授权上限、cash 是已入账资金、奖励 tokens 是模型资源。
3. **先走主线信用交付。** 使用新 Open escrow 任务和健康 Agent，准备不足以独付120000推理额度包的 cash，并确认授信可覆盖差额；例如 cash40000、贷款80000的组合只在实际报价和授信批准后执行。接单 → 采购额度 → Pi 生成/公开样例 → 独立 Docker 隐藏验收 → canonical 结算。展示真实本金/费用偿还、净收入、债务和信誉变化；费用按当前 Tier 展示，不预填成功结果或评分升级。
4. **展示游戏补充资源。** 使用 quota 尚有余额的 owner，在 Dashboard 中间面板发起有奖励的德州或授权自主经营，选择 USDC 或 K2.6 token 奖励。只展示实际胜负和已确认奖励；获 token 后接取另一条新目录任务，展示实际 usage、独立验收和收入。输了或资源不足时展示真实停止/暂停，不重置 quota，不把练习游戏算作奖金，也不把 token 支路说成贷款还款。
5. **展示雇佣专家与统一目标交付。** 为 cash goal 单独备资，提交一项明确的材料分析/交付目标，或支持的 Monad 合约地址/交易哈希。展示规划、已批准外部服务选择及独立身份、实际付款、正文产物、独立复核和凭证。昨日单专家成功案例是3次K2.6、30000；今天以实际阶段、修订和费用为准。此路不需要 Open escrow，也不产生任务报酬或还款信誉。
6. **展示同一目标的预算降档。** 使用现金和单次预算均明确限制的新目标，选择 K3，并选择需要两个明确专家阶段的交付；宿主仅对尚未付款的新调用选择更便宜路线。可按 [既有降档验收脚本](../scripts/monad-collaboration-goal-acceptance.ts) 的 scoped case 准备，展示同 UUID 的真实 K3→K2.6 调用和先前输出保留；昨日成功序列为20000+10000×3=50000，并非对任意新目标的保证。复核失败仍保留全部实际消费。
7. **最后检查刷新、恢复和证据。** 刷新页面确认原产物和阶段仍可见，打开 canonical Explorer 交易与 Agent 凭证；同 UUID 重放应返回同一结果且不新增模型调用或 nonce。若有 Unknown，只对账原付款/调用，不通过另开请求重购来掩盖未知结果。保存当天公开摘要：请求 ID、模型、usage、金额、交易/区块、review/verdict 与输出 digest；不公开模型原文、凭据或签名原始交易。

业务验收脚本分别为 [自动经营](../scripts/monad-collaboration-autonomy-acceptance.ts) 和 [外部雇佣/降档](../scripts/monad-collaboration-goal-acceptance.ts)。准备、执行、恢复、证据审计是不同模式；原私有目录不能直接作为一轮全新演示的输出目录，也不能为“重做证据”再次派发已付模型调用。新的日期目录应单独保存，最终是否通过必须由本轮实际结果判定。

## 叙事范围与证据导航

当前主张仍是：**托管 Agent 在授权预算内购买模型与专家能力，执行有报酬托管的任务；真实交付与还款历史改善后续信用条件，游戏提供另一种运行资源来源。** 同一 Agent 可以在任务中接单，也可以在个人目标中付费雇佣专家；当前不是开放的用户自助 escrow 子任务市场或多层任意委托系统。

| 能力 | 演示时准确描述 | 证据 |
| --- | --- | --- |
| 两模型与费用 | K2.6/K3：现金目标单次10000/20000；按量输入1/3、输出2/6微额度/token；固定求解和额度包都120000。平台报价、token usage 与供应商账单分别记录。 | [运行配置](../scripts/monad-hosted-runtime.ts)、[模型资源说明](../README.md#model-access-spend-rewards-cash-or-approved-credit)。 |
| 网关覆盖 | 付费目标/推理路径接 Magpie；游戏和奖励 token solver 仍直连 Moonshot，不能把 Magpie 计数差当所有模型调用总数。 | [昨日调用与费用](monad-collaboration-live-20261015.md#checked-real-model-goal-records)、[游戏执行器](../services/hosted-agents/src/game-executor.ts)。 |
| 专家与目标 | 有限、已批准的服务能力和独立 Provider 身份；当前16服务组合不是16个独立经营者。支持给定材料、代码产物及有限 Monad RPC/Sourcify 查链，没有任意网页、shell、外部账户操作或部署工具。 | [服务栈](../scripts/external-specialist-stack.ts)、[目标工具边界](../services/hosted-agents/src/goals/commander.ts)、[外部成功摘要](../frontend/acceptance/monad-collaboration-20261015/external-public-summary.json)。 |
| 独立验收 | 目录代码任务使用独立 Docker/Arena；个人目标使用单独模型复核和确定性输出约束。模型复核不等于运行代码、完整安全审计或事实真值。 | [成功 token 闭环](../frontend/acceptance/monad-collaboration-20261015/automatic-recheck-public-summary.json)、[成功降档](../frontend/acceptance/monad-collaboration-20261015/fallback-recheck-public-summary.json)。 |
| 保留失败 | 原 fallback50000失败 + 新 recheck50000成功，合计100000；Task18失败/default及34500清算永久保留。Task19成功是显式补资/guardian补救后的 token 支路，不是失败信用单自动自愈或成功还款。 | [原目标失败](../frontend/acceptance/monad-collaboration-20261015/fallback-failed-public-summary.json)、[原自动失败](../frontend/acceptance/monad-collaboration-20261015/automatic-failed-public-summary.json)、[完整昨日记录](monad-collaboration-live-20261015.md)。 |

[原始立项主线](../AGENT_CREDIT_ARCHITECTURE.md)、[工程 Demo 条件](../AGENT_CREDIT_ENGINEERING.md)、[风险与 MVP 边界](../AGENT_CREDIT_RISK_AND_MVP.md) 保留原设计及各自日期范围；[昨日公开证据索引](../frontend/acceptance/monad-collaboration-20261015/README.md) 导航实证，不替代今天的业务执行。当天登录验收、生产部署、资源准备和最终统计仍待主 Agent 汇总。
