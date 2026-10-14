# Dashboard 与自然语言目标执行（2026-10-13）

状态：实现与本地生产界面验收完成。本文是本轮范围与验收清单。用户明确要求本轮全部完成，不能把自然语言任务入口降级成固定指令框，也不能只提交 UI 外壳。

## 用户确认的交付范围

- [x] 精简 Dashboard：保留终端三栏，消除重复身份/模型/预算/状态以及常驻说明。当前任务展开，历史收起，凭证和规则按需查看。关键阻断集中显示原因与处理入口。
- [x] 顶部合并标题、当前位置、Agent 切换、钱包操作；移除重复导航行，桌面/手机可用。
- [x] 删除 dashboard 常驻“高级与演示入口”“API PAUSED”“服务端记录”。历史页面可保留；任务暂停不得误标为 API 暂停。
- [x] 底部改 Agent 真实动态条；无事件时静态摘要。关键错误固定展示，动效可暂停，遵守减少动画偏好。
- [x] Agent、模型、策略、任务模式、游戏奖励使用统一的非原生 dropdown 组件，支持键盘、焦点和手机操作。
- [x] 恢复中间顶部的任务状态动效，参考 AgoraMesh PipelineSnake，以 Magpie 鸟形表现待机/执行/暂停/完成。只映射实际可知状态，不能模拟阶段成功。
- [x] 恢复底部 chatbox：自由输入任务目标、快捷操作、Enter 发送/Shift+Enter 换行、保留输入草稿及错误。
- [x] 自然语言目标进入真实后端，持久化原目标及请求 ID，在预算内规划、执行、独立检查并返回可查看结果。不能把所有目标映射为同一预设目录任务，不能忽略用户目标。
- [x] 明确执行能力与工具边界；对缺少工具/外部访问的目标返回具体限制或需要的信息，不能宣称任何任务均已完成。用户输入不能扩大钱包权限、借贷授权或执行任意宿主命令。
- [x] 继续支持目录接单、按量推理/信用补额、Pi 连续运行、奖励任务、游戏、入账、原请求恢复与链上凭证。
- [x] 模型/预算/借贷在创建后的设置中管理，未配置不执行；新目标不能改写未完成请求参数。取消、失败、未知调用需保留准确费用和恢复/终止状态。
- [x] 自用目标与有报酬托管的任务明确区分：自用目标不虚构报酬、授信、还款或链上信誉。模型实际计费和网关路径可验证。

## 当前信息布局（以 monad-rebel 原版为准）

顶部：品牌/终端路径、历史抽屉、网络、钱包菜单、运行状态。
左栏：注册 Agent / Hunter 身份、信誉概览、当前任务，运行配置与资金借贷折叠。多个 Agent 时显示切换组件。
中间：原版 mission.log 空闲区、阶段卡片、底部终端 GoalInput；运行时显示 Magpie 进度。
右栏：写作、分析、代码与独立复核的内置执行角色，展示真实调用价格、阶段状态与产出次数；当前不声称接入独立专家雇佣市场。
底部：Agent 动态条，不承载必须及时处理的错误。

## 验收要求

- [x] 用户自由输入的新目标确实传入规划与执行，返回与目标相关结果，并展示独立检查结论；不能用预设结果冒充。
- [x] 受控测试覆盖原 UUID 重放、断连/未知结果、不足预算、权限隔离、取消或终止；记录实际支持的边界。
- [x] 至少一个用户代表任务经真实模型网关完成，费用/usage 与结果可核对；受控验收和真实供应商/链上验收分别记录。
- [x] 已有托管主闭环相关回归通过，类型检查及生产构建通过。
- [x] 桌面与手机实际浏览器验收：输入、选择、提交、反馈、恢复、结果阅读、设置，关键状态无需展开说明书即可理解。
- [x] 更新产品主张/接口/运行与验收文档，清理临时预览，更新本地服务供用户复核。

## 来源

用户在 2026-10-13 确认上述 dashboard 调整“这轮全部要完成”，包含像原版一样输入“帮我完成某个任意任务”，并要求先同步文档。原版只读参考：`/Users/jungle/Desktop/dev/bnb-hackathon/frontend/src/app/dashboard/page.tsx`、`components/agent/goal-input.tsx`、`components/timeline/pipeline-snake.tsx`。

