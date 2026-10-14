# A 组：logo-generator 实际应用记录

来源：https://github.com/op7418/logo-generator-skill ，源码 commit `bf4e9ac4d4428bda261afcfe981871ceb92d94e6`。

已阅读实际 SKILL.md、references/design_patterns.md、references/background_styles.md、assets/showcase_template.html 与 scripts/svg_to_png.py。通过 skill-installer 安装；git sparse 根目录安装只带顶层文件，随后从同一上游完整 checkout 补齐 references/scripts/assets。安装目录 `/Users/jungle/.codex/skills/logo-generator`。

用户明确要求每个 skill 3 款，优先于此 skill 默认“at least 6 variants”。本组应用几何+负形线条、圆角矩形点阵+字母抽象、台阶几何闭环三个不同范式，而非换色三款。现有页面约束取 README、implementation-status 2026-10-12 最新记录、landing.module.css 与实际页面截图：暖灰纸面 #f1f0ee、炭黑 #202020、强调橙 #ff5900、Inter 与 Geist Mono、六列网格/直角模块。

## 设计简报

品牌 Tabby；托管 Agent 在有界预算里交付、赚钱、偿还推理信用、积累信誉并继续下一单。用户为黑客松评审、Agent 使用者与开发者。气质：务实、自主、精确、亲和、持续。符号不绑定 Monad/Tempo，不把六项功能塞进一枚图标。避免硬币、赌场、链徽、AI 星芒、霓虹渐变。

## 三款构造

- A1 Stripe Signal：几何猫轮廓、三道圆端虎斑负形，保留名称识别。
- A2 Queue T：六个离散圆角模块构成 T 与右向末端，表达任务队列。
- A3 Work Loop：一体台阶回环与单一负形，延续现有阶梯式几何。

均以 `viewBox="0 0 100 100"`、`currentColor`、语义分组构造，最多单一主形或六个重复模块；仅填充几何，无 live text、位图、滤镜或渐变。

## 实际检验与修正

以 skill 自带 svg_to_png.py 实际导出 1024px 透明 PNG；独立创建暖灰底方形 PNG，生成真实16/22/32/64像素样张。实际查看 a-review-v1、v3、v4 和 final。

A1 最初三个U形开口易读为皇冠，经独立审查改为连贯猫外轮廓，中心短槽与内部两道45°虎斑，消除顶部多齿读法；修正了负形跨出外轮廓造成的额外块。A2 的模组缝隙在22px可见，16px保留T与右向尾部；A3 16px最稳，但有小写b/文件夹联想。没有把审查脚本分数当作视觉结论。

最终还借用第二个 skill 的 svg_audit 与 preview_sheet 作交叉检查。A1/A2 100、A3 98，无 WARN/FAIL；A3 的小画布占比和垂直空白为 INFO，保留留白以符合 logo-generator 的构图要求。preview.html 含实际小尺寸、反白、镜像、旋转、模糊、语境与 developer-tools 参考货架。手绘 SVG 是真正的矢量源，PNG 是源文件渲染。

## 依赖与能力边界

安装了隔离 venv 的 CairoSVG/Pillow/fonttools；本机 native cairo 安装下载失败，但使用已捆绑 Poppler 的 libcairo 成功渲染。实际导出命令需 `DYLD_FALLBACK_LIBRARY_PATH` 指向捆绑 Poppler lib。未调用 image_gen/Gemini/Nano Banana。GEMINI_API_KEY 未配置，skill 的生成式高端展示图功能不可用；该流程 Phase 4 本身也在选定方向之后。本轮交付 flat 矢量候选与自包含 HTML 比较页，不声称生成过 Gemini 摄影/材质展示图。

HTML 比较页按上游 showcase_template 的三列卡片、两类字体、留白与轻 hover 结构适配为本地离线 HTML/CSS/JS，去掉 CDN 依赖、炫光与不适合现有网站的背景。
