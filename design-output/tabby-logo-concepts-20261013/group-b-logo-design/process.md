# B 组设计过程 — Tabby

日期：2026-10-13。实际使用的 skill：`/Users/jungle/.codex/skills/logo-design/SKILL.md`，来源 `https://github.com/kaankiziltug/logo-design-skill`。这是三款概念的交付检查点；没有制作用户选定后的整套 Logo kit，也没有替换网站。

## Brief

Tabby 为开发者和 Agent 操作者提供托管自主工作平台；Agent 有独立钱包、预算和策略，完成任务、取得报酬、偿还推理信用、积累信誉，再继续接单。品牌的核心承诺采用 **Reputation you can spend**。Logo 必须跨 Monad、Tempo 使用，不绑定链或币。品牌语气：精确、可靠、有边界、持续、亲切。外观约束使用主 Agent 现场研究得到的首页纸面 `#f1f0ee`、炭黑 `#202020`、橙色 `#ff5900`，Inter / Geist Mono；Swiss 工业几何、直角模块、像素波；导航使用约 22 px 符号。深色工作台或 CRT 页也要能单色显示。用户在六款中决策。

假设：先交付独立方形符号便于 favicon、网站导航及报名头像比较；品牌名在概念总览中使用 Tabby，符号本身不塞进平台功能或标语。B 组避开 A 组的条纹猫头、离散点阵 T 和直角循环。

## 已读依据

完整阅读 SKILL.md；阅读 references/discovery-brief.md、mark-types.md、svg-construction.md、visual-techniques.md、testing-checklist.md。按该 skill 的 Phase 1–6 做 brief、研究、10 条长名单、三款黑版 SVG、至少两轮精简与视觉检查、灰阶 concept_sheet。项目 frontend/AGENTS.md 只涉及 Next.js 实现规则，本次没有改前端实现。

## 类别与矢量研究

实际运行 `search_library.py --industry ai-ml --summary`：12 件参考；抽象标 33.3%，蓝色 33.3%，单色 25%，monoline、radial 和 repetition 常见。
实际运行 `--industry payments-fintech --summary`：37 件；多彩 32.4%，蓝色 29.7%；negative-space 与 containment 各 24.3%。
实际运行 `--industry developer-tools --summary`：295 件；containment 34.2%、negative-space 19.0%、monoline 16.9%；57% 使用 1–2 色。
同题重合检索：`--subject cat` 得到 GitHub、Yarn、NestJS、Tomcat 等，`--subject tail` 得到 Whalar、Origin、Quobyte 等。决定避开圆圈猫头、八爪猫、流线跃猫、环绕字母 Q、径向 AI 结和盾牌/增长箭头。

研究并逐一阅读下列 5 个真实 SVG；preview-v1/v3 的 peer/shelf test 也显示前四个：
- `pagekit.svg`：直角框与负形空间可在很少路径中完成；本组不复刻其 P/文档轮廓。
- `github-icon.svg`：猫科品牌靠轮廓而不是脸部细节成立；本组使用侧身和竖尾，避开圆圈和正面头。
- `houndci.svg`：轮廓和容器的共享边缘强化识别，但其动物头像/背景减法不照搬。
- `mailgun-icon.svg`：字母、弧线与单色同时成立；本组避免其双环 @ 和内部点。
- `markdown.svg`：徽记内部的文字应当轮廓化；本组信誉印签只保留一个负形 t。

上述参考仅用于理解结构与同类外观；三个 B 组 master 的路径均自行绘制，没有 trace/reference path reuse。

## Word map

Tabby → tiger stripes / ears / tail / two b / tabs；自主工作 → readiness / job tabs / bounded workspace / next step；信誉 → accepted / stamp / record / accumulation；偿还信用 → returned value / continuing capacity。交叉点：b 与工作标签、t 与验收印签、侧身猫与待命姿态。

## 长名单（10 个一行概念）

评分按 idea clarity / distinction / simplicity / relevance / small-size，总分 25；用于挑选有区别的三种构造。