## 已完成的实现与证据

- 界面：保留浅灰紫色终端三栏，标题行 Agent 选择/账户菜单；Magpie 状态面板、自由目标 composer、统一非原生 dropdown、真实运行 ticker；资金与授信明细/历史/长目标/阶段要求收起。结果安全渲染 Markdown 表格/代码，不执行模型 HTML 或链接；可下载最终修订版，旧阶段保留可查。
- 后端：`goal`、owner/UUID/原文绑定、持久规划与阶段输出、独立复核、最多一次修订+复核；显式字数/词数与禁止编造日期检查参与结果判定。超限或复核失败保留 Failed，不虚构成功。最多 7 次调用，实际预算与时限可能更早终止。
- 支付：cash-only task 0，K2.6/K3 每调用 10000/20000 raw；公开 actual usage 和 canonical receipt。未知响应保留 reservation；取消不跳过对账；确认退款/失败交易后才能结束。个人目标不产生 escrow 收入、任务借贷或信誉分。
- [真实双模型验收](../frontend/acceptance/dashboard-goal-20261013/live-acceptance.md)：独立 Anvil 31337 + 真实 Magpie/供应商。最终销售简报初稿 582 非空白字符被拒，修订为 371 字符并复验通过，6 调用/60000 raw；K3 代码任务 3 调用/60000 raw，另由验收脚本做 8 项实际代码检查。旧模型错误、修正后仍超限的失败样例都保留，未重写成成功。
- 用户界面实际测试还覆盖缺少联网工具时明确 `NEEDS_INPUT`（1 调用）、停止后续阶段（1 调用）、刷新草稿、键盘 dropdown、手机切换、暂停后原请求恢复。恢复后的访谈方案因截断/质量问题被复核拒绝，展示 Failed；暂停恢复成功不代表内容保证通过。见 [浏览器任务证据](../frontend/acceptance/dashboard-goal-20261013/browser-live-runs.json)。
- 回归：hosted 102/102；前端逻辑原批 35/35，最后代理扩展 10/10；goal executor 专项 19 项（含真实 Anvil 支付/未知取消/退款），runtime catalog alias 5/5；root/frontend 类型检查与生产构建通过。旧 autonomy 首轮出现额外一次受控求解，未复现；4 次定向与完整重跑原断言通过，已加诊断，未放宽判断或隐去失败记录。
- 浏览器专项测试源码已同步新组件与交互，但本轮未执行 Playwright CLI；本轮实际 UI 验收使用 CUA 操作生产构建和真实本地测试账户。历史套件通过数字不冒充此次执行结果。

## 能力边界与复用来源

最终生产构建已运行在 `http://127.0.0.1:3024/dashboard`，连接恢复后的 Monad hosted runtime。已只读确认未登录页面加载新版工作台；本轮没有替用户签名登录。独立测试账户的 [桌面截图](../frontend/acceptance/dashboard-goal-20261013/desktop.png) 与 [手机截图](../frontend/acceptance/dashboard-goal-20261013/mobile.png) 来自相同生产构建；下载交付物已核对为最终 371 字符修订稿。临时 3027 预览、3031 登录桥和独立 Anvil runtime 已停止，私有运行日志保留；3024 与原 Monad runtime 保持运行。

复用 Agora 的 Commander 分阶段编排、前阶段上下文和 GoalInput/Timeline 布局模式；BNB x402、全球专家发现及外部调查工具不直接接入本次 Monad 托管服务。该阶段自由目标可做文本生成、给定资料分析、代码生成/审阅；当时不能声称已联网（后续自动查链接入见文末）、访问文件、运行代码或替用户外部操作。缺少工具时返回具体限制。代码任务的 8 项检查是此次验收动作，尚不是通用 mission 工具。

独立模型复核不是通用事实保证；硬检查只覆盖明确可判定约束。字数使用去空白后的 Unicode 字符数，含标点与 Markdown；这是保守口径。文档与 UI 的“复核”不冒充代码执行或外部事实核验。

