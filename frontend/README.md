# Tabby frontend

The Next.js/React application presents owner-scoped agents, personal goals, coding-task execution, finance and games. All hosted requests pass through the same-origin [server bridge](lib/hosted-agents-proxy.ts); operator keys and upstream bearer tokens are not browser configuration. Wallet login, selected Agent and original request UUIDs are shared across the user flow.

| Route | Role |
| --- | --- |
| `/` | Bilingual product landing page |
| `/onboarding` | Wallet login and Agent creation; execution settings are configured afterwards |
| `/dashboard` | Hosted goal/task workspace with evidence, outputs and the Tabby execution scene |
| `/finance` | Compatibility redirect to `/dashboard?panel=finance` for cash, debt, credit and receipts |
| `/arena` | Sponsored game controls and four practice modes |
| `/advanced` | Protocol diagnostics and the historical fixed-Agent demo |

The scene adapter renders recorded activity, not guessed progress. Synthetic scene/UI previews are labeled fixtures and are separate from the [real Monad acceptance](../docs/monad-hosted-acceptance-20261012.md). [Latest scene/UI record](acceptance/tabby-scenes-20261014/README.md) · [Architecture](../docs/ARCHITECTURE.md) · [Verification](../docs/VERIFICATION.md).

For the complete labeled UI fixture, run `node scripts/preview-dashboard.mjs` from the root and open `http://localhost:3033/`; it uses the real components with an in-memory session and blocks external connections. For the protocol fixture, run `npm run dev:fixture --workspace @agentfuel/frontend` and open `http://127.0.0.1:3000/advanced`. The main hosted `/dashboard` needs the [backend configuration](../docs/hosted-agents.md). Chinese setup, history and test commands follow.

2026-10-13 工作台以 `monad-rebel` 原版 Dashboard 为布局基准：左侧 Hunter 身份、信誉与折叠资金设置；右侧实际内置执行角色；中间 mission.log、阶段卡片与底部指挥模式输入框。历史位于顶部抽屉，运行时显示 Magpie。组件 dropdown 支持键盘与移动端。自由目标连接真实规划、分阶段产出与独立模型复核，能力与验收见 [交付清单](../docs/dashboard-goal-workspace-20261013.md)。

品牌采用已选定 A2「队列 T」。正式 [PNG/SVG 与图标资产](public/brand/tabby/README.md) 位于 `public/brand/tabby/`，网站接入与维护见 [Tabby 品牌说明](../docs/tabby-brand.md)。

2026-10-11 最新结果见 [上线测试前验收](../docs/frontend-release-acceptance-20261011.md)：Oberon 落地页、个人金融信息与恢复入口已完成，首轮本地浏览器覆盖 93 个用例；后续补齐首次进入动效与独立终端创建，相关 92 项补验通过。下文 2026-10-10 数字保留为历史记录。

Next.js 16 / React 19。首页 `/` 是 Oberon 风格的产品落地页；“创建你的 AGENT”进入 `/onboarding` 终端创建页，“进入工作台”进入 `/dashboard`。落地页来源、字体许可和适配见 [Oberon 说明](../docs/frontend-oberon-landing.md)。托管工作台保留 Agora Mesh 的浅灰紫色主题、Geist Mono、紧凑标题栏、固定视口三栏、身份面板、请求时间线和底部操作区；手机使用 agent.sys / mission.log / mesh.net 面板切换。来源与适配记录见 [迁移说明](../docs/frontend-agora-migration.md)。

`/onboarding` 使用琥珀色 CRT 终端，依次显示启动文本、钱包登录、命名与确认；模型/预算/借贷在创建后的运行设置中配置。创建成功选中新 Agent 并进入工作台。创建、工作台、游戏大厅与资金页共享会话、所选 Agent、请求锁和原 UUID 恢复记录，离开这些页面停止读取及轮询。

`/dashboard` 通过同源 `/api/hosted/*` 连接钱包个人消息签名登录、创建/设置/暂停 Agent、任务、免费德州、USDC 入账和奖励额度驱动的 Pi 任务、独立验收与补额后恢复。服务未配置时显示服务不可用，不生成示例 Agent。模型目录来自当前登录用户的服务端快照，Agent 的独立钱包私钥仅由平台保管；浏览器只用 Next 管理的 HttpOnly 会话。

