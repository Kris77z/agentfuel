# Tabby 多场景验收

本轮范围：公共真实活动事件、猫咪多场景渲染、专家联动、状态恢复与中断语义。设计来源：`docs/tabby-agent-scenes-20261014.md`。

## 预览入口

```sh
node scripts/preview-tabby-scenes.mjs
```

Node >=22，访问 `http://localhost:3032/`。预览复用正式 `MagpiePanel`（兼容导出名）、场景适配器和 `ExpertMesh`，输入为明确标注的场景样例。该服务只提供 HTML/JS/CSS，不连接执行器、模型网关或钱包，不发送交易。源码位于 `frontend/preview/tabby-scenes/`。

## 验收边界

- 场景样例用于检查界面分支，不当作链上运行证据。
- 后端本地测试用于检查活动记录确实由对应执行边界产生，不用计时器猜测业务结果。
- 用户现有 Monad 付款/合约验收记录保持原样，本轮不重复付款执行。
- 当前自主决策动作仍为 run-task/stop；动画不能暗示已支持自动去玩游戏。

## 本轮结果

- 后端：scenes/service/goals/autonomy-executor/pi-loop autonomy 目标组 89/89；task-executor/metered-task/game-executor 本地 Anvil/Docker 集成 16/16；输局结果保留修改后定向复验 1/1。
- 前端：`npm run test --workspace frontend` 64/64；`tabby-scenes-contract.test.ts` 验证实际 HostedService → browser proxy → scene 以及重启、owner 隔离、部分退款待对账。
- 构建：root/frontend typecheck 通过；`NEXT_DIST_DIR=.next-tabby-scenes npm run build --workspace frontend` 通过。现有 3024 服务未重启，不把旧进程称为新版本实网验收。
- 浏览器：3032 最终预览检查候选与已选专家联动、信息/凭证入口、游戏无奖励、部分退款金额与待确认状态、9 阶段回放静止、等待动画开关及窄屏布局；控制台未记录 error。
- 样例覆盖 39 个状态，输入经过公共活动 schema 检查。样例中金额与结果不作为实网证据。
- 文档和代码未提交。

截图：

- [专家选中与右栏联动](expert-selected.png)
- [历史回看](history.png)
- [窄屏](mobile.png)

已知边界：授信内部资格/报价没有独立细粒度回调；不宣称独立 REP 增量、全球专家发现或自主游戏。

## 运动修正复验

- 对照原 snake/Magpie 持续移动逻辑，新增实际行走、转向、候选巡视、目标附近停留/动作、待命散步、脚印轨迹。
- 运动与场景目标测试 13/13，frontend typecheck、diff-check 通过。
- 3032 浏览器实测：寻找专家时猫的 x 从 88.2 移动至 434.9；手动暂停后连续观察均为 395.5，恢复后继续；未记录 console error。
- [行走第一帧](cat-walking-a.png)、[恢复后的行走画面](cat-walking-b.png)。这是视觉复验，不新增业务调用。

## 纯展示画布修正

按用户反馈移除场景区域内所有点击控件，包括节点、详情、阶段列表与操作按钮；右栏专家信息/凭证及自动选中保留。此修正替代本记录此前的节点点击与面板内回放交互验收。frontend typecheck 与 diff-check 通过；3032 中该 region 的 button/a/summary/tabindex 数量为 0，猫 x 从 96.5 变化到 568.2，运动保留，控制台无 error。[最终画面](passive-canvas.png)。

## 节点收取与连续协作修正

- 猫靠近、嗅探、扑跃、吸收、离开；selected 专家节点缩小消失，保留已选标记并携带能力标签。确认的阶段产出可收取，未确认节点保留。
- 动画/场景目标组 14/14；最终运动组 3/3、frontend typecheck、diff-check 通过。覆盖窄屏边界、只收取一次、不收取候选/执行中节点、确认 OUTPUT 后收取。
- 浏览器先观察 selected 的 inspect，再确认 rest/collected=abi-interact；连续演示到达“阶段产出已保存”的 absorb 状态。预览样例共 40 个，新增“播放专家协作”串联 5 个阶段，画布仍为纯展示。

## 应用至正式 Dashboard

最终构建 `.next-tabby-dashboard` 通过，3024 已切换至新版本。浏览器访问 `http://127.0.0.1:3024/dashboard`，确认正式区域含 1 个 canvas、0 个点击控件；未创建状态下猫与身份节点无重叠。[Dashboard 截图](dashboard-applied.png)。当前 8792 后端未运行，未进行登录后的新任务验证。该记录取代前文“3024 未重启”的旧状态。