本轮没有新广播 Monad 用户业务交易。原 Monad runtime 在保持原目录、端口、catalog digest、钱包及暂停记录的前提下，以 `--recover` 加载新增双模型 goal relay；原有接单金融闭环的 Monad 证据仍引用 10-12 验收。公网托管、真实扩展钱包联合验收不包含在本轮 UI 交付中。

## 10:53 界面修正（已完成）

- 中栏改为单层任务内容，去掉请求记录套卡、重复恢复入口；请求 ID 与时间放入凭证详情。
- 钱包地址旁只保留带可访问名称的复制图标。
- 对照 Agora GoalInput 恢复 `//` 快捷指令、参数填写、自适应终端输入行和图标发送；指令仅覆盖当前支持的任务。
- 通知移到右下角，可关闭；普通提示自动消退，待确认请求保留处理入口。
- Magpie 从浮动装饰改为阶段驱动：定位当前阶段、累积已产出的节点；暂停/失败停止，复核完成才显示整体完成。当前 API 无专家发现事件，不虚构专家选择。


本次验证：阶段进度/暂停失败/非目标任务/快捷指令边界 4 项测试通过，前端类型检查与 `.next-dashboard-polish-final` 生产构建通过。CUA 使用隔离的合成 HTTP 服务核对快捷参数填写、发送、右下角通知自动消退、规划到复核的节点推进、开户暂停单层视图，以及手机布局；未执行任何用户链上交易，也未把合成结果作为真实模型验收。

截图：[当前任务](../frontend/acceptance/dashboard-polish-20261013/desktop.png)、[开户暂停](../frontend/acceptance/dashboard-polish-20261013/paused.png)、[右下角通知](../frontend/acceptance/dashboard-polish-20261013/toast.png)、[手机](../frontend/acceptance/dashboard-polish-20261013/mobile.png)。本地 3024 已切换新生产构建。

## 对照 monad-rebel 原版重排（已完成）

以 `/Users/jungle/Desktop/dev/monad-rebel/frontend/src/app/dashboard/page.tsx` 的实际运行页面为视觉基准，替代前两轮自定义布局：顶部 history / network / session / status；左侧 Hunter 身份、信誉概览、当前任务、折叠资金和运行设置；中间 mission.log、原版阶段行、底部终端 GoalInput；右侧 mesh.net 专家执行角色；历史移入左侧抽屉。空闲中栏与原版一致，仅显示等待输入，执行时才显示 Magpie。

当前目标执行器仅具备 writer/analyst/coder 与独立 reviewer 调用，没有对外专家 Registry/竞价雇佣事件。右侧必须明确是内置专家角色，只显示实际阶段与调用状态；不复制原版不存在于本项目的专家身份、信誉样本或雇佣记录。接单、借贷、游戏和恢复入口保持可达。


本次对照原版完成 12 列三栏网格（3/6/3）、47px 顶栏、原版空闲任务区与快捷指令输入区；历史进入抽屉，选择历史任务会同步中栏结果和右栏实际角色状态。Agent 地址缩写并用图标复制完整地址；资金、借贷、运行设置仍从左栏可达。Magpie 采用 80px 阶段条，暂停、终止和复核状态取自实际请求。

验证：专家角色映射与阶段进度共 8/8 测试通过；前端类型检查及 `.next-agora-match-release` 生产构建通过。CUA 在隔离合成 API 上实际检查快捷指令发送、历史切换、取消、设置打开、资金入口、手机三栏切换及无横向溢出；这些样例只证明 UI 交互，不作为真实模型或 Monad 交易证据。浏览器专项测试源码已更新，本轮未运行 Playwright CLI。

截图：[空闲桌面](../frontend/acceptance/dashboard-agora-20261013/desktop-idle.png)、[任务结果桌面](../frontend/acceptance/dashboard-agora-20261013/desktop-result.png)、[手机](../frontend/acceptance/dashboard-agora-20261013/mobile.png)。3024 已运行最终生产构建，并通过浏览器只读确认新版导航与三栏；保留用户原 Monad runtime 和 3025 原版用于比较。临时预览、合成 API 和登录桥已停止，临时脚本已清理。


## 身份区、导航与专家动效精修（已完成）