托管服务启动与环境变量见 [hosted-agents](../docs/hosted-agents.md)。未知 POST 保存原 UUID 与公开参数，刷新后以同一钱包身份继续确认；可恢复的服务端记录使用原 requestId、rewardKind、amountRaw。该恢复提示保存在 localStorage 中，不保存 token、私钥或模型输出；自由目标原文作为原请求参数保存，未提交草稿在 sessionStorage 按 owner 与 Agent 隔离。

右侧为八个可执行专家加 Independent Reviewer，新增 ABI / Gas / Token / Transaction / Yield 角色使用 monad-rebel 原定义；根据服务端 capabilities 显示可用状态。执行后角色卡随实际阶段变化，信息卡按角色过滤付款交易、serviceId、提示词摘要与请求摘要。具体复用范围和验收见 [专家接入记录](../docs/dashboard-goal-workspace-20261013.md)。

主导航为 Dashboard、游戏大厅，品牌仅显示 Tabby。Dashboard 中栏使用任务 / 游戏 / 资金与借贷三个页签；旧 `/finance` 重定向到 `/dashboard?panel=finance`。资金区复用当前 Agent 的金融快照、授权设置、USDC 入账与原请求恢复。借贷绑定托管报酬任务，自由目标与游戏不借贷。

中栏游戏复用 ArenaPlay 棋盘与练习 API，选游戏、开局、落子均不离开 Dashboard；页签切换保留已打开对局。奖励德州通过原托管请求运行，当前 API 提供结果与凭证，未提供可操纵的奖励比赛实时棋盘。左侧 Agent 与右侧角色可打开信息卡，按实际归属查看交易哈希与调用记录；未独立注册的角色不显示虚构钱包或链上信誉。

原 Agent Financial Identity 档案页与固定 Agent 面板保留在 `/advanced`，仅直接访问，不占主导航；固定运营比赛与额度工具折叠收在该页。该入口继续按 `FRONTEND_MODE=chain` / `fixture` 运行，至少 3 个运营 Agent 可切换，现金、Tier、债务与协议回执来自原服务和合约。未配置真实清单时不会补上示例余额。

`/arena`、四种练习界面、`/arena/holdem` 与 `/advanced` 同样使用源 Dashboard 的浅灰/白色方角面板、紫色强调、Geist Mono 和紧凑终端页头。手机按内容改为单列。德州历史只读报告入口收在高级协议的“历史演示与证据”，不放在主导航，也不是创建或个人参赛必经页。棋盘材质、黑白棋子、牌桌及红黑花色保留原辨识与操作。游戏大厅先显示四张游戏卡，同一卡内选择策略或邀请练习，随后显示个人托管 Agent 奖励参赛入口；历史与 API 契约默认折叠。奖励入口跳转 `/dashboard?operation=game`，保留选中 Agent 并选好游戏操作，不自动发起请求。

个人金融快照通过独立 `GET /api/hosted/agents/:id/finance` 读取。服务端先核验归属，再按 Underwriter 的同一链上区块读取 cash、policy 和完整任务债务；评分与 Tier 沿用 Underwriter。普通列表轮询不扫描金融账本；切换 Agent、请求状态变化或手动刷新才读取，失败保留并标记旧快照，首次失败不显示虚构的零余额。任务分别展示接单、付款与核验后的 `TaskSettled` 交易；“结算入账”不等于扣除所有成本后的利润。

请求列表按更新时间保留最近 100 条，以及所有未结束或仍被 Agent 引用的请求。旧暂停请求不会因其他 Agent 的新记录被挤掉，恢复沿用原 ID、金额与奖励选择。

托管 UI 的本地浏览器验收使用合成 API 和本地个人签名，所有 API 均拦截，不会广播交易或调用付费模型：

```sh
npm run test:browser --workspace @agentfuel/frontend -- --config playwright.hosted.config.ts
```

其他页面的结构、导航和四种练习操作可用独立 3015 / `.next-terminal-test` 验收。所有 API 拦截；练习动作仅在测试进程内执行免费游戏引擎，钱包、外网请求与付费模型均不可达。合成截图保存在 `frontend/acceptance/terminal-pages/`。

