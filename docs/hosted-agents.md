# 平台托管 Agent 服务

用户用自己的钱包签名登录，先命名创建平台托管的钱包，模型、策略、每次预算、总预算和是否允许信用在创建后的运行设置中调整。用户钱包只用于认证；新 Agent 的私钥由平台在私有目录生成和保存，浏览器不能指定私钥、RPC、provider 地址或奖励收款人。登录是带 origin、nonce、过期时间的个人消息签名，不称为 SIWE，也不发送链上交易。

## 启动

Node 22.19+。所有配置、角色 key、模型 key 和 RPC 文件必须为当前用户拥有的真实绝对路径、普通文件、`0600`，不得使用软链接。服务固定监听 `127.0.0.1`。TLS 由前端部署提供。

私有 `hosted.json`：

```json
{
  "version": 1,
  "port": 8791,
  "hosted": {
    "directory": "/absolute/private/hosted",
    "origin": "http://127.0.0.1:3000",
    "chainId": "31337",
    "models": [{ "id": "kimi-k2.6", "label": "Kimi K2.6" }],
    "maxAgentsPerOwner": 3,
    "maxTotalBudgetRaw": "1000000",
    "maxPerRunBudgetRaw": "120000"
  },
  "executor": {
    "taskConfigFile": "/absolute/private/hosted-task.json",
    "gameConfigFile": "/absolute/private/hosted-game.json"
  }
}
```

两个 executor 文件采用各自的 `HostedTaskExecutorConfig` / `HostedGameExecutorConfig`，不是命令或任意插件路径。task 接管注册、绑定、enroll、策略设置、入账和既有信用任务工作流；game 接管赞助游戏和奖励额度消费。三方模型 ID 集合必须完全相同，chain、Identity、Account、token、RPC、transport 和钱包锁目录必须匹配。task 的所有策略模板还必须属于同一业务合约域；task 模板中的 Relay、Arena、Underwriter 都是本机服务。guardian、gas sponsor、game sponsor 可共用已有 operator 锁下的签名钱包；opponent 必须与这三个运营角色不同，`--check` 离线核验实际 key 地址并拒绝冲突。

```bash
HOSTED_AGENTS_CONFIG=/absolute/private/hosted.json \
node --import tsx scripts/hosted-agents.ts --check

HOSTED_AGENTS_CONFIG=/absolute/private/hosted.json \
node --import tsx scripts/hosted-agents.ts --start
```

省略模式时执行 `--check`。检查只读配置和已有角色文件，不生成钱包、不创建运行目录、不构造 provider、不调用链或模型。`--start` 成功输出一行 `{ready:true,service:"hosted-agents",host:"127.0.0.1",port:8791}`。SIGINT/SIGTERM 先停止 HTTP admission，再等待已接收任务并释放锁及自有连接。异常退出后，确认旧进程停止，使用同一配置和 `--start --recover`；中断 run 保持 `Paused`，由用户用原 requestId 明确续行，启动不会自动重发。

前端仅设置服务端环境变量，不使用 `NEXT_PUBLIC_*`：

```text
HOSTED_AGENTS_URL=http://127.0.0.1:8791
HOSTED_FRONTEND_ORIGIN=http://127.0.0.1:3000
```

`HOSTED_FRONTEND_ORIGIN` 必须等于 HostedConfig.origin。部署时设置真实 HTTPS origin，cookie 自动加 `Secure`。未配置时 API 返回 `HOSTED_NOT_CONFIGURED` / 503。已有 Underwriter、fixed Relay、独立 settler 和 Arena 仍需按其运行手册启动；此入口不部署合约、不领币、不为运营角色补余额。task 配置如显式启用 gas 赞助，只从运营方指定且有总额上限的 sponsor 支付；默认关闭。新钱包没有所需资金时 provision 会保持可恢复的 `Paused`，不会换钱包或绕过链上检查。

## HTTP 与 Next 桥接

浏览器使用同源 `/api/hosted/*`，Next 将请求送往固定 loopback 上游。私有上游路由如下：

