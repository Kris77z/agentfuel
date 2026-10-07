# 托管 Agent 开户、入金与任务执行

`HostedTaskExecutor` 实现 `HostedExecutor` 的 `provision`、`deposit`、`task` 分支。用户归属、登录、请求准入和累计预算由 `HostedService` 管理；执行器只接受服务端解析后的 `HostedExecution`。浏览器不能指定私钥、RPC、合约、Relay 地址或支付收款人。

平台用户的登录钱包与托管 Agent 钱包是不同身份。每个 Agent 的托管钱包由平台生成并单独保存，真实调用 Registry `register(string)`，由配置的 guardian 调用 `CreditManager.enrollAgent`，再由 Registry owner 设置 `AgentAccount` policy。共享协议合约中的 cash、policy、信用历史按链上 `agentId` 隔离，不部署新的资金合约。

## 可信配置与任务

`loadHostedTaskExecutorConfig(file)` 只读并校验 `0600` 配置和 key/RPC 文件，不建目录、不连接 RPC、不广播交易。`validateHostedTaskExecutorConfig` 为纯校验；`createHostedTaskExecutor(config, { provider?, runner? })` 可接受宿主注入的本地运行依赖。

配置包含 `identity`、`guardianKeyFile`、`rpcUrlFile`、`rpcTransport`、不带秘密的 `publicRpcUrl`、`walletDirectory`、环回 `arenaUrl` / `underwriterUrl`，以及 `models`。每个 model id 映射 `physicalModels: { cheap, strong }` 与三种策略的 `WorkflowConfig` 模板。模型与策略的实际档位、轮数、报价和 Relay 来自宿主模板；这是固定服务的运营配置，用户不能任意指定物理模型。固定服务的完整交付记录会核对各轮请求模型与该映射一致；未付款报价本身不提供远端物理模型的独立证明。

每请求先保存原配置快照，再替换链上 `agentId`、`allowCredit`、明确授信上限和预算。`maxPrice` 不超过原模板、该请求预留额及 Agent 的每次预算。实际入口直接复用 `runTaskWorkflow`：候选题目规则选择 → 必要时接单 → 一次固定价 B 服务 → Pi 公开样例工具 → 独立 Arena 判题、结算及还款。没有先单独购买 selector 推理的第二笔付款。

Arena 的题目 catalog 可以使用 `tasks: { "123": { "problemId": "sum-integers" } }`，不预先写用户 Agent ID。提交授权从同一链块中的 Assigned task 读取实际 Agent，再核对当前 Registry wallet 与 EIP-712 签名；controller 写入实际 Agent 的 verdict，独立 settler 再核对链上 Agent。指定 `agentId` 的旧固定模式保持兼容。题目仍由运营配置限定，任务文本和模型不能换题或换收款人。

## 入金与可选 gas 赞助

`initialCashRaw` 默认 `0`。平台不默认赠送 USDC，也不把运营累计预算当作自动入金。用户可以向托管钱包转入结算资产，再发起 `deposit` 请求，指定 `amountRaw`；服务端限制正整数及额度。执行器只从该钱包已有余额向固定 `AgentAccount` approve 精确金额并 `depositCash`，没有贷款，也不能指定其他收款人。钱包 token 不足时暂停，到账后恢复同一请求。资金进入钱包与资金进入 Account cash 是两步；`deposit` 不记为推理消费。

可选的 `gasGrantWei`、`gasSponsorKeyFile`、`gasSponsorBudgetWei` 必须同时配置，默认禁用。它们提供首次开户的一笔固定 native gas grant：按平台 Agent ID 和固定托管钱包持久占用全局额度，再广播原签名交易。未知发送不退占用、不重领；其他请求也不能给同一 Agent 重复领。累计上限统计 grant 本金，不包含 sponsor 自己的 gas 手续费；后续不足不自动续送。托管用户钱包不能复用 guardian / sponsor 的 operator key。

guardian 和 gas sponsor 共用 `walletDirectory/operator/<wallet>` 的 nonce writer，与运营比赛奖支付使用同一槽。若同 key 的原交易未知，须先恢复原目录，其他 Agent 开户不能抢占该 nonce。托管钱包沿用 `walletDirectory/<wallet>` 单 writer，任务、入金和开户都不能绕过未完成的原请求。

## 预算与恢复

累计消费统计实际固定服务的已支付本金，即 cash + credit 的报价，扣除链上已确认退款。它不是模型供应商账单，也不包含借款 fee 或链上 gas。未决请求保留整笔预留，付款不确定不能当成未花钱释放预算。

所有开户、policy、approve、deposit、gas grant 先保存原 signed bytes / hash，再广播，恢复只能确认或重播原交易。任务沿用原 PaymentHandle、付款与提交 journal，不重新报价、提款或派发未知模型。配置或用户设置变化不会重写已有请求的快照。已付款恢复不做新 policy 交易，也不会被随后发生的 protocol freeze 阻止读取原退款或外部任务终局；原 workflow 核对 canonical Task/Loan/Payment 后才关闭槽。执行器不自动 expire、清算、退款或解除冻结。

锁崩溃后须先确认旧进程已停，再以原请求恢复；不会自动抢占活锁。公有 `HostedResult` 只返回状态、原 ID/hash 与必要资金数字，不返回 signed bytes、代码、key、RPC 或服务 URL。

## 本地验证范围

已验证本地 Anvil 的真实注册/enroll、两 Agent 独立现金与 policy、不同模型档模板、低预算不付款、真实一次 B 付款与独立 Arena、原签名恢复、gas 全局上限、入金到账后原请求恢复，以及冻结后的已付任务终局恢复。模型在这些测试中为受控响应；本模块测试不证明新的真实模型或 Monad 托管开户。

```sh
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$HOME/.foundry/bin:$PATH" \
  node --import tsx --test --test-concurrency=1 \
  services/hosted-agents/test/task-executor.test.ts \
  services/arena/test/dynamic-assignment.test.ts
```