## 完整 Dashboard 独立验收页

3033 复用正式 HostedApp 全部三栏与主题，esbuild 仅在验收包中替换会话控制器及 Next 导航适配。包含示例 Agent、资金/信誉、任务阶段、结果、chatbox、专家卡；无需登录或后端，页面顶部明确样例。默认交付完成，可逐步切换或播放七阶段。iframe 保持至少 1280px 桌面宽度并适配窗口，避免窄面板只显示中栏。CSP connect-src none 阻断真实请求；无交易哈希，不虚构链上凭证。

frontend typecheck、独立打包、diff-check 通过。浏览器确认三栏、交付结果、阶段切换和 ABI 专家信息卡完整显示。

## Dashboard 面板统一

按用户要求由 GPT-6.1-sol / ultra 实现，主 Agent 浏览器复核。三个 tab 共用一个外框，任务内容与 chatbox 合并，输入区停靠底部；阶段、复核、交付物和嵌入游戏减少重复卡片边框。左栏地址与复制图标紧随名称，“信息与凭证”与暂停/资金入口共用文字按钮。复核时修正了右栏共享 profileLink 样式遗漏。

3033 的任务、游戏和资金 tab 已逐一检查，游戏封面正常；预览使用本地空对局目录，不连接游戏或金融服务。截图：[任务](unified-mission.png)、[游戏](unified-games.png)、[资金](unified-finance.png)。Frontend typecheck、diff-check 和 `.next-tabby-polish` 生产构建通过，3024 已切换新构建；未新增链上或付费模型调用。

## AI 对话 / Prompt Bar / 游戏头部

任务区参考 https://www.beautifului.dev/ 的交互层级实现本地 React 组件，保留 Tabby 终端配色：用户目标消息、Tabby 回复、像素加载、可折叠公开执行轨迹、独立复核、正文、复制/下载及费用凭证。新增内容以 900ms 渐进展开；首次打开、历史、暂停、失败和断连直接显示已有正文；这不是上游 token streaming。沿用原任务提交、预算和凭证契约，未新增聊天上下文后端。

Prompt Bar 调整为快捷指令、输入、底部模式/模型/预算/发送。浏览器已验收预设填入、Shift+Enter 换行、模式入口及等待模型→完成切换。游戏四卡恢复边框、移除 arena 文案，历史与回放进入头部 dialog，验证打开与 Escape 关闭；嵌入大厅不再出现 API/footer。

7 项任务状态/命令测试、frontend typecheck、diff-check 与 `.next-tabby-chat` 构建通过。3024 已切至该构建；3033 同步正式组件。截图：[游戏](chat-games.png)、[执行中](chat-thinking.png)、[AI 对话](chat-complete.png)。预览数据为内存样例，本轮不包含新链上交易或付费模型调用。

### 对话与输入区间距修正

移除错位的输入提示符，正文与 Prompt Bar 统一 20px 左右留白（窄屏 16px）；输入区单行基准 22px，模式下拉按内容宽度展示。完成状态并入作者行，压缩执行/复核之间的纵向间距。浏览器在默认窗口及 1366×768 检查：输入框和模式按钮 x 坐标一致；模式按钮约 87px 宽，Prompt Bar 约 126px 高。类型检查与 `.next-tabby-spacing` 构建通过；截图 `chat-spacing.png`。

### 原文优先与 Thinking 收拢

最终呈现覆盖此前复制/下载与作者状态行：发送方使用当前 Agent 名称，助手只保留 Tabby；Beautiful UI Thinking State 的折叠结构改为真实任务状态驱动，复核、阶段、费用及读取证据收进同一入口。取消下载，直接展示原文，复制使用带可访问名称的图标。动画区实测 160px、底部边框 0px，说明文案仅保留给辅助技术。

浏览器已检查完成态、等待模型、过程展开、独立复核详情及调用费用记录；截图 [chat-clean.png](chat-clean.png)。复制图标已接回原剪贴板实现；内置浏览器未返回可验证的剪贴板内容，不将复制完成计为通过。frontend typecheck 与 `.next-tabby-chat-clean` 生产构建通过；3024 已重启，3033 同步正式组件。此轮仅 UI 验收，没有新增模型/链上调用。

### 名称打开 Agent 资料

左侧独立“信息与凭证”按钮已移除，Agent 名称为原弹窗入口，多 Agent 切换拆为旁边的箭头控件。浏览器验证名称点击与 Escape 关闭；截图 [agent-name-profile.png](agent-name-profile.png)。全仓及前端类型检查、70 项前端测试和 `.next-tabby-profile` 生产构建通过。
