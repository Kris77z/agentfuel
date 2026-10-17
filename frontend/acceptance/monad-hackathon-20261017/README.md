# Monad 公网演示验收 · 2026-10-17

产品：<https://monad.tabbyai.xyz/dashboard>，Monad Testnet 10143。完整结论、准备条件与复现顺序见[当日验收报告](../../../docs/monad-hackathon-live-20261017.md)。

这些摘要来自本轮公网真实模型、付款与结算，保留原 UUID、区块、usage、响应摘要和独立验收；不包含私钥、cookie、私有 RPC、原始签名交易或私有模型原文。费用使用六位测试 USDC raw 单位，10000 raw = 0.01 USDC。

| 范围 | 公开证据 |
| --- | --- |
| Agent2367 两单信用、还款与信誉 | [credit-loop-public-summary.json](credit-loop-public-summary.json) |
| 原结算交易恢复，无重复推理付款 | [settlement-recovery-public-summary.json](settlement-recovery-public-summary.json) |
| 外部专家雇佣、修订及独立复核 | [external-public-summary.json](external-public-summary.json) |
| 同一目标 K3 → K2.6 降档 | [fallback-fresh-public-summary.json](fallback-fresh-public-summary.json) |
| 零现金自动参赛 → USDC 获奖 → 信用接单 | [automatic-fresh-public-summary.json](automatic-fresh-public-summary.json) |
| 同一 Agent 获奖 token → 兑换推理 → 任务收入 | [token-supplement-public-summary.json](token-supplement-public-summary.json) |
| 用户钱包下 Agent2371 两单真实闭环 | [presenter-credit-loop-public-summary.json](presenter-credit-loop-public-summary.json) |
| 显式有限授权，原请求与历史保持不变 | [presenter-ready-public-summary.json](presenter-ready-public-summary.json) |
| 现场备用任务创建与期限 | [standby-task-creation-public-summary.json](standby-task-creation-public-summary.json) |
| 备用任务仍Open、未分配、报酬已托管 | [standby-tasks-public-summary.json](standby-tasks-public-summary.json) |
| 最终构建、源码与服务隔离 | [deployment-public-summary.json](deployment-public-summary.json) |
| 发布后只读认证、状态及零副作用 | [public-health-summary.json](public-health-summary.json) |
| 待命资金、Gas与信用池 | [resources-public-summary.json](resources-public-summary.json) |
| 最终公网浏览器与刷新 | [public-browser-summary.json](public-browser-summary.json) |

最终构建公网页面截图：[任务](public-task.jpg)、[资金与信誉](public-finance.jpg)、[游戏](public-games.jpg)、[Agent 凭证卡](public-agent-evidence.jpg)、[外部专家身份](public-expert-evidence.jpg)。截图只证明对应时点的页面；实际链上与模型执行以各分支摘要为准。
