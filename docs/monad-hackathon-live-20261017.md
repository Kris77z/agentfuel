# Monad 黑客松公网彩排 · 2026-10-17

状态：本轮公网彩排与现场待命验收通过。承接 [10月16日准备审计](monad-demo-readiness-20261016.md)，已完成信用连续接单、外部专家雇佣及修订复核、同目标模型降档、零现金自动参赛后接单，以及同一 Agent 用获奖 token 完成下一单。用户原钱包下的新演示 Agent、最终前端、备用任务、Gas与借贷池均已核验。结论限于本轮实际执行与观测时点，原始记录见[证据索引](../frontend/acceptance/monad-hackathon-20261017/README.md)。

## 已完成部署核验

- 公网 `https://monad.tabbyai.xyz`，Monad Testnet10143，六位测试 USDC；沿用原合约、Bootstrap、runtime、gateway、钱包与恢复路径。
- `2026-10-17T02:25:25Z` 切换至 `.next-monad-vps-demo-20261017`。10份应用源码修复已部署，新 Next 生产构建通过；旧视频页及输出保留。
- 维护前后三个旧零费用开户请求继续暂停；原9个 Agent、48条请求保持一致，业务数据库 SHA256 `3ca329ff1c3ba283cbd7e84c66be1b954e630c34c144f13dc7d314d086a50d41`。三个 Tempo 进程 PID 保持不变。
- 公网中英首页、创建页、Dashboard、游戏、资金跳转与技术视频页检查通过；匿名 Hosted401、外站 Origin403、临时钱包签名登录与退出通过。认证的零 Agent 快照返回正确 owner。健康检查未创建 Agent、付款或调用模型。
- 本轮显式准备费用、资金与身份，不重置赞助配额、旧违约、旧付款或失败记录。测试 MON/USDC 是本次运营彩排准备，不是产品 Gas 赞助。
- `2026-10-17T02:57:02Z` 部署6份结算恢复源码：Arena 将独立测试结果先持久化，再请求结算；原提交出错后沿用原 runId、payload、签名与 raw transaction 恢复。队列内保存完整最新状态，避免并发任务覆盖验收凭证。停止、冷备、恢复三个 Monad units，业务历史和 Tempo 进程保持一致；已完成的 Next 输出未改变。

- `2026-10-17T03:27:34Z` 发布 Monad 钱包切网入口；`03:47:01Z` 切换至最终输出 `.next-monad-vps-demo-ready-20261017`，补齐切网退出竞态与按已认证 owner 保存 Agent 选择。仅 logout401 表示已退出，403、5xx及网络错误继续失败；选择偏好不能建立身份或越权选择。每次均停止三个 Monad units、冷备、创建新输出后切换，以原 runtime `--recover` 启动。
- [最终部署核验](../frontend/acceptance/monad-hackathon-20261017/deployment-public-summary.json) 确认18份运行源码哈希一致、六个 Monad/Tempo units 均 active、三次前端发布期间业务数据库不变、Tempo原进程PID不变，nginx配置未改。[发布后只读健康检查](../frontend/acceptance/monad-hackathon-20261017/public-health-summary.json) 再次核验页面、认证与Origin边界；Magpie请求138、钱包nonce、业务记录与游戏名额均无新增副作用，原9个 Agent／48条请求及三个旧暂停开户记录保持原状。

## 执行与凭证

### 信用、任务收入与连续接单：通过

[两单完整凭证](../frontend/acceptance/monad-hackathon-20261017/credit-loop-public-summary.json) 在 `2026-10-17T02:58:31.902Z` 确认 `acceptancePassed=true`。新 Agent2367 从现金40000、债务0、InferScore500/C开始，两次显式接单，累计授权240000；这两单用于验收现金与信用路径，不冒充 Pi 自主规划。

| 任务 | 现金 + 借款购买推理 | 还款（本金及费用） | 报酬结算后现金 | 评分 |
| --- | --- | --- | --- | --- |
| 20 | 40000 + 80000 = 120000 | 92000 | 58000 | 570 / C |
| 21 | 58000 + 62000 = 120000 | 71300 | 78700 | 640 / B |

