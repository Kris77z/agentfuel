# 地址 / 交易哈希自动查链 — 2026-10-13

## 使用与实现

在 Dashboard 输入 Monad 测试网合约地址或交易哈希即可。运行器先读取资料，再规划、调用专家及独立复核；普通单目标查链优先由一个专用专家产出完整报告。无需用户手动复制 ABI、源码或交易回执。当前支持 Agent 所在的 Monad 测试网（10143），本地受控测试支持 31337；不自动切换到其他链。

服务端配置 `goals.chainLookup: true`；`scripts/local-hosted.ts` 和 `scripts/monad-hosted-runtime.ts` 生成此配置。`GET /agents` 公告 `capabilities.goals.chainLookup = {chainId,maxTargets:2}`，Next 仅投影该公共能力。旧持久任务不会在恢复时突然更换输入。

- 合约：固定区块的字节码、原生余额、代币 name/symbol/decimals/totalSupply、owner、paused、owner 余额；供应量使用确定性的精度换算。识别 EIP-1967 implementation/beacon、legacy Zeppelinos、EIP-1167 代理，并读取一层实现。实现合约自身存储不等于代理的代币状态。
- 交易：交易、回执、成功/失败状态、实际日志、gasUsed/effectiveGasPrice 与确定性费用计算。用已匹配链上字节码的 ABI 解码 calldata/同合约日志；未知 selector 保留原始数据，不猜签名。待确认/未找到交易单独记录。
- ABI/源码：固定 Sourcify v2 endpoint，核对网络、地址、验证状态及 runtime bytecode 与 RPC 的一致性。来源依据 [Sourcify v2 查询说明](https://docs.sourcify.dev/blog/apiv2-lookup-endpoints/)；没有源码或不匹配时不把外部 ABI 当作已验证输入，仍分析已有链上事实。

地址采用查询时 latest−2 的固定区块，交易采用其实际回执区块；提交快照前重新核对各区块 hash。查询不产生链上交易。RPC 是数据来源，此快照不是独立的状态树/Merkle 证明；链上付款回执才证明模型费用的资金移动。源码验证和模型复核均不等于完整安全审计。

## 凭证与恢复

首次模型付款前保存不可变 research snapshot，包括 `chainId/observedAt/records/digest`。规划、专家、修订和 Reviewer 使用相同快照；恢复原 UUID 不重新读取或购买已交付调用。快照摘要为 JSON 字段顺序 `version,chainId,observedAt,records` 的 UTF-8 keccak256。各付款的 requestDigest 绑定包含快照的模型请求。源码响应另记摘要、字节码匹配及截断标记。

任务结果和专家信息卡提供“查链来源与凭证”，包含区块 hash、浏览器链接、Sourcify 链接和读取 JSON。下载文件合并 `requestId/research/calls`；calls 含 serviceId/promptDigest/requestDigest/paymentId/txHash。RPC URL、密钥和认证信息不进入公开投影。

每个请求最多两个完整地址/哈希，不抓取用户 URL，不接受模型自选 RPC 方法。Sourcify 请求超时 15 秒，响应最多 2 MB；源码总预算 16000 字符，单文件最多 12000，ABI 展示预算 6000，交易日志最多 12 条。截断明确标记；完整验证 ABI 可用于解码，但提示词只收到有界资料。只读 eth_call gas 上限 100000，不执行模拟交易、代码、任意网页查询或实时收益率获取。

错误码：`HOSTED_GOAL_LOOKUP_NETWORK`（链不匹配）、`LOOKUP_LIMIT`（目标/资料过大）、`LOOKUP_UNAVAILABLE`（RPC 不可用）、`LOOKUP_REORG`（区块变化）。后两者可用原请求恢复；首次查询失败前没有发起模型付款。源码服务不可用可降级为已有 RPC 事实，不把暂缺资料描述成安全结论。

## 验收

- 62 项相关测试通过（含本轮过期报价、停止终止、作废签名重放及 Magpie 状态测试）：代理与区块绑定、ABI 字节码不匹配、无源码、失败/待确认交易、网络不符、区块重组、未知 Token 属性、公共字段/来源 URL 投影、恢复不重新抓取和不重复付款，以及既有专家与前端凭证回归。
- Root TypeScript、Next 生产构建通过。Dashboard 折叠来源、区块与浏览器链接已用实际任务验证。
- 真正 Monad RPC + Sourcify 已识别 USDC 代理 `0x534b2f3A21130d7a60830c2Df862319e593943A3` 及实现 `0x21240161521D6854BE79F7D3a0A65c6BeDDB42fb`，两者字节码均匹配。
- 第一次地址任务前三次模型调用已交付；第四次上游 HTTP 502 未交付且已付款，正确进入 Unknown/Paused，没有重复调用。验收运营方接受未知上游成本，通过原 resolveUndelivered/Refunder 校验与持久账本退回该笔 10000 raw test USDC，原 UUID 恢复后停止。前三次费用 30000 raw 保留，重放不再付款。失败证据保留，不将该任务记为成功。

## 过期付款对账与终止

已签名交易不会因为 relay 报价过期而自动失效。因此不能只看 expiry 或“暂无回执”就释放任务预留。恢复和停止任务都执行同一对账路径：

1. 校验原始 quote、请求摘要、钱包、网络、nonce、收款方及 payProvider 参数；先读取规范链上的付款状态。
2. 已过期且从未签名的报价，在链上零付款后可直接结束。已签名、尚未付款且 nonce 尚未使用的调用，以同 nonce、value=0、data=0x 的钱包自转账替换；使用 Agent 自己的 MON 支付 gas。
3. 替换签名在广播前持久化。断线或重启只重播同一份签名，不重新报价、不重发推理。交易竞争时，以链上结果为准：原付款先成功则保留计费并继续对账；不能因为取消广播成功就假定未付款。
4. 只有固定区块上的 nonce 已被消耗、原 payment 金额为零，且区块 hash 复核通过，才标记 `HOSTED_GOAL_PAYMENT_VOIDED`，终止任务并释放未消费预留。已有交付及费用保留；显式停止请求返回 Cancelled。无法确定或 gas 不足时仍保留可恢复状态。

Monad 实测请求 `711c44aa-4fcb-4dbf-988d-d0a372baabca`：规划、专家执行及第一次复核共 30000 raw test USDC；修订付款因 gas 不足未上链，随后报价过期。补充受控验收钱包的 MON 后，恢复原 UUID 自动完成 nonce 作废及终止，没有再购买模型调用。公开证明见 `frontend/acceptance/chain-lookup-20261013/expired-payment-proof.json`，签名原文、私钥及私有 RPC 不导出。这是验收钱包预充值，产品没有 gas 赞助。

## Magpie 状态动效

已逐段对照本地 `monad-rebel/frontend/src/components/timeline/pipeline-snake.tsx` 与 `snake-engine.ts`。原实现包括网格寻路、专家节点、阶段锁定、轨迹增长及目标反馈；此前 Magpie 仅为 SVG 位移和振翅，未完整移植。

现在由独立 Canvas 运行循环实现网格、朝向、振翅、追踪/绕行当前节点、渐隐羽迹、产出反馈及阶段标签。轨迹随真实已产出阶段增长；飞到节点本身不表示任务成功。暂停、失败、完成、用户暂停动画和减少动态效果设置均停止持续飞行，切换 requestId 清空前一个任务的轨迹。隐藏页面停止动画，ResizeObserver 和 DPR 适配画布，动画帧不触发 React 状态刷新。


## 补充验收记录

主动停止分支也已在 Monad 验证：请求 `1dc6ba66-603b-4ab0-b9cb-b6683ea31ae5` 的第三笔签名付款未执行且过期，`POST /agents/:id/cancel` 自动作废 nonce，终态为 `Cancelled`，保留前两次调用的 20000 raw test USDC，释放其余预留。`expired-payment-stop-proof.json` 保存作废交易、旧 payment 零值、规范区块及无重复调用检查。

付款检查通过不等于报告的所有推论都正确。中间一次任务虽然模型 Reviewer 判定通过，但人工发现附加风险表把 ABI 事件声明当作实际能力证明，已保留为 `address-before-scope-correction` 反例。执行与复核提示词现明确区分事件声明、交易日志和实际权限；基础合约类型、代币字段与代理关系由一个 ABI 专家统一交付，不额外拆成 Token 风险审计。

### 最终成功样例

合约地址任务 `66fed270-f8c2-45b1-8f23-6a52b18c2724` 已通过实际执行、独立复核、人工抽查及链上付款核验。输入为 USDC 代理地址；读取区块 `70656749`，识别 legacy Zeppelinos 代理和实现地址，正确返回 USDC、6 位精度、供应量等代理状态，区分实现合约自身存储，保留源码截断及未读取管理员配置等未知项。

| 调用 | Monad 付款交易 | 确认区块 |
| --- | --- | --- |
| Commander 规划 | `0x70a14415d0639c8551d9d07a6e59b253a3f8a2627aab41dfbfe88e0eacbdc549` | 70656863 |
| ABI 专家执行 | `0xfc1de5233ac40779dad74b94241f21d5c000e30ee391ee22c106e643accb55cd` | 70656960 |
| 独立复核 | `0x7e04ee06cd6452789e04a811d6586530a8468c78b3b9d5e054b3e5be5cfe6153` | 70657111 |

三笔均 status=1，各消费 10000 raw，全部为现金，信用消费为零；余额由 50000 降至 20000 raw，总计 **0.03 test USDC**。重复提交原 UUID 后快照相同、钱包 nonce 不变、Magpie 接受请求计数不增加。测试完成后已恢复原 Agent 设置。

交易哈希任务的最终样例保留在 `execution-evidence.json` 的 `transaction-final`：三次调用、0.03 test USDC，转账 40000 raw = 0.04 USDC，回执内一条 Transfer，130640 gas × 102 gwei = 0.01332528 MON；付款与重复提交检查均通过。未将前期失败或人工拒收样例混作最终成功。

前端已用实际受控任务检查：任务条从规划到 ABI 专家、复核与完成联动；暂停动画可切换；专家个人卡包含来源/付款凭证；控制台未见错误。生产构建已在本地 3024 启动。截图与公开证据均在 `frontend/acceptance/chain-lookup-20261013/`，完整财务恢复账本仍保留于忽略的运行目录。