```sh
npm run test:browser --workspace @agentfuel/frontend -- --config playwright.terminal.config.ts
```

2026-10-10 终端统一后，托管 40/40、跨页 14/14、运营控制台 16/16、德州报告 6/6 共 76 项通过；类型检查与最终生产构建通过。生产桌面/手机 8 页核对字体、主题和宽度，截图为 `production-local-*`，其中未配置德州明确标记 fixture。

此套件的 UI 验收不代表真实钱包扩展、供应商或公开部署端到端已验收。最近确认 cash 与额度消费记录是服务端返回的历史事实，界面不将它们显示为当前实时余额。

从仓库根目录运行（依赖由根 npm workspace 统一安装）：

```sh
# Ensure Node.js 22.19+ and Foundry are on PATH.
npm ci
npm run typecheck --workspace @agentfuel/frontend
npm run build --workspace @agentfuel/frontend
npm run dev --workspace @agentfuel/frontend
```

访问 `http://127.0.0.1:3000`。生产构建可用 `npm start --workspace @agentfuel/frontend` 启动；此处没有外部部署步骤。

## 德州公开报告

只在 Next server 配置 `HOLDEM_REPORT_PATH` 为本次运行公开 `report.json` 的绝对路径，例如：

```sh
HOLDEM_REPORT_PATH=/absolute/local-run/holdem/report.json \
  npm run dev --workspace @agentfuel/frontend
```

访问 `http://127.0.0.1:3000/arena/holdem`。未配置时明确显示 `FIXTURE`，牌局、金额与哈希均为合成示例；已配置但无法读取或 schema 不支持时显示错误，不用 fixture 替代。刷新失败保留上次成功快照。报告里的 `steps` 是行动前快照，终局另显示派奖后的 `finalStacks`；底牌始终不公开。

`GET /api/holdem` 不接受用户路径或 URL，只读取服务端配置的文件，响应 `Cache-Control: no-store`。仅允许指定文件名，校验真实路径，拒绝 `.private` 目录、非文件和超过 2 MB 的报告。所有层级按字段重建输出，剔除底牌、完整牌堆、策略输入、模型提示/响应、密钥、签名 bytes、原交易 data 与本机路径。局面和金额格式无效、不同 receipt chainId 或非法停止态会拒绝读取。`Starting` / `Running` / `Stopped` 可缺少奖后余额，`Stopped` 不显示赢家或奖励。

页面分别标记本地 Anvil / Monad、脚本策略 / 受控模型 / 真实 Kimi 上游（报告声明）。所有数据均为文件快照：页面不查询 RPC，证据标记指本次运行报告的声明，不构成浏览器重新核验。公开重放仍依赖可信裁判；本地奖后推理使用受控 HTTP 上游。模型决策调用意图、赞助奖励和推理现金消费分开显示，上游调用计数不等于已核验的账单金额。

可选配置 `HOLDEM_DELIVERY_REPORT_PATH` 指向同局公开 `monad-delivery-report.json`，另配置 `HOLDEM_PURCHASE_REPORT_PATH` 指向 `monad-purchase-report.json`。两个文件必须分别绑定主报告的 `matchId`、原始文件 SHA-256 和 replay digest；购买报告还绑定奖励报告的原始文件 SHA-256。只有 Monad 奖励报告时显示“奖励已存入 cash / 推理消费待核验”；只有购买报告同时提供 Delivered、任务完成和付款 receipt 才显示奖后推理完成。未知结果显示暂停，局末本地 mock-USDC 受控推理不能充当 Monad 购买证明。关联错误单独显示，保留有效的主牌局。

```sh
# 私有字段剔除、允许文件、真实路径、运行/停止态和 Monad 文件绑定。
node --import tsx --test frontend/test/holdem-report.test.ts

# 生产构建 + 本地 Chrome 的桌面/手机回放、刷新错误、分阶段证据。
npm run build --workspace @agentfuel/frontend
npm run test:browser --workspace @agentfuel/frontend -- --config playwright.holdem.config.ts
```

德州浏览器测试默认读取 `demo-output/holdem-20261004-root/report.json`，端口 3014；可用 `HOLDEM_TEST_REPORT_PATH`、`HOLDEM_TEST_DELIVERY_REPORT_PATH`、`HOLDEM_TEST_PURCHASE_REPORT_PATH` 换成另一组公开证据。测试只有本地 Next/Chrome 和文件读取，不调用公网、模型或钱包交易。终局桌面/手机截图保存在 `frontend/test-results/*/holdem-terminal-report.png`。

