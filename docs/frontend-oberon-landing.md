# Oberon → AgentFuel 落地页

2026-10-11，按用户指定，读取私有仓库 [Kris77z/web-experience-four-sites](https://github.com/Kris77z/web-experience-four-sites) 的 `main`，固定来源 commit 为 `ba589426a46e67688fc69cdc65e1addd13e574ed`。本次仅在当前 AgentFuel checkout 添加落地页，没有注册新站点或部署。

## 来源与视觉对照

源实现为 `oberon-clone/public/index.html`；`oberon-re/recon/index.html` 保存相同原始 HTML。实现前读取源 HTML/CSS、字号与字体声明，并实际查看 `oberon-re/recon/recon-oberon-first-fold-1440x900.png`、`recon-oberon-full-page-1440.png`，以及 `oberon-clone/verify/local-final-1440x900.png`。源 README 说明此仓库是用于本地研究的 Framer 运行时镜像。

AgentFuel 保留原版首屏的六列纵向网格、左侧三分之一留白、第三列起的大标题、编号标签、灰白底 / 黑色正文 / 橙色强调、右侧橙色芯片与连接节点、像素波形底纹、横向双 CTA。下半页沿用左侧标题与右侧内容的分栏、两列能力卡、四步流程、深色机制段、灰绿奖励段、中心连接图、FAQ 与大标题页尾。手机改为单列，保留网格、编号、芯片与按钮结构；320px 单独约束标题三行和顶部操作宽度。

没有迁移 Framer bundle、遥测、原站链接、Oberon 商标、客户头像或客户数字。像素波形与连接图用独立 SVG / CSS 实现；主图标直接沿用 AgentFuel 已有 `components/icons.tsx` 的 Mark 路径。原客户证言、定价与客户案例段换为任务信用机制、托管配置和免费德州奖励。

| 源视觉结构 | 当前实现 |
| --- | --- |
| 首屏六列网格、Inter 75px / 500 / -0.05em、Geist Mono 辅助字 | `frontend/components/landing/landing-page.tsx`、`landing.module.css` |
| 编号导航、菜单、章节跳转、FAQ | `landing-menu.tsx` 的轻量客户端菜单；原生锚点与 `details` |
| 首屏芯片、连接图、文件节点 | `landing-page.tsx` 的自有 SVG 与 CSS；使用现有 AgentFuel Mark |
| 灰色像素波形 | `frontend/public/landing/pixel-wave.svg`；独立生成的确定性像素形状，CSS 缓慢横移 |
| 首屏进场动画 | 服务端输出的逐字符 / 词 CSS 动画、Logo 横向进入、文件列重排、芯片收缩后分层展开；刷新重播，减少动画或禁用脚本时直接显示完整内容 |
| 下半页滚动显示 | `IntersectionObserver` 渐进增强，与首屏进场分别实现 |

主字体来自官方 [rsms/inter](https://github.com/rsms/inter)，固定 commit `353b61b9f4430d5f420d56605a6e7993e0941470` 的 `docs/font-files/InterVariable.woff2`；同 commit 的 `LICENSE.txt` 保存在 `frontend/components/landing/fonts/Inter-LICENSE.txt`。辅助字体复用当前项目带 SIL OFL 的 `frontend/components/hosted/fonts/GeistMono-Variable.woff2`，对应许可仍在同目录 `LICENSE.txt`。两种字体通过 `next/font/local` 同源加载。

## 路由与产品事实

`/` 现在是落地页。原托管工作台完整迁至 `/dashboard`，仍使用 `HostedApp` 与 `TerminalTheme`。“创建你的 AGENT”进入独立 `/onboarding`，完成 Agora 风格终端配置后进入工作台；“进入工作台”直接进入 `/dashboard`；免费游戏大厅保留 `/arena`；协议与结算证据保留 `/advanced`；德州历史只读证据保留 `/arena/holdem`，主导航移除该项，入口收在高级协议的“历史演示与证据”及工作台折叠的高级入口。终端品牌链接返回产品首页，页面导航的“我的 Agent”与游戏 / 高级页的托管入口指向 `/dashboard`。

2026-10-10 的 [Agora 迁移记录](frontend-agora-migration.md) 中“首页 / 默认入口 / 四个路由”的描述是当时状态；其中托管首页现对应 `/dashboard`，原工作台设计和业务入口继续保留。本记录只说明本次落地页与路由变更，不重写原后端或历史链上验收范围。

产品文案依据当前 `README.md`、`AGENT_CREDIT_ENGINEERING.md`、`docs/hosted-agents.md` 和 `docs/hosted-acceptance.md`：平台创建托管 Agent，配置服务端支持的模型、三档策略与消费预算；运行平台支持的任务；以已托管任务报酬支持推理信用；独立验收后偿还本金及费用、积累 ERC-8004 声誉；免费德州争取赞助测试 USDC 或 Agent 专属模型额度。链上演示明确标为 Monad Testnet，游戏不借贷，额度不是可转让代币。机制图明确标为示意，没有虚构实时余额、用户量、收入或标准 x402 兼容声明，也没有 gas 赞助宣传。

## 首轮本地验证（静态布局）

`frontend/playwright.landing.config.ts` 使用独立端口 3024 / `.next-landing-test`，Node 22.23.2 与本机 Chrome。托管上游配置留空；浏览器拦截全部 `/api/*`，禁止外部请求与任何金融写操作。桌面 1440×900、手机 393×851、窄屏 320×740 共 9/9 通过：本地字体与资源成功加载、无页面异常 / 失效资源 / 横向溢出、标题保持三行且不与芯片重叠、顶部 CTA 不出屏、菜单 / Escape / 锚点 / FAQ 可操作、主 CTA 进入 `/dashboard`、终端品牌返回落地页。

首轮 FAQ 用精确文本定位时，原生 `summary` 包含装饰字符导致测试定位失败；改为按 `summary` 内容定位后完整通过。随后人工全页对照补充 `.content { padding: 0 }`，隔离旧全局 `main` padding，使下半页网格与首屏一致；最终生产构建及统一回归由主 Agent 串行验收。

浏览器截图在 `frontend/acceptance/landing/`：`local-oberon-{desktop,mobile,narrow}.png`，`local-oberon-full-{desktop,mobile}.png`。截图是本地静态落地页与被阻断的托管入口，未进行真实钱包签名、付费模型消费或链上交易，不能作为公开发布或主网奖励证明。既有托管、终端跨页测试只同步工作台路由与导航断言；本次未为静态文案编写重复实现的单元测试。

## 首次进入动效修正

首轮主要验收静态截图和导航，未覆盖源站首次进入时序；因此不能以首轮通过推断动效完整。补验重新运行固定 commit 的源站并采样实际时间帧，证据为 `frontend/acceptance/landing-motion/source-*.png` 与 `source-timeline.json`。原版标题按字符 20ms 错开、描述按词 80ms 错开；Logo 从左侧进入；文件列滑入；芯片先收缩停顿，再分层扩大并依次推出上、右、下三个节点。像素波形持续按 30px/s 横移。

当前实现用原生 CSS 关键帧与服务端文本 span 保留上述顺序，中文说明按词分段；不迁入 Framer 运行时。时间从本页样式首绘开始，不能直接等同于源镜像加载较慢的导航时间。减少动画和禁用脚本时完整静态显示；下半页滚动显示保持独立。


## 产品主线同步（2026-10-11）

按 [当前产品主线](../AGENT_CREDIT_ARCHITECTURE.md#当前产品主线2026-10-11-确认) 将能力区从四项扩为六项：信誉与评分、任务借贷、游戏赚资源、统一模型网关、执行与验收、Pi 自主执行。首屏、四步流程、系统图和页面 metadata 同步；FAQ 说明任务角色可切换、两个底层 LLM 的 Demo 范围、模型/服务报价与 usage 的区别、Pi 的授权边界，以及尚未开放的专家委托和按量额度借贷。保留 Oberon 排版与进场动效机制。

此轮只同步产品说明，没有新增金融、网关或自主调度能力。两模型网关联合部署未验收，不能从落地页能力介绍推断该链路已上线。验证结果见 [前端验收记录](frontend-release-acceptance-20261011.md)。


## Oberon 模块与动效复核（2026-10-11 用户复查）

用户反馈上一版缺少原站质感。重新运行同一固定 commit 的严格离线镜像，逐段检查能力区、流程、成果、案例和集成图后，确认此前只补首屏进场不足以代表原站完整动效。原站的章节分字显示、机械图标、四步连线和案例布局曾被简化成静态说明，本轮恢复其视觉结构与交互方式，并保留产品内容。

| 原版模块/特征 | 当前结合方式 |
| --- | --- |
| 首屏/页尾像素波纹 | 直接采用源 `iEh0WlD2mo4i3VmbpP52rJl0.png`，沿用 30px/s 横移与滚动缩放；不再用之前自行绘制的波形替代当前视觉。 |
| 章节标题分字出现 | 独立于首屏，在章节进入视口时逐字符显示，只播放一次；SSR/无脚本和减少动画偏好保持完整文字。 |
| 小型几何机械图标 | 使用原版橙色活动块、灰色构造线、文档/分流/上升图形语言承载六项能力；用原生 SVG/CSS 重建，未宣称与原 Framer 每个关键帧完全相同。 |
| 四步流程 | 恢复放大的编号、机械图标、虚线与传递中的节点，对应配置、执行、验收结算、信誉。 |
| Results 成果模块 | 展示已有测试网历史演示的 `640 → 710`、`B → A` 和 ERC-8004 身份关系；明确不是用户当前账户数据。 |
| Case studies 案例模块 | 恢复左侧叙事、右侧抖色大图、箭头切换及底部 NEED/ACTION/RESULT/CTA。三场景分别解释任务信用、游戏补给和信誉；沿用源案例图作装饰，不冒充客户、用户或执行截图。 |
| Integrations 集成图 | 恢复放射连接、活动节点与中心标记；外围替换为托管钱包、Magpie、Pi、独立验收、游戏奖励和 ERC-8004。它是系统关系示意，不表示所有资金/额度通路均已接通。 |
| 网格与排版 | 恢复贯穿章节的列线、橙色基准线和接近原版的字号/留白，手机独立适配。 |

两张源图片来自用户指定仓库同一 commit；本地副本为 `frontend/public/landing/oberon-wave.png` 与 `oberon-execution.png`（后者采用原仓库 1024px 变体）。图片只作页面素材，未迁入源站客户证言、收益数字、遥测或第三方远程资源。抖色由同源图片在浏览器一次绘制完成。循环动效离开视口/标签页后暂停；减少动画时完全静态；箭头可键盘操作并标明前后边界。

生产构建通过，生产版落地页 12/12、动效 12/12，覆盖 1440/393/320px。新增检查验证案例内容和 CTA 同步切换，以及章节文字终态、视口外暂停和减少动画行为。来源截图、当前截图、图片 SHA-256 和复核结果保存在 `frontend/acceptance/oberon-restoration/`；入口仍为 3024，构建目录 `.next-oberon-restored`。核心能力完整度另见 [实现状态](implementation-status.md#六项核心能力完整度复核2026-10-11)。
