# 平台托管 Agent 服务

用户用自己的钱包签名登录，然后创建平台托管的钱包并设置名称、模型、策略、每次预算、总预算和是否允许信用。用户钱包只用于认证；新 Agent 的私钥由平台在私有目录生成和保存，浏览器不能指定私钥、RPC、provider 地址或奖励收款人。登录是带 origin、nonce、过期时间的个人消息签名，不称为 SIWE，也不发送链上交易。

## 启动

Node 22.19+。所有配置、角色 key、模型 key 和 RPC 文件必须为当前用户拥有的真实绝对路径、普通文件、`0600`，不得使用软链接。服务固定监听 `127.0.0.1`。TLS 由前端部署提供。

私有 `hosted.json`：

```json
{
  "version": 1,
  "port": 8791,
  "hosted": {
    "directory": "/absolute/private/hosted",
    "origin": "http://127.0.0.1:3000",
    "chainId": "31337",
    "models": [{ "id": "kimi-k2.6", "label": "Kimi K2.6" }],
    "maxAgentsPerOwner": 3,
    "maxTotalBudgetRaw": "1000000",
    "maxPerRunBudgetRaw": "120000"
  },
  "executor": {
    "taskConfigFile": "/absolute/private/hosted-task.json",
    "gameConfigFile": "/absolute/private/hosted-game.json"
  }
}
```

两个 executor 文件采用各自的 `HostedTaskExecutorConfig` / `HostedGameExecutorConfig`，不是命令或任意插件路径。task 接管注册、绑定、enroll、策略设置、入账和既有信用任务工作流；game 接管赞助游戏和奖励额度消费。三方模型 ID 集合必须完全相同，chain、Identity、Account、token、RPC、transport 和钱包锁目录必须匹配。task 的所有策略模板还必须属于同一业务合约域；task 模板中的 Relay、Arena、Underwriter 都是本机服务。guardian、gas sponsor、game sponsor 可共用已有 operator 锁下的签名钱包；opponent 必须与这三个运营角色不同，`--check` 离线核验实际 key 地址并拒绝冲突。

```bash
HOSTED_AGENTS_CONFIG=/absolute/private/hosted.json \
node --import tsx scripts/hosted-agents.ts --check

HOSTED_AGENTS_CONFIG=/absolute/private/hosted.json \
node --import tsx scripts/hosted-agents.ts --start
```

省略模式时执行 `--check`。检查只读配置和已有角色文件，不生成钱包、不创建运行目录、不构造 provider、不调用链或模型。`--start` 成功输出一行 `{ready:true,service:"hosted-agents",host:"127.0.0.1",port:8791}`。SIGINT/SIGTERM 先停止 HTTP admission，再等待已接收任务并释放锁及自有连接。异常退出后，确认旧进程停止，使用同一配置和 `--start --recover`；中断 run 保持 `Paused`，由用户用原 requestId 明确续行，启动不会自动重发。

前端仅设置服务端环境变量，不使用 `NEXT_PUBLIC_*`：

```text
HOSTED_AGENTS_URL=http://127.0.0.1:8791
HOSTED_FRONTEND_ORIGIN=http://127.0.0.1:3000
```

`HOSTED_FRONTEND_ORIGIN` 必须等于 HostedConfig.origin。部署时设置真实 HTTPS origin，cookie 自动加 `Secure`。未配置时 API 返回 `HOSTED_NOT_CONFIGURED` / 503。已有 Underwriter、fixed Relay、独立 settler 和 Arena 仍需按其运行手册启动；此入口不部署合约、不领币、不为运营角色补余额。task 配置如显式启用 gas 赞助，只从运营方指定且有总额上限的 sponsor 支付；默认关闭。新钱包没有所需资金时 provision 会保持可恢复的 `Paused`，不会换钱包或绕过链上检查。

## HTTP 与 Next 桥接

浏览器使用同源 `/api/hosted/*`，Next 将请求送往固定 loopback 上游。私有上游路由如下：