按用户本轮要求：Agent 切换直接整合到身份标题，钱包地址置于下一行，移除“任务发起”；顶栏加入产品首页、Agent、游戏与协议页面入口，去除 agent-mesh 路径。链上开户记录默认移到左侧身份区，保留 Gas 提示、恢复和凭证；任务区只展示用户任务。专家卡片压缩行距，恢复入场、排序位移、执行发光与调用盖章效果，暂停/停止不继续播放执行动效。信誉位置保留，但当前内置角色无独立评分，显示未评级，不能从整体任务复核结果伪造角色信誉或 REP 增量。


验证：前端类型检查、8 项角色/阶段状态测试及 `.next-dashboard-refine` 生产构建通过。CUA 隔离合成 API 验收了双 Agent 下拉切换、左侧 Gas 不足提示、原 UUID 恢复开户、顶栏游戏导航、复核角色排序与发光、暂停后 animation:none、手机导航与专家卡片无横向溢出。1280px 桌面卡片约 118px 高。测试未使用真实钱包或广播交易；未把内置角色伪装成独立信誉主体。3024 已切换该构建，原 Monad runtime 与 3025 保持运行。

截图：[桌面](../frontend/acceptance/dashboard-refine-20261013/desktop.png)、[左侧开户](../frontend/acceptance/dashboard-refine-20261013/provision.png)、[手机](../frontend/acceptance/dashboard-refine-20261013/mobile.png)。临时预览与合成服务用后清理。


## monad-rebel 本地演示信誉（2026-10-13）

用户明确同意复用原目录的本地信誉数据。读取运行于 3003 的原 Registry `/services`，导入公开评价汇总到 `frontend/lib/demo-expert-reputation.json`；不复制钱包、凭据、服务 endpoint 或个人评价正文。快照保留服务 ID、名称、任务类别、原始 score/count/trend/recentScores/lastUsedAt/qualified。原始持久来源为 `monad-rebel/registry/service-feedback-store.json`，计算使用该项目 `shared/src/service-reputation.ts`。

显示映射：writer → writer-v1（AI Content Writer）；analyst → defi-analyst-v1（DeFi Protocol Analyzer）；coder → auditor-v1（Smart Contract Auditor，代码审阅参考）。这是演示评分映射，不是身份绑定；Reviewer 没有对应记录，仍未评级。卡片顶部显示“DEMO · monad-rebel 本地信誉”，字段称“参考信誉”，折叠来源列出完整对应关系与快照日期。不将当前内置任务结果写入原 Registry，不影响借贷、链上 InferScore、模型费用和执行路由，不为静态快照播放 REP 增量。

本轮类型检查与 `.next-dashboard-demo-rep` 生产构建通过，3024 已更新；浏览器确认三组分数、样本数、趋势与快照一致，并检查来源展开说明。截图见 [本地信誉展示](../frontend/acceptance/dashboard-reputation-20261013/desktop.png)。静态快照不自动跟随后续原目录评价更新。


### 信誉展示标注调整

按用户要求移除右栏顶部显眼的“DEMO · monad-rebel 本地信誉”提示。保留“参考信誉”字段名及折叠来源，确保导入的原服务评分不被误认为当前内置执行角色积累的信誉。当前执行链路可用，不改变评分来源、身份对应或金融决策逻辑。

`.next-dashboard-reputation` 构建及类型检查通过；3024 已切换，并经浏览器确认顶部标记已移除，评分与折叠来源保留。


## 跨页导航与游戏/资金信息架构（已完成）

统一 Dashboard、游戏大厅与资金页的标题栏、账户菜单和 SVG 下拉箭头；导航仅用颜色表示当前/焦点状态，不加下划线。账户菜单去掉重复首页，右侧不再展示来源长文（评分归属仍保留在字段提示与文档）。主导航收敛为我的 Agent / 游戏大厅 / 资金与借贷；高级协议是固定运营与协议验收工具，移出主流程，保留直接访问。