## 真实部署配置

复制 `.env.example` 为 `frontend/.env.local`。把 `FRONTEND_MANIFEST_PATH` 指向真实部署清单的绝对路径（相对路径以 `frontend/` 为基准），保持 `FRONTEND_MODE=chain`。`deployment.example.json` 保留空的四合约地址，填写后才允许读取。

清单包含 `chainId`（十进制字符串）、`network`、`rpcUrl`、`explorerUrl`、`deploymentBlock`、`underwriterUrl`、`asset`、`contracts`、至少 3 个不同的 `agents`。`rpcUrl` 仅在 Next server 使用，不会进入页面。四合约地址必须与 Manager 及 Underwriter 接线一致。资产金额始终按链上验证的 `asset.decimals` 解释；原生资产用零地址及 18 位小数。

`FRONTEND_RPC_TRANSPORT` 仅接受 `direct`（默认）或 `system-https-proxy`。后者显式使用本机 macOS HTTPS 代理，复用 demo 的请求级传输；代理未配置就报错，不回退直连。RPC 每请求 30 秒，单个只读 HTTP 503 最多重试三次（共四次尝试，退避 250/500/1000ms），所有尝试共用原截止时间，读取结束关闭 provider 与传输连接。chainId 仍由真实 `eth_chainId` 核验。代理地址与服务器配置不发送给浏览器。

带 path API key 的 RPC 不放进公开清单。可将完整 HTTPS URL 保存为当前用户拥有、权限 `0600` 的项目外文件，设 `FRONTEND_RPC_URL_FILE=/absolute/private/rpc-url.txt`；Next server 的 dashboard 与拒绝证据读取均使用该覆盖，清单仍保留公开 RPC。该变量只保存文件路径，不使用 `NEXT_PUBLIC`；无覆盖时连接行为不变，文件/URL 校验失败不回退。

默认 Underwriter credit / Arena HTTP 时限保持 12 / 15 秒；显式代理模式使用 120 / 90 秒。Arena 时限仅以数值 prop 从 server Page 传给现有面板，不改变部署清单或 API schema、钱包授权期限或 SDK 行为。自动与手动刷新共用一个在途请求，每 20 秒尝试刷新，读取中不会重复请求。

Provider 的显示名与协议 ID 是独立字段，例如：

```json
{
  "name": "Compute relay",
  "address": "<真实白名单收款地址>",
  "relayUrl": "http://127.0.0.1:8788",
  "service": "infercredit/coder",
  "model": "coder"
}
```

`relayUrl` 是服务 base URL，SDK 请求其 `/v1/chat`。`service` / `model` 必须与 Relay 配置一致；logical model 并非上游实际模型名。没有 `relayUrl` 的 Provider 可显示白名单状态，推理操作不会启用。

配置 `arenaUrl`（通常 `http://127.0.0.1:8789`）后读取公开 catalog。Arena 必须声明题目 `language: "python3"`，并在可信服务端绑定 `taskId → agentId / problemId`，才可提交。每个 hidden case 启动独立 Python 3.12 容器，stdin 为一份 JSON 加换行，stdout 为一个 JSON 值。面板默认代码为空，可手动填写或使用推理返回代码；创建普通 escrow 任务不会自动成为 Arena 题目。

Underwriter、Relay 设 `FRONTEND_ORIGIN=http://127.0.0.1:3000`；Arena 设相应 `ARENA_UI_ORIGIN`。三个服务均通过固定配置地址请求；前端 API 是只读的 `GET /api/dashboard` 与 `GET /api/rejection-evidence`，没有任意 URL 转发或公开判决接口。浏览器服务 URL 不允许嵌入凭据或 query key。

## 读取与交易语义