| Method | 路径 | JSON / 返回 |
| --- | --- | --- |
| POST | `/auth/challenge` | `{wallet}` → `{id,message,expiresAt}` |
| POST | `/auth/login` | `{challengeId,signature}` → 私有上游 `{token,expiresAt}`；浏览器仅 `{authenticated:true,expiresAt}` |
| POST | `/auth/logout` | `{}` → `{authenticated:false}`，同时清除 cookie |
| GET | `/agents` | 当前用户 `{agents,runs,models}` |
| POST | `/agents` | `{requestId,name,modelId,strategy,perRunBudgetRaw,totalBudgetRaw,allowCredit}` → Agent，202；自动异步 provision |
| PATCH | `/agents/:id` | 上述六项设置（无 requestId）→ Agent |
| POST | `/agents/:id/pause` | `{paused:boolean}` → Agent |
| POST | `/agents/:id/runs` | `{requestId,action,rewardKind?,amountRaw?}` → Run，202 |

时间 `expiresAt` 为 Unix 毫秒。`strategy` 是 `conservative` / `balanced` / `aggressive`；action 是 `provision` / `deposit` / `task` / `game` / `credits`；只有 game 要求 rewardKind 为 `usdc` 或 `llm-credits`。只有 deposit 要求 `amountRaw` 为正整数字符串，且不超过平台 `maxTotalBudgetRaw`；其它 action 不接受此字段。金额是 token 最小单位的十进制字符串；USDC6 的 `120000` 是 0.12 USDC。每个操作使用 UUID requestId，原 ID 重复提交返回原操作，不增加消费；同 ID 改参数会拒绝。

入账前，将 token 转至 Agent 的公开 `wallet` 地址，再提交 `{action:"deposit",requestId:"新的UUID",amountRaw:"40000"}`。平台以该托管钱包签名 approve/depositCash，资产进入绑定 Agent 的 Account cash；登录钱包不能代替托管钱包调用 depositCash。入账不调用模型，也不计算为推理预算消费。中断时保留原 requestId/amountRaw，恢复使用原记录，不重复存款。

上游认证使用 Bearer；浏览器只持 `agentfuel_hosted_session` 的 HttpOnly、SameSite=Strict、`Path=/api/hosted` cookie。Next 不返回 token，不转发浏览器 Authorization/owner/header；两层都核对 Host/Origin，没有开放 CORS。所有响应 `private, no-store`，错误只返回固定安全 code。用户只能读取和操作自己拥有的 Agent，平台钱包与用户登录钱包不同。

## 验证范围

```bash
node --import tsx --test services/hosted-agents/test/http.test.ts \
  frontend/test/hosted-agents-proxy.test.ts scripts/test/hosted-agents.test.ts
npm run typecheck:all
npm run build --workspace @agentfuel/frontend
```

HTTP 测试使用真实 HostedService、两名本地合成签名者和明确 synthetic executor，验证签名/会话/归属、UUID 幂等与 Next cookie 端到端；桥接测试覆盖请求白名单、host/origin、私有输出投影、大小限制和安全错误。CLI 测试只用私有本地配置和受控本机资源，不调用真实模型或公网链。UI 组件与用户交互验收另行完成，不能把这些传输测试称为真实链上托管流程已通过。

2026-10-07 执行 Agent 定向结果：HTTP 3 项、Next 桥接 5 项、CLI 3 项，共 11/11 通过，0 fail/skip；`typecheck:all` 通过。真实 HTTP 302 目标收到 0 次请求，原上游只有 1 次请求。生产 build 由 root 统一复验；本批尚未部署公开用户入口，也未完成 UI 验收。

同日 deposit 接线续批：CLI 增加 opponent/operator alias 检查，HTTP 与 Next 扩充 deposit 金额、UUID 幂等、金额非法和参数冲突验证，合计 12/12 通过、0 fail/skip，`typecheck:all` 通过。这里仍是传输与离线配置证据；真实入账链上 receipt 由核心/adapter 集成测试另行验收。

最终 root 验收（含用户创建、真实本地链入金/任务/USDC奖后下一单/额度消费）见 [托管交付](hosted-acceptance.md)。上述 synthetic HTTP 测试与真实本地整合测试分别说明，不能把后者称为真实供应商或 Monad 新开户验收。
