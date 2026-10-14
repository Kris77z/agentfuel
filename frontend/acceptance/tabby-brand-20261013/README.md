# Tabby A2 网站接入核验

2026-10-13，正式A2资产与网站接入。生产构建使用独立 `.next-tabby-brand`，未覆盖之前3024的运行构建。当前本地预览 `http://127.0.0.1:59730/`。

- 前端typecheck、Next生产构建、git diff --check通过。
- 现有landing.spec的五个场景在桌面1440、手机390、窄屏320下全部通过，15/15。场景包含字号/本地资源、案例切换、菜单/FAQ、创建入口/工作台路由、中英文与章节保留。仅临时切换独立预览origin，未新增测试实现；临时配置与复制文件已清理。
- page-checks.json记录中英文各三种视口、四处品牌图片真实加载、无横向溢出、icons/manifest路径与九个200响应。额外查看onboarding/dashboard新品牌名称。浏览器拦截所有API操作与外部网络；无钱包登录、广播、供应商调用。
- asset-checks.json记录22 SVG/22 PNG配对、尺寸与体积，SVG全矢量无字体依赖，ICO16/32/48。PNG最大48,550 bytes。
- 桌面/手机首页、创建页、工作台截图已实际查看。SVG及PNG资产来源和复现见frontend/public/brand/tabby/README.md。

同日修正：横向标记按T的顶线/基线对齐并统一橙色，SVG/PNG及分享卡同步重建。更新生产构建通过；当前IAB页已刷新并确认使用logo-horizontal-color.svg，真实页头截图为aligned-orange-header.jpg。新横向画布237×80、PNG2000×675；所有manifest文件哈希与尺寸再次核对通过。