两单均为真实 Magpie → Kimi K2.6 响应，usage分别234/235 tokens，独立 Docker 各5项通过，canonical `TaskSettled`、`LoanRepaid` 与实际现金入账一致。最终债务0、成功2、还款2、违约0；达到 B 档后，后续任务的协议借款费率由1500bps降为800bps，第二笔借款仍按原冻结的1500bps偿还，没有追改原费用。金额均为六位测试USDC raw单位，10000 raw = 0.01 USDC。

Task21 第一次结算因 verifier Gas 不足暂停。[原交易恢复凭证](../frontend/acceptance/monad-hackathon-20261017/settlement-recovery-public-summary.json) 记录：原交易需预留404000000000000000 wei，账户仅有45548200000000000 wei。显式补充0.4 MON后，经正式恢复入口，仍以原结算哈希 `0x65805541c4cc00a7fff64114a443b29518f8511ce824847e75f929eaf5ba3ed2` 在区块71707843成功，没有替换原付款、UUID或签名。旧 HTTP 记录未保存 tests，但任务仍 Assigned，因此重新执行原代码的5项 Docker，并严格匹配原 settler verdict/evidenceHash后恢复；不把这次旧格式迁移描述为零重复 Docker。新格式正常恢复直接复用已保存 tests。

两个原 UUID 重放后，Agent及所有执行角色 nonce、Magpie请求数125、gateway journal digest、Agent支出240000均不变。该摘要包含每次付款、结算、区块、真实物理响应摘要、独立测试及前后金融快照，不发布模型原文。

### 外部专家雇佣、一次修订与独立复核：通过

[外部雇佣完整凭证](../frontend/acceptance/monad-hackathon-20261017/external-public-summary.json) 在 `2026-10-17T03:08:04.454Z` 确认 Agent2368 的原请求 `ec4dc262-f27f-4b14-9b45-79ecaa60bea7` 为 `Succeeded`、`acceptancePassed=true`。授权上限60000，实际五次 Kimi K2.6 调用共50000，现金60000→10000、债务保持0。

| 调用阶段 | 执行角色 | 实际费用 raw |
| --- | --- | --- |
| plan | 平台规划 | 10000 |
| phase-0 | 已批准的独立外部 Writer，链上 Agent1999 | 10000 |
| review | 平台独立复核，首次未通过 | 10000 |
| revision | 按原复核意见修订 | 10000 |
| revision-review | 平台独立复核，最终5项通过 | 10000 |

外部发现、身份、冻结服务选择、真实付款与物理响应均已核验。外部 Writer 的实际付款为 `0xb6bb4f31572523bf6f0221fbe58fc51d063b76f2b0f9ef7fb8f4b70ad443bda3`，区块71708489，收款方与 Agent1999 链上钱包一致。原阶段185字符产物保留，119字符修订稿单独作为最终交付；摘要保留两份产物的 digest、全部五次付款、两次复核的结果与模型 usage，没有覆盖首次未通过记录或将五次调用缩成三次。原 UUID 重放后结果一致，Agent nonce9→9，Magpie请求134→134，没有新增交易或模型调用。

此分支证明已批准外部服务的发现、付费雇佣和交付复核。自然语言目标未产生托管任务报酬、借款或还款信誉；模型独立复核也不等于外部事实预言机。

### 同一目标预算不足，后续调用降到低价模型：通过

[同目标降档完整凭证](../frontend/acceptance/monad-hackathon-20261017/fallback-fresh-public-summary.json) 在 `2026-10-17T03:06:39.037Z` 确认新 Agent2369 的原请求 `42b44691-cd80-4452-b334-cffdb769a5d6` 为 `Succeeded`、`acceptancePassed=true`。用户选择 Kimi K3，原目标、Agent、请求 UUID 与50000总授权保持不变；实际顺序如下。

| 阶段 | 实际模型 | 实际费用 raw |
| --- | --- | --- |
| plan | Kimi K3 | 20000 |
| phase-0：analyst | Kimi K2.6 | 10000 |
| phase-1：writer | Kimi K2.6 | 10000 |
| review | Kimi K2.6 | 10000 |

总费用50000，现金50000→0、债务0。原 analyst 输出确实进入 writer 的 `previous` 上下文，最终交付保存原标记及计算结果，独立复核5项通过；不是另建一个便宜模型任务替代原目标。每次付款均与保存的原 handle、独立外部专家凭证、真实 Magpie 响应匹配。原 UUID 重放后结果一致，Agent nonce8→8，Magpie请求134→134，没有新增交易或模型调用。该新验收未增加预算，也未改写此前失败或 recheck 的记录。