| Method | 路径 | JSON / 返回 |
| --- | --- | --- |
| POST | `/auth/challenge` | `{wallet}` → `{id,message,expiresAt}` |
| POST | `/auth/login` | `{challengeId,signature}` → 私有上游 `{token,expiresAt}`；浏览器仅 `{authenticated:true,expiresAt}` |
| POST | `/auth/logout` | `{}` → `{authenticated:false}`，同时清除 cookie |
| GET | `/agents` | 当前用户 `{agents,runs,models}` |
| GET | `/agents/:id/finance` | 当前用户所选 Agent 的只读金融快照；`confirmed` 或明确 `unavailable` |
| POST | `/agents` | `{requestId,name}` → Agent，202；自动异步 provision；`configurationRequired:true`，执行配置待设置。旧完整参数仍接受精确重放 |
| PATCH | `/agents/:id` | 上述六项设置（无 requestId）→ Agent |
| POST | `/agents/:id/pause` | `{paused:boolean}` → Agent |
| POST | `/agents/:id/runs` | `{requestId,action,rewardKind?,amountRaw?,goal?}` → Run，202 |

新增 `POST /agents/:id/cancel`，参数 `{requestId}`，仅用于停止本人目标任务的后续调用；未知付款先对账，不立即释放预留预算。

时间 `expiresAt` 为 Unix 毫秒。`strategy` 是 `conservative` / `balanced` / `aggressive`；action 是 `provision` / `deposit` / `task` / `reward-task` / `metered-task` / `autonomous` / `goal` / `game` / `credits`；只有 game 要求 rewardKind 为 `usdc` 或 `llm-credits`。只有 deposit 要求 `amountRaw` 为正整数字符串，且不超过平台 `maxTotalBudgetRaw`；其它 action 不接受此字段。金额是 token 最小单位的十进制字符串；USDC6 的 `120000` 是 0.12 USDC。每个操作使用 UUID requestId，原 ID 重复提交返回原操作，不增加消费；同 ID 改参数会拒绝。

`finance` 先验证用户归属，再复用固定 Underwriter 的评分、Tier、真实还款与声誉镜像。托管身份、协议接线、USDC6 精度、cash、policy 和全部任务债务均在该 Underwriter 的同一区块核验，返回 `observedAt` 与区块编号/hash/时间。债务包括本人所有 Active loan 的剩余本金与 fee，与请求记录保留窗口无关；沿用 P0 完整账本最多 200 项的读取上限，超限或无法核验时返回 `unavailable`，不返回伪零余额或评分。Tier 本金上限不等于即时可借金额，每笔仍由任务 escrow、policy 和协议限额约束。

金融读取只在选中 Agent、执行状态完成/暂停后或明确刷新时触发；普通 `/agents` 轮询不遍历链账本。相同 Agent 的并发读取共享一笔查询，且查询不占用操作准入锁。读取总限 45 秒，Underwriter HTTP 10 秒，Next 桥接与浏览器分别给出 50/55 秒期限。界面保留失败前已核验的快照时明确标为上次快照，切换身份与会话失效会隔离旧结果。

任务结果分别提供 `acceptTxHash`、`paymentTxHash` 与 `settlement`。后者包含已复读的 canonical `TaskSettled` receipt、区块、实际还款、escrow 清偿、结算入 cash 与 Loan 状态；任务的兼容 `txHash` 只取真实结算交易。`fromCashRaw/fromCreditRaw` 表示原付款来源，`principalRaw/feeRaw` 表示剩余债务，成功结算后可以为零。历史未分类 hash 不作为结算凭证。Monad Testnet 的凭证链接使用该链 explorer，本地链只展示 hash。

入账前，将 token 转至 Agent 的公开 `wallet` 地址，再提交 `{action:"deposit",requestId:"新的UUID",amountRaw:"40000"}`。平台以该托管钱包签名 approve/depositCash，资产进入绑定 Agent 的 Account cash；登录钱包不能代替托管钱包调用 depositCash。入账不调用模型，也不计算为推理预算消费。中断时保留原 requestId/amountRaw，恢复使用原记录，不重复存款。

上游认证使用 Bearer；浏览器只持 `agentfuel_hosted_session` 的 HttpOnly、SameSite=Strict、`Path=/api/hosted` cookie。Next 不返回 token，不转发浏览器 Authorization/owner/header；两层都核对 Host/Origin，没有开放 CORS。所有响应 `private, no-store`，错误只返回固定安全 code。用户只能读取和操作自己拥有的 Agent，平台钱包与用户登录钱包不同。