游戏大厅顶部每款游戏仅一个入口卡，策略/邀请玩法在同一卡内选择；用户奖励德州入口紧随游戏目录，固定运营比赛与证据归入协议工具。新增资金与借贷页复用当前 Agent 的核验快照、授权设置、资金入账及原请求恢复。借贷仍只绑定有报酬托管任务，不新增任意提现或游戏借贷。


验证：前端类型检查、请求恢复与专家角色映射 6/6 测试、`.next-workspace-navigation-final` 生产构建通过。CUA 检查了账户菜单方向键/Escape、导航无下划线、Agent 跨页选择保持、游戏入口自动选择操作类型、四张游戏卡和手机无横向溢出。隔离合成 API 验证授权设置保存，以及入账首次失败后使用相同 UUID/金额恢复、成功后清空输入。未广播真实交易，也未将合成余额作为 Monad 验收证据。

截图：[游戏大厅](../frontend/acceptance/navigation-20261013/games.png)、[资金页](../frontend/acceptance/navigation-20261013/finance.png)、[手机资金页](../frontend/acceptance/navigation-20261013/finance-mobile.png)。3024 更新为最终构建；原 Monad runtime 与 3025 保持运行。


## Dashboard 内联游戏、资金与身份凭证（已完成）

导航品牌仅显示 Tabby，工作台入口名为 Dashboard。账户与 Agent 选择共用菜单视觉。资金不再是独立主流程，迁入 Dashboard 中栏，与任务、游戏切换；旧 /finance 重定向到工作台资金视图。游戏中栏复用大厅的实际棋盘与操作 API；练习仍是虚拟筹码，托管奖励比赛沿用原请求执行、恢复与凭证，不虚构实时手牌。

左侧托管 Agent 和右侧内置角色提供身份/凭证弹窗。托管 Agent 按归属汇总已返回的开户、入账、接单、付款、结算和模型调用交易；内置角色展示可对应的执行记录与付款哈希，没有独立钱包则明确未独立注册。参考信誉快照保留原始来源与服务 ID，不把它映射为当前角色的链上信誉。无哈希的执行记录不称为上链证明。


验证：类型检查、9/9 项凭证归属/角色映射/原请求恢复测试及 `.next-dashboard-panels` 生产构建通过。CUA 在隔离合成托管 API 上验证角色证据只含对应调用，切换到无记录 Agent 后不显示另一 Agent 的哈希；两个 dropdown 的字体、边框、阴影和间距一致。用独立预览进程的真实免费练习 API 完成五子棋创建、准备、H8 落子及 Bot H7 回应，URL 保持 Dashboard；切换资金再回游戏保留棋盘。手机 392px 无横向溢出，/finance 重定向并选中资金页签，资金“去接单”切回任务操作。未发送真实钱包交易或调用付费模型。

截图：[资金中栏](../frontend/acceptance/dashboard-panels-20261013/finance.png)、[中栏对局](../frontend/acceptance/dashboard-panels-20261013/game.png)、[角色信息卡](../frontend/acceptance/dashboard-panels-20261013/profile.png)、[手机对局](../frontend/acceptance/dashboard-panels-20261013/game-mobile.png)。本地 3024 切换为最终构建，原 Monad runtime 和 3025 保留。


## 下拉选项行修正与专家数量核查

截图揭示身份区 `.agentSwitch button` 覆盖了 popover 内部选项，导致字号、内边距、行宽和勾选位置异常。限定选择器只作用于 combobox 触发器，同时收窄输入区同类规则；移除快捷指令说明句，保留快捷指令功能。

对照 monad-rebel 的 services.json + dynamic-services.json，原目录去重后有 8 项服务。当时托管目标执行器只有 writer/analyst/coder/reviewer 四种角色（后续接入结果见下节）；ABI Reader、Gas Optimizer、Token Risk Scanner、Transaction Decoder、Yield Strategy Finder 尚未接入当前执行链，不作为已可调用角色补入卡片。

验收：类型检查与 `.next-menu-row-fix` 构建通过。CUA 使用 test/Test/Test 三条 Agent 记录逐行比较两类菜单，均为 11px/16.5px 字体、9px 28px 9px 10px 内边距、约 200.76px 行宽及 34.48px 行高；勾选位于行右侧。快捷指令说明句已消失。截图保存在 frontend/acceptance/menu-row-20261013，3024 更新最终构建。