### 零现金自动参赛、获奖、借款接单及结算：通过

[Pi 自动闭环完整凭证](../frontend/acceptance/monad-hackathon-20261017/automatic-fresh-public-summary.json) 在 `2026-10-17T03:13:09.931Z` 确认新 Agent2370、原自主请求 `2e236229-c9fe-4f54-bd39-1f2ecabfc751` 的 `fullFreshAccepted=true`、`automaticGameToSettledTaskAccepted=true`。开始时现金0、奖励 token0、债务0、违约0、InferScore500/C；该 Agent 显式准备0.6 MON Gas，没有现金垫款，也没有清除违约、解除冻结或刷新游戏名额来制造成功。

1. 自主流程在现金不足时自动参加真实德州比赛，游戏子请求 `08f4517e-b7c2-429e-8b95-1f166f56feb2` 以 `rewardKind=usdc` 参赛，用户支出0、禁止游戏借贷。两次真实 Kimi K2.6 决策分别使用314、312 tokens；本场获胜，100000 raw USDC 奖励实际入账，付款凭证 `0x79b5e14c4ef5670c4e020e8ccaec38115b4080b038b95aded2ad2a3104f04c4b`。
2. Pi 使用10000 raw现金购买一次真实规划，之后用90000 raw现金加30000 raw借款，购买120000 raw推理额度包。任务子请求 `77a1d59c-14c6-44e1-821e-efa96df50328` 接取已托管150000 raw报酬的任务22，真实 Kimi K2.6 解题调用使用234 tokens。
3. 独立 Docker 五项通过；区块71710728的 canonical 结算 `0x3fc2b201e38fd1b9b638e99aa1200e191aad2a9af7e188499e10227dee0747b1` 偿还本金30000及费用4500，剩余115500 raw进入 Agent现金。最终债务0、还款1、成功1、违约0、InferScore570/C；自主请求累计支出130000，等于原总授权。
4. 可信目录无剩余可用任务后，原自主请求以 `Succeeded`、`Stopped / AUTONOMY_NO_AVAILABLE_TASKS` 正常结束，`completedGames=1`、`completedTasks=1`、无未完成子请求。该结束原因保留，不改成继续运行或隐藏停止状态。

终态重放使用同一父 UUID：Agent及各执行角色 nonce、Magpie请求136、游戏供应商尝试2、游戏子请求1、奖励额度兑换0和游戏名额计数均不变，`noNewEffectsVerified=true`、`noReplacementUuid=true`。游戏决策与规划／解题各有实际 usage、响应 digest 和 canonical 交易记录；游戏模型路径与 Magpie 规划／解题路径分别取证，没有把本场胜利描述成稳赢。此自主父请求覆盖 USDC 奖励路线，后续显式 token 奖励分支独立记录如下。

### 同一 Agent 显式赢取 token 并完成下一单：通过

[token 补充完整凭证](../frontend/acceptance/monad-hackathon-20261017/token-supplement-public-summary.json) 在 `2026-10-17T03:25:32.310Z` 确认 `fullAccepted=true`。沿用 Agent2370、同一 owner 和已有游戏名额账本，不创建替代 Agent、不重置名额；本次是显式新增的一场 `llm-credits` 奖励游戏及 `reward-task`，与前述 USDC 自动参赛父请求分别验收，没有把它写成 Pi 自动流程多跑了一局。

游戏原 UUID `203d493f-bd7c-4b48-a5b6-01dd3edc092d` 本场获胜后获得4096个绑定 Kimi K2.6 的推理 token，游戏 USDC 报酬0、用户费用0。两次实际模型决策分别使用315、311 tokens，独立 grant 保留比赛回放摘要和获奖分配。任务原 UUID `c544e73c-2a06-48d4-8ac7-e29aaeb3c76f` 随后接取任务23，以这份奖励额度调用真实 Kimi K2.6，输入190、输出32，共扣222 tokens；没有新增 USDC 推理付款或借款。

独立 Docker 五项通过，canonical 结算 `0xdd8759d5f010b3ed97454d6da351572a97e6f2154f217122481052da411a384f` 在区块71713114将150000 raw任务报酬全部计入现金：115500→265500。该任务 `loanStatus=0`、还款0、罚没0，债务保持0；成功数1→2，InferScore570/C→600/B，而真实还款次数仍为1，没有把无借款任务计成一次还款。