- 每个 Agent 的现金、policy、完整任务与 loan 都使用其 Underwriter 快照区块；校验 chainId、资产 decimals、四合约和 block hash。活跃债务为所有 Active loan 的本金 + fee。
- 任务从 `nextTaskId` 完整枚举，P0 最多 200 项；超限会报错，不显示可能低估的债务。credit、档案与任务逐个读取，单任务字段及其余叶子业务 RPC 最多 8 并发，避免外层叠加；标准链检测仍保留。近期资金流与交易证据仅查询最近最多 2,000 个区块，每页不超过 100 块、最多 20 次日志请求，计数明确是窗口内数据。余额与债务按各自 Underwriter 固定区块的完整账本读取，旧借款不会因事件窗口滚动消失；公网延迟下完整读取可能需要数分钟。
- Tier cap 是每个任务的本金上限。实际 cap 使用该任务创建时的协议费快照、净 escrow、LTV 与 factor fee，分两次整数向下取整；已有 loan 的任务不能再次 draw。显示的额度不代表资金预留。
- 通过显式连接的 injected EIP-1193 钱包及 `ethers.BrowserProvider` 调用 `createTask`、`acceptTask`、`depositCash` 与 SDK 付款。ERC-20 approve 仅授权本次金额。没有私钥输入、浏览器私钥或 `NEXT_PUBLIC` secret。
- SDK 付款以 `paymentId` 持久化到当前部署 / Agent 的 localStorage。未确定的付款保留原 handle，恢复先查原交易 / Relay，禁止自动新建付款。钱包明确取消可用同一 handle 恢复。不要在付款未核实前清理浏览器存储。
- Arena 提交由当前 Agent wallet 签 EIP-712（chain / escrow / task / agent / codeHash / deadline），controller 决定 PASS / FAIL，独立 settler 唯一持 verifier key。两种结论都会触发真实链上结算，UI 核验对应 `TaskSettled` 回执并显示反馈 pending / sent。
- 钱包反向演示用真实 `payProvider` 的 `eth_call` 执行，明确不广播交易、没有 revert 事件。只读录像可显式配置 server env `FRONTEND_DEMO_STATE_PATH` 为本次 Monad demo 的 `private/state.json`，在面板点击“读取已执行的拒绝交易”。API 仅提取 hero / Account / `reverse.spendRejected` 所需字段，校验实际链、from/to/calldata、失败且无日志的 receipt 和记录区块，并在同区块用原参数 eth_call 复现 bytes；前端实际解码 `SpendRejected` 并显示原失败交易的 explorer 链接。金额来自原 calldata。只展示对应 Agent；未配置或无法核验时明确报错，没有缓存或 fixture 替代，不发送 private contexts / 授权签名，不进入自动刷新。身份冻结沿用档案状态。

## 本地视觉与测试

```sh
# 显式合成数据：640 Tier B、710 Tier A、170/default/identityChanged。
# 页面标记“本地演示 · FIXTURE”，钱包广播关闭。
npm run dev:fixture --workspace @agentfuel/frontend

# 首次运行链测试需要已有 Foundry artifacts。
forge build --root contracts
npm test --workspace @agentfuel/frontend

# 配置枚举、本地 CONNECT 代理、真实 chainId、503/连接清理与延迟时限。
# 无公网、付费模型或测试网广播；可独立定向运行。
node --import tsx --test frontend/test/transport.test.ts

# Anvil 实际 mined 失败交易 / 历史 eth_call，以及错误链、成功 receipt、不匹配 state。
node --import tsx --test frontend/test/rejection-evidence.test.ts
# 先 build；测试自建真实 Next production + Anvil，只用合成角色，无钱包注入/公网/模型调用。
npm run build --workspace @agentfuel/frontend
npm run test:browser --workspace @agentfuel/frontend -- --config playwright.rejection.config.ts

# 独立启动自己的本地 Anvil、Relay、Underwriter、Arena 与 settler；测试结束清理。
# 需要 Docker daemon 和 Arena 指定的已缓存 Python image，不访问付费上游。
npm run test:browser --workspace @agentfuel/frontend
```

Node 测试覆盖整数资产格式 / cap / 错误解码，以及 USDC-6、native-18 的真实读取与 BrowserProvider 交易。Chrome 测试覆盖桌面/手机的 Agent 切换、证据展开、错误展示、页面宽度，并完成浏览器钱包 → 真实任务 → SDK / Relay / Underwriter / Anvil 支付 → 钱包签名 Python 提交 → Docker 验收 → 独立 settler 原子清算。仅推理返回文本使用本地受控上游，其余步骤实际执行。合成钱包密钥只在测试 Node 进程使用，不发送给页面。