## 五项 monad-rebel 专家执行接入（已完成）

范围：复用 agents/services 下 abi-reader、gas-optimizer、token-scanner、tx-decoder、yield-finder 的 config.json / prompt.md，以及 writer 执行器的按任务类型解析、语言规则和 JSON 输出正规化模式。接入 Tabby commander、持久化阶段执行、统一模型网关付款、独立复核及角色凭证。保留原目录来源与内容摘要；不接入原目录缺少 API key 时的兜底假产出，不复用 MON 标价替代当前 USDC 模型报价。

本段记录专家移植阶段的边界，自动查链接入后的现状见文末。原实现是基于用户提供资料的模型专家，无 RPC / web / shell 工具。ABI/源码/calldata+ABI/交易回执/有日期的收益资料由用户提供；不得声称已抓取实时市场、运行 gas 基准或查询未提供的交易。目标缺资料时应请求补充。

验收：五个 canonical taskType 和 aliases 可由规划选择；专属提示词进入真实付费请求；JSON 格式约束生效；每条调用按角色保留 serviceId、提示词摘要、paymentId、txHash 与请求摘要；原请求恢复不重复扣款；右栏与个人卡展示正确归属；受控上游+本地链验证实际付款回执，并在条件允许时做真实模型验收。

### 实际验收与交付

五项定义完整接入；右栏现在是八个执行专家 + 一个独立 Reviewer。来源版本 `a2c57069635c02c8aab8e15f6be22f16db1f4342`，十份原文件按 SHA-256 核对，见 `services/hosted-agents/src/specialists/monad-rebel/provenance.json`。引用内容保持原样，运行约束与语言要求在加载时追加。

| 专家 | 输入样例 | 成功任务调用次数 | 本地测试 USDC 费用 |
| --- | --- | --- | --- |
| ABI Reader | balanceOf / transfer ABI | 3 | 0.03 |
| Gas Optimizer | storage 数组求和 Solidity 源码 | 5（含修订与再复核） | 0.05 |
| Token Risk Scanner | owner 可无限 mint 的完整简化源码 | 3 | 0.03 |
| Transaction Decoder | transfer calldata + ABI，无 receipt/logs | 3 | 0.03 |
| Yield Strategy Finder | 用户提供的两组假设收益/锁仓数据 | 3 | 0.03 |

上述五项均经真实 Kimi K2.6 / Magpie，使用隔离 Anvil、测试 USDC，核验 17 笔付款回执成功、逐笔现金扣费、信用扣费为零。每项使用原 UUID 恢复，交易 nonce 和模型请求数不增加。**这批新专家的付款凭证来自本地链，不作为 Monad 新增验收记录。** 原 Monad runtime 已重载该目录和执行器，3024 更新生产构建；公开 capabilities 确认八项专家及 K2.6/K3 两个报价。

Token 首轮因 Reviewer 未收到专家约定 JSON 字段而误拒；补齐可信输出契约，明确源码可观察属性与部署状态的区别后，单独复测通过。Gas 首轮被退回后按同一专家提示词修订，再独立复核通过。未跳过或伪造通过状态。另一次测试脚本沿用 5 秒受控模型超时导致暂停；改为与真实调用匹配的 120 秒后复测，首轮日志仍保留在 demo-output/specialist-acceptance。

自动检查：45 项相关单元/API 投影/凭证归属检查，6 个受控模型真实付款场景（包括付费错误 JSON 停止及不重复扣费），根类型检查与前端构建通过。验收命令：

```sh
npx tsx --test services/hosted-agents/test/specialists.test.ts services/hosted-agents/test/specialists-paid.test.ts
SPECIALIST_LIVE=1 SPECIALIST_EVIDENCE=demo-output/specialist-acceptance/live-receipts.json npx tsx --test services/hosted-agents/test/specialists-paid.test.ts
# 真实模型定向复测可追加 SPECIALIST_ONLY=token-scan；依赖已启动的本机 Magpie。
```