原游戏和任务 UUID 重放后，两项结果及原自主父请求均不变，`originalUuidsPreserved=true`。各角色 nonce、Magpie请求136、游戏供应商尝试2、grant1、兑换1、同 owner名额2与全局名额6均未增加，奖励账本、比赛回放和任务执行器 digest也保持一致。此分支证明本次真实获奖 token 已可用于实际任务，不保证每次参赛获胜，亦不代表免除链上 Gas。

### 用户 Rabby 钱包的真实信用闭环与运行准备：通过

[用户钱包双任务凭证](../frontend/acceptance/monad-hackathon-20261017/presenter-credit-loop-public-summary.json) 在 `2026-10-17T03:33:58.772Z` 确认 `acceptancePassed=true`。Agent2371 的 owner 是用户现有钱包 `0x48aEd9c702B97A18A520edA3BB04d959453f0B80`，独立执行钱包为 `0x74E7836593cd63Dc5E64bcFd279D1600fb211669`；本轮用户已通过 Rabby 个人消息签名登录公网页面。两次显式 `metered-task` 均以真实 Magpie → Kimi K2.6 执行，分别使用230、234 tokens，并各经独立 Docker 五项验收。

| 任务及原 UUID | 现金 + 借款购买推理 | 本金及费用偿还 | 结算后现金与评分 |
| --- | --- | --- | --- |
| 24：`3aa102da-5586-4f94-91bf-f6c9924e05ef` | 40000 + 80000 = 120000 | 92000 | 58000；570 / C |
| 25：`23487a67-fce7-4a79-b316-80caf8a0a546` | 58000 + 62000 = 120000 | 71300 | 78700；640 / B |

最终债务0、真实还款2、成功2、违约0，累计支出240000；原两单 UUID 重放后，Agent及各执行角色 nonce、Magpie请求138、gateway digest和累计支出均不变，没有新付款、模型调用或交易。原始双任务的付款、结算、物理响应摘要与金融快照保留，未把准备中的下一单混入这两单的通过结论。

[演示 Agent 授权准备凭证](../frontend/acceptance/monad-hackathon-20261017/presenter-ready-public-summary.json) 在 `2026-10-17T03:39:14.823Z` 单独记录显式配置操作 `35f9cc5f-2718-4311-8267-a09fb014ad62`：

| 平台运行授权 | 调整前 | 调整后 |
| --- | --- | --- |
| 单个任务上限 `perRunBudgetRaw` | 120000 | 120000 |
| 累计授权 `totalBudgetRaw` | 240000 | 500000 |
| 已支出 `spentRaw` | 240000 | 240000 |
| 剩余累计授权 | 0 | 260000 |

Agent 状态 `Ready`、预留0，现金78700、评分640/B、债务及违约0、协议未冻结。剩余累计授权可覆盖一次 Pi 父流程的10000 raw规划加120000 raw任务成本；单个任务上限仍是120000，未改成130000。该配置操作没有新增业务执行、模型调用或链上写入，owner与Agent nonce均不变；原双任务的14份原始凭证、结果及 canonical 复查通过，同一 owner 的其余三个旧暂停 Agent 及请求保持原状。

这是平台累计授权调整。该时点链上 `maxDebtPerDayRaw` 仍为240000，`maxCashPerTxRaw` 与 `maxDebtPerTxRaw` 均为120000；原 policy未改写。后续正常业务请求会在原交易工作流内同步需要的 policy，不能把当前平台500000授权描述成已经链上生效。

最终发布后，用户通过原 Rabby 钱包完成个人签名登录。[公网浏览器验收](../frontend/acceptance/monad-hackathon-20261017/public-browser-summary.json) 确认刷新仍保留 Agent2371、原任务和资金 tab；资金显示640/B、cash0.0787 USDC、债务0；设置显示单次0.12、累计0.5 USDC并允许任务授信。四个练习游戏与奖励德州入口正常呈现，个人卡包含11笔交易；外部 Writer卡显示真实 Agent1999与收款钱包，该演示 Agent未调用它，因此显示调用0和未评级。浏览器验收只查看已有数据，未提交新业务、调用模型或发送交易。