`GET /agents` 按更新时间返回最近 100 条请求，并保留全部未结束或仍被 Agent 引用的请求。服务重启后，旧暂停请求仍可用原 ID 恢复；恢复完成的结果会排入最新记录。

## 验证范围

```bash
node --import tsx --test services/hosted-agents/test/http.test.ts \
  frontend/test/hosted-agents-proxy.test.ts scripts/test/hosted-agents.test.ts
npm run typecheck:all
npm run build --workspace @agentfuel/frontend
```

HTTP 测试使用真实 HostedService、两名本地合成签名者和明确 synthetic executor，验证签名/会话/归属、UUID 幂等与 Next cookie 端到端；桥接测试覆盖请求白名单、host/origin、私有输出投影、大小限制和安全错误。CLI 测试只用私有本地配置和受控本机资源，不调用真实模型或公网链。UI 组件与用户交互验收另行完成，不能把这些传输测试称为真实链上托管流程已通过。

2026-10-07 执行 Agent 定向结果：HTTP 3 项、Next 桥接 5 项、CLI 3 项，共 11/11 通过，0 fail/skip；`typecheck:all` 通过。真实 HTTP 302 目标收到 0 次请求，原上游只有 1 次请求。生产 build 由 root 统一复验；本批尚未部署公开用户入口，也未完成 UI 验收。

同日 deposit 接线续批：CLI 增加 opponent/operator alias 检查，HTTP 与 Next 扩充 deposit 金额、UUID 幂等、金额非法和参数冲突验证，合计 12/12 通过、0 fail/skip，`typecheck:all` 通过。这里仍是传输与离线配置证据；真实入账链上 receipt 由核心/adapter 集成测试另行验收。

最终 root 验收（含用户创建、真实本地链入金/任务/USDC奖后下一单/额度消费）见 [托管交付](hosted-acceptance.md)。上述 synthetic HTTP 测试与真实本地整合测试分别说明，不能把后者称为真实供应商或 Monad 新开户验收。


## 用游戏奖励额度运行任务

工作台“用奖励额度运行”提交 `{action:"reward-task",requestId:"新的UUID"}`；资金页同样指向实际任务，旧 `credits` 短确认接口保留兼容。该 action 使用 Kimi K2.6 奖励账本，USDC `reservedRaw`/`chargedRaw` 为 0，返回 `creditsUsed`、接单和独立验收结算凭证。配置、任务、模型、链上身份仍由服务器白名单决定。用户自行准备原生 gas。

Pi 在每轮持久化供应商请求前核验可用额度。不足时返回 `Paused / INFERENCE_FUNDING_REQUIRED`；只允许为该原请求追加 `game / llm-credits`，服务端生成 `fundingFor`，浏览器不能指定它。游戏结束后恢复原任务为 active request，再用原 UUID 恢复执行。补资沿用游戏名额和原任务截止时间；未知调用不会解锁此入口。没有自动借款或转成 USDC 支付。

生产 daemon 将 game executor 的同一私有账本注入 task executor；没有新 key、客户端 grant 或任意模型入口。本地整合证据见 `services/hosted-agents/test/reward-task.test.ts`。按量 token 借贷、双模型 Magpie 联合验证和 Pi 连续经营决策仍未完成。


## 2026-10-12 核心运行补齐

新增 `metered-task` 与 `autonomous`：任务报酬担保购买不可转移的推理额度包，包内双模型按输入/输出 usage 差异扣费；奖励不足时可在同一 Pi 任务补额，独立验收后按合约还款/清算。有界 LLM 决策选择下一单、模型与现金/信用，宿主限制预算、任务数与截止时间。游戏不借贷、无 gas 赞助。包价与供应商账单分开，未用包额度绑定原任务；规划费现金支付。

本节替代上文这三项“尚未实现”的当前判断；历史外部验收范围保持原样。详细配置、边界与复现见 [核心运行说明](core-runtime.md)。

## 自然语言目标（2026-10-13）