| 概念 | 类型 | 一行想法 | 分数 | 结果 |
| --- | --- | --- | ---: | --- |
| 1. 尾签 b | letterform | b 的上升部像一根竖尾，内腔是一张工作标签。 | 22 | 选 B1；首轮卷尾改为直立尾，保住 b 的读法。 |
| 2. 双 b 扣合 | lettermark | Tabby 的双 b 共用一根立柱，像两单工作并排。 | 17 | 两个小内腔在 16 px 过紧。 |
| 3. 信誉印签 | emblem + letterform | 切角任务签内刻一个 t，像验收后留下的信用印记。 | 23 | 选 B2。 |
| 4. 三阶余额 | abstract | 三格齐阶的刻痕逐步留下工作成果。 | 16 | 接近增长图标。 |
| 5. 待命猫 | pictorial | 侧身坐猫和竖起的尾巴形成稳重、随时可工作的轮廓。 | 24 | 选 B3。 |
| 6. 躬身前进猫 | pictorial | 几何猫以低重心准备向下一单移动。 | 16 | 跃猫运动品牌联想较强。 |
| 7. 双票夹 | abstract | 两张错位任务票通过一个切口交接。 | 17 | 容易像复制文件图标。 |
| 8. 可用额度窗 | negative-space | 一块工作窗口中央留下一个空位，表示保留预算。 | 16 | 无品牌线索。 |
| 9. b 尾回环 | letterform | b 的弧线尾部回到直立起点，表示继续下一单。 | 18 | 读成数字 6 的风险，首版证明后放弃。 |
| 10. 合页猫耳 | abstract | 两个合页三角成为短小的猫耳与工作台。 | 17 | 太接近 A 组猫头方向。 |

## 构造与修改

统一画布 `viewBox="0 0 256 256"`。所有 master 只有一个填充路径；B1/B2 使用 evenodd 真正挖空；无 raster、live text、filter、mask 或 stroke。所有橙版只将黑版 fill 改为 `#ff5900`。

**B1 方腔 b**：38 单位直立 stem，外部用少量 cubic 连接方形立柱与圆 bowl；内部左边和上下边是工作标签的直线，右边为弧。首版卷尾被视觉检查读成 6，v2 换成清楚的直立 b，v3 将内腔从椭圆改成方腔，左移 8/上移 8 单位，保持清晰字母与有区别的 tab。平直内腔是 ownable detail。单字母识别较中性，配合 Tabby 字标使用更稳妥。

**B2 信誉印签**：200×200 单色方章，上右角切去 40×40、45°三角；负形小写 t 的垂直主笔宽 38 单位，横笔 32 单位；尾端从弧线回到水平，像完成任务的存档签。v1/v2 白色 t 尾部距章底过近，v3 留出 16 单位底部并加宽 stem，使 16 px 下还有清楚的下边界与 t 读法。和 dotted T 的结构完全不同。

**B3 待命猫**：一个侧身实心 silhouette；耳 45°，鼻梁 30°，躯干圆弧、底部/前足直角、竖尾 32 单位宽；尾部内腔最窄 20 单位。v1 重量右偏、低，v2 左移并减体宽；v3 上移 10 单位，鼻梁 152.7° near-miss 改为真实 150°，尾身间距 12→20 单位。无需眼睛、胡须或条纹。比猫头更能表达准备工作的姿态。

## 测试与实际检查

v1、v2、v3 每轮均运行 svg_audit，日志保存于 iterations/audit-v*.txt。v1 与 v3 使用 preview_sheet 生成带四个研究标的大小、黑/白、背景、mirror、180°、模糊、网页与货架测试。v1/v2 的大图通过 Chrome 渲染，v3 和最终 PNG 用 cairosvg 渲染并实际通过 view_image 查看。全高 v3 preview HTML 经 Chrome 截图并查看；保存细节与 shelf crop 供复查。

v3 / final audit：B1 98、B2 100、B3 99 / 100；无 FAIL、无 WARN。B1/B3 的非对称 margin 是上移的光学校正；不是未解决的结构问题。结构启发式分数不等于主观好看或商标确认。

实际渲染并查看黑版 16 / 32 / 64 px 的透明 PNG，`small-size-proof.png` 同时给原寸与 12× 最近邻像素图。B1 的方腔与 b 读法，B2 的 t/切角，B3 的耳、弧背和竖尾都保留。B3 在 16 px 更偏轮廓标记，在 24–32 px 猫姿态更容易读；本次建议符号最小 16 px，常规导航推荐 24 px 以上。预览中的 mirror / 180° 与 shelf 未发现明显意外读法或参考 logo 重复。反白保持孔隙开放；正式 kit 可在用户选定后做最终反白光学微调。

`concepts-greyscale.png` 由 skill 原生 concept_sheet.py 生成并实际查看。推荐 B3，理由是它同时让 Tabby 名称和“随时工作”形成记忆点，实心几何可搭配当前 Swiss 页面；B2 是最偏可信执行工具的候选，B1 最中性简洁。

## PNG 交付验证

每款有 1024×1024 橙色透明 PNG、暖白 `#f1f0ee` 底 PNG、黑色透明 PNG。已读取 PNG 尺寸、通道、透明范围和文件大小；所有独立 PNG 低于 2 MB。透明版为 RGBA、alpha 包含 0 与 255；暖白底版为 RGB，转换为 RGBA 后 alpha 均为 255。验证详情见 png-validation.json。

没有生成 final lockup、favicon.ico、网站替换或报名上传；这些在用户挑选方向后处理。
