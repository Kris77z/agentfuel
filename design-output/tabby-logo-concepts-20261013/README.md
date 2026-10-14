# Tabby · 六款 Logo 概念

2026-10-13。此目录为独立设计输出，不修改网站资产，也没有提交报名材料。先选方向；未制作正式品牌 kit。

## 查看与挑选

打开 `index.html`，切换炭黑、网站橙、反白/CRT；每张卡片提供单独 PNG 与 SVG 下载。`overview-mono.png` 用于比较形状，`overview-orange.png` 用于比较网站适配；`group-a-*.png`、`group-b-*.png` 为各组三款独立总览。推荐 **B3 待命猫**；更强调信誉和可靠工具感，可选 **B2 信誉印签**。

| 编号 | 名称 | 一句话 | skill 来源 |
| --- | --- | --- | --- |
| A1 | 虎斑信号 | 虎斑负形与尖耳保留 Tabby 名称识别，轮廓像一枚工业印记。 | op7418/logo-generator-skill |
| A2 | 队列 T | 六块构成 T，右向尾部接入下一单。 | op7418/logo-generator-skill |
| A3 | 工作回环 | 回环升一格，表达交付留下信誉、工作继续。 | op7418/logo-generator-skill |
| B1 | 方腔 b | b 中留一张方形工作标签，最中性、简洁。 | kaankiziltug/logo-design-skill |
| B2 | 信誉印签 | 切角任务签与负形 t，强调验收和信誉记录。 | kaankiziltug/logo-design-skill |
| B3 | 待命猫 | 侧身坐猫与竖尾，表达随时准备接下一单的 Agent。 | kaankiziltug/logo-design-skill |

## 文件

- A 组 `group-a-logo-generator/`；B 组 `group-b-logo-design/`。
- 每款 1024 × 1024 方形 PNG，暖白底及真实透明 RGBA，均低于 2 MB；另有炭黑透明 PNG。
- 每款 SVG 是自行绘制的真实填充路径/几何，不是包裹 PNG，也不依赖已安装字体。A 使用 viewBox 100、currentColor，B 使用 viewBox 256。
- `tabby-six-concepts.zip` 汇总最终候选、总览、比较页和记录；不含弃用草图与大型 QA 截图。
- `manifest.json` 记录编号、理由、路径、风险与尺寸建议；两组 `process.md` 记录实际应用步骤、参考阅读与修正。

大图展示按视觉范围归一；22px 导航和16px标签使用原画布比例。16px时主要依靠整体轮廓，网站导航建议22–24px以上；选定方向后可进一步做紧凑 favicon 光学版、字标和锁定比例。

## 项目依据

已阅读 `/Users/jungle/Desktop/dev/AGENTS.md`、frontend/AGENTS.md、README.md、docs/implementation-status.md、frontend/README.md 与 landing/terminal/onboarding 当前 CSS。最新产品事实取 implementation-status 的2026-10-12记录：托管 Agent、独立钱包与预算、两模型 Magpie、任务支持的推理信用、Pi有界执行和独立验收、报酬/还款/信誉循环。品牌跨Monad/Tempo，图形不包含链徽。

实际查看网站已有截图：landing/local-oberon-desktop.png、landing-polish-20261012/desktop-reputation.png；独立视觉审查还查看 landing-i18n、Monad自主工作台与CRT创建页。主视觉配色来自实际 landing.module.css：暖白 #f1f0ee、炭黑 #202020、橙 #ff5900。采用克制几何、纸面与终端感，不使用通用霓虹效果。

概念页字标使用项目已有 Inter Variable，辅助标签使用 Geist Mono Variable；两者 SIL OFL 许可文件位于 assets/fonts。符号SVG没有live text。预览中的Tabby字标用于风格比较，最终专属字标在方向选择后处理。

## Skill 实际应用与限制

- [op7418/logo-generator-skill](https://github.com/op7418/logo-generator-skill)，源码 commit `bf4e9ac4d4428bda261afcfe981871ceb92d94e6`。读取实际 SKILL、design_patterns、background_styles、showcase_template 与 svg_to_png；应用三种范式、100单位画布、currentColor、留白和网页比较；实际用其导出脚本渲染 PNG。用户指定每个skill三款优先于其默认至少六款。安装辅助资源补齐到全量上游版本。
- [kaankiziltug/logo-design-skill](https://github.com/kaankiziltug/logo-design-skill)，读取实际 SKILL 及 discovery、mark-types、construction、visual-techniques、testing 等资料；完成10概念筛选、类别/同题搜索、5件参考SVG学习、三款黑版构造、三轮修改、至少两轮测试及concept_sheet检查点。没有复制参考logo路径。
- Gemini/Nano Banana 生成式高端展示图**未运行**：GEMINI_API_KEY未配置；这也是logo-generator中选定方向后的阶段。本轮交付自行绘制的矢量与flat PNG/HTML，没有假称使用该图像模型。
- 导出使用隔离venv的CairoSVG/Pillow与现有捆绑Poppler libcairo。Homebrew native cairo下载未完成，未将其视为可用能力。两组均实际渲染、查看小尺寸；audit仅是结构辅助，最终六款分数98–100且无WARN/FAIL。

## 核验

`review/delivery-validation.json`：独立PNG尺寸/通道/透明度/体积，SVG结构与下载路径核对。HTML桌面与390px手机预览、主题切换和小尺寸测试实际浏览器截图存于review。页面不请求外部字体/CDN，不会写入网站或触发模型、钱包、报名操作。

各方案的局限已记录在manifest。这里完成的是概念选择阶段；未进行商标注册核查或正式印刷色打样。