浏览器验收覆盖九角色目录、已调用专家自动前置、历史产出与独立复核、按角色过滤的交易和完整调用摘要。截图与[真实执行凭证](../frontend/acceptance/specialists-20261013/execution-evidence.json)保存在 frontend/acceptance/specialists-20261013。信息卡的 serviceId/promptDigest 为运行记录，requestDigest 绑定实际付款请求；付款回执证明支付，不证明报告所有结论或形成专家独立 ERC-8004 身份。

## 地址 / 交易哈希自动查链（已完成 Monad 验收）

用户只需输入当前 Agent 所在链的合约地址或交易哈希。运行器在规划前通过配置的只读 RPC 获取固定区块的地址代码、余额、代币属性或交易回执/日志；通过 Sourcify v2 获取已验证 ABI/源码，并将其 runtime bytecode 与 RPC 字节码核对。代理实现一并读取，所有来源只作为数据，不允许其内容控制工具、付款或系统指令。用户输入的 URL 不作为任意抓取地址。

读取快照在首次模型付款前持久化；原请求恢复沿用快照及原付款 handle。分析、修订与独立复核均看到相同证据，前端能下载读取凭证，并将其与模型调用/付款凭证对应。读取来源、网络、区块 hash、响应摘要、源码可用性和截断情况公开；RPC 凭据不公开。读取本身不会产生虚构“查链交易”。

本轮验收包含真实 Monad 地址与交易读取、真实模型分析与付费回执、本地受控无源码/代理/失败交易/异常网络/恢复不重复支付路径。不承诺任意链、任意 URL 或未接入的实时 APY 数据源。

### 过期付款与 Magpie 动效补齐

- 过期签名恢复/停止共用链上对账：同 nonce 零金额作废交易持久化、规范链确认、原 payment 零值后终止；不重复推理、不抹掉先前已消费费用。
- 对照 monad-rebel 原 snake engine 补回网格寻路、目标锁定、轨迹增长和真实阶段反馈，替换为 Magpie 鸟形绘制。运行状态、暂停与减少动态效果由同一真实任务状态驱动。
- 详见 `chain-lookup-acceptance-20261013.md` 和对应公开验收凭证。

最终地址样例 `66fed270-f8c2-45b1-8f23-6a52b18c2724`：规划、ABI 专家、独立复核 3 笔真实调用，合计 0.03 test USDC，链上回执和重放幂等通过。过期付款恢复终止与主动停止均有独立链上证明，详见上述验收记录。

## 2026-10-14 · AI 对话与游戏大厅精简

本轮按 Beautiful UI 的 Loading State、Thinking、Streaming Text、Prompt Bar 交互参考调整，保持 Tabby 等宽字体、紫色与轻边框。任务目标成为用户消息，Tabby 回复整合公开执行轨迹、专家阶段、独立复核、产出、费用和链上凭证；不展示或编造模型内部推理。当前服务按阶段发布快照，文字渐进呈现仅展开已接收产出，不代表上游逐 token 流式接口。历史回看、暂停、断连不播放运行加载效果。

Prompt Bar 保留现有草稿、快捷指令、模式、预算与发送约束；不新增尚未支持的附件、语音或联网搜索按钮。游戏大厅去除可见 arena 品牌文案（内部路由和 API 保持兼容），恢复四个独立游戏卡片的轻边框，将历史/回放集中到头部，嵌入大厅省略底部 API 契约和重复说明。

### 对话呈现定稿：原文优先

动画区压至 160px，移除可见底部说明与分隔线；辅助技术仍可读取当前状态。发起消息使用当前 Agent 名称（验收页为 Tabby Research），回复作者仅显示 Tabby。按 Beautiful UI Thinking State 源码改造受控折叠：真实运行中显示加载状态，完成后合并为单行状态入口；公开阶段、独立复核、读取证据和付款费用集中在展开内容。默认直接显示回复原文，取消结果下载，仅保留图标复制。第三方许可证见 frontend/THIRD_PARTY_NOTICES.md。以上替代此前分散状态和复制/下载布局。

### Agent 资料入口

左侧移除独立的“信息与凭证”按钮，点击 Agent 名称直接打开原有身份与链上凭证弹窗。多 Agent 时，名称旁的独立箭头保留切换菜单；钱包地址和复制图标保持独立操作。