`goal` 单独接受 1–12000 字符的 `goal` 原文，保持 owner、Agent、UUID 与目标绑定。请求正文最多 65536 字节（其它操作仍 8192）；同 UUID 改目标拒绝。默认模式是完成个人目标，其余接单、游戏、入账在同一操作下拉框中。原请求未结束时不能改变模型或预算；恢复沿用原路由、价格、付款 handle 和截止时间。

daemon 可配置 `goals:{durationMs,models:[{id,relayUrl,provider,priceRaw,service,model,physicalModel,responseModel}]}`，模型集合必须与 hosted 目录相同。本地和 Monad runtime 提供 `tabby/mission` 两条 Relay，经 Magpie 转至 K2.6/K3，每次固定价分别 10000/20000 raw USDC；这是协议调用价，不等于上游供应商账单。所有个人目标用 task 0 的 cash 支付，无 escrow 时不能虚构信用、报酬或信誉。

复用 Agora Commander 的逐阶段专家编排：原目标 → 1–3 阶段 → 累积上阶段产出 → 单独模型复核。支持写作、基于提供资料的分析、代码生成与审阅，以及复用 monad-rebel 的 ABI 解读、Gas 优化、Token 风险扫描、交易解码、收益策略比较五项专用定义；共八个执行角色加独立 Reviewer。启用 `goals.chainLookup` 后，合约地址/交易哈希会自动读取当前 Monad 测试网 RPC 与 Sourcify 验证资料；未接入任意网页、外部账户、宿主文件/命令或代码执行工具。缺能力/必要信息时明确返回 `needs-input`。这不是将 Agora 的 BNB x402、外部专家网络整体原样搬入；付款与身份使用本项目 SDK、现金账户与私有 journal。代码是否能运行仍需执行测试，模型复核不能充当运行证明。

公开 Run 的 `mission` 只含阶段、产出、复核与调用费用/usage/凭证；key、raw transaction、provider endpoint 等留在私有 journal。已知交付异常仍计入已确认费用；未知调用保持暂停与预算预留，恢复只核对原付款。操作详情和逐次凭证在界面折叠展示，最终结果可下载 Markdown。新增范围、证据与边界见 [Dashboard 交付清单](dashboard-goal-workspace-20261013.md)。

五项定义保存在 `services/hosted-agents/src/specialists/monad-rebel`，原 `config.json` / `prompt.md` 按文件 SHA-256 留存来源。`catalog.ts` 统一规划路由、前端角色和 daemon 公告；`execution.ts` 复用原按任务类型选提示词及 JSON 正规化，额外校验 Gas/Token 报告结构。模型请求沿用 Magpie 和持久化 cash 付款链，错误输出仍记已付费用，恢复沿用原请求与提示词。公开调用记录增加 `serviceId`、有效提示词 `promptDigest`、付款请求 `requestDigest`；链上付款证明绑定请求摘要，不把模型分析当作链上事实证明。地址/哈希的自动读取由本项目新增 `chain-lookup.ts` 提供；monad-rebel 专家负责分析。读取快照与模型付款记录一起公开，详见 [自动查链与验收](chain-lookup-acceptance-20261013.md)。

### 过期目标付款

目标调用恢复时，已签名但未付款的过期报价通过 `voidExpiredGoalPayment` 对账。只有规范链证明旧 nonce 已被使用且原 payment 为零才终止；必要时由 Agent 钱包发送同 nonce 的零金额自转账，签名先落盘，恢复重用。未签名过期报价可在零付款确认后结束。旧付款若先上链，继续原付款对账，不能当作未消费。Gas 由 Agent 自付；余额不足仍保留待处理状态。原目标的已交付费用与产出始终保留，具体链上验收见 `chain-lookup-acceptance-20261013.md`。

## 2026-10-14 · 自主资源与外部协作

自动参赛补现金/奖励 token、原自主任务补给和恢复、真实外部目录发现/付费雇佣、同任务新调用按预算降档已接通。每次调用保留真实模型与付款 route，Unknown 不重派；目标交付继续独立复核。自动游戏共用 owner/global 赞助限制，逐场持久准入；无比赛的自主任务不占赞助名额。详细接线、实际测试证据与 Monad 准入范围见 [本轮记录](autonomous-collaboration-20261014.md)。
