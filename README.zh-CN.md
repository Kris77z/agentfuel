# Tabby

**Reputation you can spend. 用可核验的履约信誉支持下一次执行。**

Tabby 是运行在 Monad 上的 Agent 工作台，连接推理采购、任务执行、独立验收、资金结算与信誉。Agent 接取报酬已托管的任务，先用现金、不足时使用获批的任务信用购买推理，经 Pi 执行和独立 Docker 验收后，在结算中偿还本金与费用，剩余收入进入现金账本。ERC-8004 的交付与还款记录参与下一次授信判断。

[English](README.md) · [架构与源码导读](docs/ARCHITECTURE.md) · [公开证据与验证](docs/VERIFICATION.md) · [文档索引](docs/README.md)

## 产品解决的问题

任务报酬在交付后到账，推理费用在交付前发生。Tabby 把这段资金缺口与实际任务绑定，让 Agent 在明确的权限、预算和时间限制内完成工作。

InferCredit 是其中的金融协议：已有任务托管报酬提供资金保障，信誉影响资格、额度与费用；借款直接支付白名单 Provider，不是可任意转走的现金。

## 两条执行路径

| 路径 | 执行方式 | 资金与验收 |
| --- | --- | --- |
| 有报酬目录任务 | 选单、接单、购买推理、Pi 调用公开工具，达到限制前可继续下一单 | 现金优先及任务信用；独立 Docker 隐藏测试和独立结算器授权链上分配 |
| 个人目标 | 规划、内置专家分阶段产出、模型复核和一次修订；合约地址/交易哈希触发受限查链 | 现金支付模型调用；不产生虚构报酬、借贷或还款信誉 |

免费赞助德州可以提供测试 USDC 或 Agent 专属推理额度；德州、五子棋、国际象棋与 Balatro 练习使用虚拟资源。游戏不使用任务借贷。

## 已有的强证据

- **真实双模型信用结算**：2026-10-12，Kimi K2.6 与 K3 分别完成 Task 12/13；各用 0.04 测试 USDC 现金加 0.08 借款购买 0.12 额度包，验收后偿还 0.092，现金剩 0.058、债务归零。
- **有界自主连续运行**：同日新窗口完成 Task 16/17，在两单上限停止。Agent 2202 累计三次还款、零违约，信誉 710/A、现金 0.07224、债务零。
- **未知结果的真实收口**：Task 14 保留 Unknown，运营方明确承担未知成本后永久封存额度、全额补偿原付款、关闭贷款并独立退回任务托管款；没有计为成功或还款。
- **带付款和来源的查链分析**：2026-10-13 的合约分析保存固定区块快照及匹配字节码的 Sourcify 资料；规划、ABI 专家与模型复核共三笔 K2.6 付款，原 UUID 重放没有新增付款或调用。

以上使用 Monad Testnet `10143`、6 位小数的测试 USDC。原失败、额外补资、规划支出与人工拒收记录均保留。完整来源、金额和复查命令见[公开验证指南](docs/VERIFICATION.md)，例如[Task 17 结算交易](https://testnet.monadvision.com/tx/0xf3cdfecb48f6ec12e0a848538730b19df75a5d252f36e52efda309f5b35c0802)。

## 最小本地运行

需要 Node.js 22.19+、npm、Foundry 和已启动的 Docker；首次安装需要下载依赖、Solidity 0.8.24 编译器和固定 Python 镜像。

```sh
git clone https://github.com/Kris77z/tabby.git
cd tabby
npm ci
forge build --root contracts --skip-lint
docker pull python:3.12-alpine@sha256:4c47124a8391cb7a9f571164147d154777cf012a4ece5f86097130d7a4478111
npm run demo
```

这个完整协议演示不需要模型 API key 或真实钱包私钥，创建隔离 Anvil 链并运行真实本地交易；注册表和推理响应明确使用 mock。它用于复现机制，不冒充新增 Monad 或真实供应商验收。详见[演示运行手册](docs/demo-runbook.md)。

完整工作台样例预览，不需要钱包或后端：

```sh
node scripts/preview-dashboard.mjs
```

打开 `http://localhost:3033/`。页面使用正式组件与明确标注的内存样例，阻断外部连接，不作为链上交易或真实模型证据。

高级协议页 fixture：

```sh
npm run dev:fixture --workspace @agentfuel/frontend
```

打开 `http://127.0.0.1:3000/advanced`；主 `/dashboard` 仍需要配置托管后端。真实模型启动器目前限 macOS，按[本地托管启动](docs/local-hosted-testing.md)和[Magpie 构建说明](docs/magpie-gateway.md)进行；已有实网配置和恢复方式见[Monad 验收](docs/monad-hosted-acceptance-20261012.md)。

## 工程入口与边界

[源码模块与信任边界](docs/ARCHITECTURE.md)把合约、Underwriter、SDK、Relay、Pi、Hosted、Arena 与前端关联起来。核心不变量包括身份/任务/报价绑定、现金优先和白名单付款、独立任务验收、原付款恢复、Unknown 暂停，以及预算限制。模型复核是同一选定路由上的独立调用，不等于外部事实保证；链上资金清算原子完成，信誉反馈采用失败待重试机制。

```sh
npm run docs:check
npm run typecheck:all
npm run test:all
forge test --root contracts --offline
```

默认 workspace 测试与 Foundry、脚本、浏览器、公网 fork、真实模型运行分开。部分测试需本机 Anvil/Docker；历史批次数字不作为当前 CI 通过声明。贡献方式见[CONTRIBUTING](CONTRIBUTING.md)。

当前模型网关、托管钱包和验收服务由运营方维护；公网部署与扩展钱包联合验收仍需单独完成。当前不提供完整外部专家市场、标准 x402 互操作、目标任务的任意网页/宿主命令工具、公共 LP 或盈利保证。配置的[产品地址](https://monad.tabbyai.xyz/)和[概览视频](https://youtu.be/9Xxnqi52Kvo)不能替代上方的真实交易和验证证据。

项目原创代码采用 [MIT](LICENSE)，第三方依赖、字体和适配材料保留各自许可与来源，详见[归属说明](docs/ATTRIBUTION.md)。`agentfuel` 包名、请求存储键及部分历史名称保留兼容性；Tabby 是产品，InferCredit 是金融协议。