最终截图：[任务](../frontend/acceptance/monad-hackathon-20261017/public-task.jpg)、[游戏](../frontend/acceptance/monad-hackathon-20261017/public-games.jpg)、[资金](../frontend/acceptance/monad-hackathon-20261017/public-finance.jpg)、[个人凭证](../frontend/acceptance/monad-hackathon-20261017/public-agent-evidence.jpg)、[专家身份](../frontend/acceptance/monad-hackathon-20261017/public-expert-evidence.jpg)。

## 资金补充与现场待命

本轮已核验5 MON补充到账：补充时节点实读运营 Gas 钱包余额从0.077664554 MON增至5.077664554 MON，后续已实际用于本轮准备和执行。该余额观测不对资金来源作归因，也不把此前官方、QuickNode或Alchemy领取页面视为成功到账凭证。

为后续两单准备的 verifier Gas 已实际补充0.6 MON：交易 `0x49133d830431719eba9b222883accf04af8f3d31cc63ed13f1ffafc7d0521714`，区块71714954，补充后该时点余额0.8255482 MON。该记录仅证明结算方 Gas 准备，不代表后续两单已经执行。

任务20–25均已结算。[备用任务创建](../frontend/acceptance/monad-hackathon-20261017/standby-task-creation-public-summary.json) 与[待命核验](../frontend/acceptance/monad-hackathon-20261017/standby-tasks-public-summary.json) 确认新任务26、27为 `Open`（枚举1）、未分配 Agent，每单托管150000 raw报酬、目录授信上限80000 raw。最终维护经 `Applied` 审计 `86382d230ce704ba1d2ab7b9c3b87a3d9edc36b87748c8864717db20eb5ead22` 加入原目录，追加没有链上写入。两单截止 **2026年10月20日11:30:42（北京时间）**，核验时未过期、未被提前领取。

[最终资源核验](../frontend/acceptance/monad-hackathon-20261017/resources-public-summary.json) 于 `2026-10-17T03:52:18.497Z` 确认：Agent2371 Gas0.384606192 MON，verifier0.8255482 MON，运营钱包1.50020577 MON，均无 pending nonce；信用金库可贷10167006 raw、未偿0，全球及当日可用额度足够两笔80000 raw任务授信，draw未暂停。赞助方另有399500 raw测试USDC，演示owner已用游戏名额0，原全局已用6。Agent现金78700、剩余授权260000，可覆盖两次10000规划加120000任务包成本；单个任务仍受120000上限约束。Gas准备是本轮运营测试操作，不是产品 Gas赞助。

现场顺序：

1. 打开 [公网 Dashboard](https://monad.tabbyai.xyz/dashboard)，使用原 `0x48aE…0B80` 钱包，确认 **Tabby credit loop 2026-10-17（Agent2371）**。当前浏览器已登录并停在该 Agent。
2. 先展示两单结果、640/B信誉、零债务与个人卡付款／还款／结算凭证，再看资金tab的余额和授权。
3. 现场执行自主接单时，在操作类型选择 **Pi 自主运行**，使用有限累计授权运行备用任务；这会产生新的真实执行与费用，待命验收未提前启动。
4. 游戏tab展示练习与奖励入口；USDC自动比赛、token获奖及消费由本轮各自摘要和回放证明。自由输入目标展示模型规划、专家执行和独立复核；授信与报酬结算在托管报酬任务路径展示。

当前版本的5份验收脚本与2份前端 unit 测试合并复跑43/43通过（含嵌套测试），其中验收脚本30项；goal 脚本10/10包含在这30项中，不重复累加。此前修复阶段另有原提交恢复单元15/15、相关真实Anvil回归2/2、新Arena真实Anvil/Docker恢复2/2、HTTP持久化2/2与类型检查通过。完整Arena批次首次有一项既有Docker启动检查临时失败，该项单独复跑通过；这不代表首次整批全绿，也不替代本轮公网交易凭证。

最终钱包／owner／proxy单元26/26通过；浏览器定向50项全部覆盖通过（首批48项，两个过时测试交互修正后单独复跑2项），含刷新偏好10项、切网12项、账户隔离、旧请求竞态和创建后刷新。此前90项批次的两个移动端测试操作失败也已在定向复跑中通过，不描述为原批次首次全绿。最终 `typecheck:all`、生产构建及文档链接检查通过。

私有 owner key、cookie、付款签名、模型原文与恢复 journal 保留在原私有运行目录，不发布。公开证据仅投影请求 ID、模型/usage、金额、输出摘要、独立 verdict、交易与区块，以及零新增重放结论。