Playwright 默认使用本机 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，可用 `CHROME_BIN` 替换。视觉测试服务器端口为 `3010`，测试自建服务的 CORS 同步使用该 origin。未部署真实测试网、未调用付费模型时，不把本地验证描述为测试网 live。


Dashboard 身份区与导航（2026-10-13）：Agent 名称直接承载切换组件，钱包地址与复制图标位于下一行；顶栏提供首页、Agent、游戏大厅和协议入口。开户请求归左侧身份区，保留原请求恢复及凭证。右栏专家为紧凑卡片，动画随实际执行、规划、暂停状态变化；内置角色没有独立链上评分；按用户授权，右栏展示 monad-rebel 本地 Registry 的演示信誉快照，明确标为“参考信誉”，Reviewer 无对应记录仍未评级，不计算虚构 REP。详见 `docs/dashboard-goal-workspace-20261013.md` 的精修验收记录。

### 地址与交易分析（2026-10-13）

Dashboard chatbox 可直接输入 Monad 测试网合约地址或交易哈希；daemon 公告 `capabilities.goals.chainLookup` 后自动启用。任务结果与个人信息卡提供折叠的“查链来源与凭证”：固定区块、地址/交易浏览器链接、Sourcify 字节码匹配状态、原始读取结果、快照摘要，以及合并模型付款记录的 JSON 下载。RPC 凭据仅留在服务端。无源码时展示已有链上事实及未知项，不把部分源码验证当作完整审计。见 [实现与验收](../docs/chain-lookup-acceptance-20261013.md)。

Magpie 任务条已对照 monad-rebel 的 `PipelineSnake`/`snake-engine` 改为 Canvas 网格飞行：追踪真实阶段节点、产出后增长羽迹，失败/暂停停驻；支持手动暂停、减少动态效果与后台停止。运行帧由 ref + requestAnimationFrame 驱动，不通过 React 逐帧刷新。逻辑测试位于 `test/magpie-flight.test.ts`。

### Tabby 场景预览

在仓库根目录运行 `node scripts/preview-tabby-scenes.mjs`（Node 22+），打开 `http://localhost:3032/`。该独立页面复用工作台猫咪与专家组件，提供全链路场景样例和自动轮播，不连接模型或发送交易。源码在 `frontend/preview/tabby-scenes/`；状态契约见 `docs/tabby-agent-scenes-20261014.md`，验收见 `frontend/acceptance/tabby-scenes-20261014/README.md`。

### 完整 Dashboard 视觉验收

`node scripts/preview-dashboard.mjs` 启动 `http://localhost:3033/`。直接复用正式 `HostedApp`、三栏布局、动画、专家卡、chatbox、结果与资金组件；独立打包时将会话控制器替换为内存样例，正式入口不受影响。无需钱包或托管服务。顶部切换七个阶段，或播放完整流程；默认展示交付结果。使用桌面宽度画布适配视口，三栏始终可见。账户/金额/调用为验收样例，网络调用由独立页面 CSP 禁止。业务按钮不执行实际操作。重建静态资源可用 `node scripts/preview-dashboard.mjs --build-only`。

2026-10-14 样式收敛：任务、游戏、资金与借贷共用中间面板外框；chatbox 位于任务面板底部，嵌入游戏使用平铺内容与必要分隔。左侧短地址紧随 Agent 名称，“信息与凭证”复用其他操作的文字按钮样式，替代上文旧版第二行地址排版。验收页也加载实际游戏封面，使用空的离线对局目录；创建对局返回明确的样式验收提示，不连接真实游戏服务。

## 自主补给与外部协作

Dashboard 的“Pi 自主运行”使用已配置的比赛、奖励账本及原任务恢复能力；模型调用记录显示实际使用模型，预算不足时仅新调用降到批准的低价模型。外部服务启用时，右栏呈现发现的外部服务与价格/信誉，资料卡给出独立钱包、注册表及付款/request/assignment摘要。身份与凭证弹窗也汇总自主子任务的公开活动回执。

本轮完整本地执行与测试网准入范围见 [验收记录](../docs/autonomous-collaboration-20261014.md)。
