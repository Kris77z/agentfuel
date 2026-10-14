# Tabby 品牌资产

2026-10-13，用户选定此前 A2「队列 T」作为正式标记。六个圆角模块构成 T 与右向尾部，连接现有网站的点阵、终端与模块构图。主色为 `#ff5900`，炭黑 `#202020`、纸面 `#f1f0ee`；品牌名拼写为 **Tabby**。

正式资产入口：`frontend/public/brand/tabby/README.md`。资产均提供 PNG 和真实矢量 SVG；SVG 中字标已转为轮廓，不依赖客户端字体。黑、白、品牌色版本各自有独立文件。

## 使用入口

| 用途 | 路径 |
| --- | --- |
| 落地页页头、页尾 | `/brand/tabby/logo-horizontal-color.svg` |
| 首屏芯片、系统图 | `/brand/tabby/symbol-color.svg` |
| 彩色品牌/报名材料 | `/brand/tabby/logo-horizontal-color.svg` 与 `.png` |
| 方形独立标记 | `/brand/tabby/symbol-color.svg` 与 `.png` |
| 浏览器图标 | `/brand/tabby/favicon.svg`、`favicon-16.png`、`favicon-32.png`、`favicon-48.png`、`favicon.ico` |
| Apple 主屏幕图标 | `/brand/tabby/apple-touch-icon.png` 与 `.svg` |
| 应用图标 | `/brand/tabby/app-icon-192.png`、`app-icon-512.png` 及同名 `.svg` |
| 遮罩图标 | `/brand/tabby/maskable-512.png` 与 `.svg` |

落地页通过 `frontend/components/tabby-brand.tsx` 引用 canonical SVG。使用 `next/image` 的固定固有尺寸和 `unoptimized`，保留原 SVG，避免字标因 PNG 缩放模糊或加载后改变布局。主图沿用原来的展开动画；Logo SVG 本身不加动画或滤镜。

`frontend/app/layout.tsx` 为各页面提供 SVG/PNG favicon、ICO 和 Apple icon。`frontend/app/manifest.ts` 提供 app/maskable icons。前台品牌文字、页面标题和终端名称统一为 Tabby；仓库、workspace包名、已有会话/请求存储键和登录签名协议沿用原标识，避免破坏已保存状态。

## 来源与维护

方案来自 `design-output/tabby-logo-concepts-20261013/group-a-logo-generator/a2-symbol.svg`，实际使用 op7418/logo-generator-skill 的点阵字母范式；正式轮廓、字标和图标导出按 logo-design 的资产流程。复现源脚本为 `scripts/generate-tabby-brand.py`，字体使用现有 Inter Variable，许可随正式资产保存。六款探索稿保留在 design-output，正式网站只引用本目录。

图标使用单一纸面背景，确保浅色和深色浏览器工具栏都能识别；16px版仅对齐像素，不改变六模块语义。正式色值和画布/最小尺寸详见资产 README。

## 本轮核验

前端 typecheck 与隔离的生产构建（`.next-tabby-brand`）通过；沿用现有 landing 浏览器套件，在独立生产预览下完成桌面、390px 手机和320px窄屏 **15/15**。额外核对英文/中文六个页面视口组合、页头/页尾/芯片/系统图四处真实图片加载，favicon/Apple/manifest图标九个请求全部200、无页面错误与横向溢出。还核对创建页与工作台的Tabby标题和返回入口。

正式资产独立检查为 **22 SVG + 22 PNG + 1 ICO**，每个 SVG/PNG 均有同名配对；SVG 无live text、位图或滤镜，PNG 最大48,550 bytes。ICO 为16/32/48三帧。截图与机器可读结果保存在 `frontend/acceptance/tabby-brand-20261013/`。没有调用模型、发送链上交易或上传报名资料。

当前本机重建可使用已安装的隔离运行环境（其他环境按资产README安装相同依赖，并确保native Cairo可用）：

```sh
DYLD_FALLBACK_LIBRARY_PATH=/Users/jungle/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/lib \
  /Users/jungle/.codex/skills/logo-generator/.venv/bin/python scripts/generate-tabby-brand.py
```

2026-10-13 对齐修正：横向 Logo 的标记按大写 T 的顶线/基线缩放对齐，避免以 y 下伸部居中造成偏低；新画布237×80、横向PNG2000×675。落地页页头/页尾、芯片和系统图改用橙色标记，字标维持炭黑；黑白用途版本保留。对应SVG/PNG和分享卡均从源脚本同步生成。

## Dashboard ASCII 猫咪

任务动效使用 Tabby ASCII 猫替代 Magpie 鸟。猫由等宽字符绘制，有四帧步态、摇尾、转向和眨眼；完成后坐下，暂停/失败及减少动态效果时静止。节点推进和轨迹增长仍只取真实任务输出，猫到达节点不会改变任务状态。实现为 `frontend/lib/tabby-cat.ts`，接入现有任务画布；模型网关的 Magpie 名称保持不变。
