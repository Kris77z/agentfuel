import { Contract, JsonRpcProvider } from "ethers";
import { ACCOUNT_ABI, MANAGER_ABI, sameAddress, uint } from "@agentfuel/sdk";
import { taskPrivateFile, taskLoopbackUrl } from "../../../packages/pi-loop/src/task-runner/config.js";
import { monadProvider } from "../../../scripts/demo-rpc.js";
import type { HostedTaskExecutorConfig } from "./task-executor.js";
import { HostedError, type HostedAgent, type HostedFinance } from "./types.js";

const accountAbi = [...ACCOUNT_ABI, "function getPolicy(uint256) view returns(tuple(uint256 maxCashPerTx,uint256 maxDebtPerTx,uint256 maxDebtPerDay,bool ownerFrozen))"];
const managerAbi = [...MANAGER_ABI, "function adapter() view returns(address)", "function taskEscrow() view returns(address)", "function settlementAsset() view returns(address)"];
const adapterAbi = ["function identity() view returns(address)", "function reputation() view returns(address)", "function resolveAgent(uint256) view returns(address owner,address wallet)"];
const escrowAbi = ["function nextTaskId() view returns(uint256)", "function getTask(uint256) view returns(tuple(address poster,uint256 reward,uint256 escrowBalance,uint256 agentId,uint256 deadline,uint16 protocolFeeBps,uint8 status))"];
const fail = (code: string): never => { throw new HostedError(code, 503); };
const same = (a: unknown, b: string) => typeof a === "string" && sameAddress(a, b);
const decimal = (v: unknown) => { try { uint(v, "finance"); return true; } catch { return false; } };
const hash = (v: unknown) => typeof v === "string" && /^0x[0-9a-f]{64}$/i.test(v);
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Reuses Underwriter terms; this reader never recalculates scores or authorizes a draw. */
export async function readHostedFinance(config: HostedTaskExecutorConfig, agent: HostedAgent,
  dependencies: { provider?: JsonRpcProvider; fetcher?: typeof fetch } = {}): Promise<HostedFinance> {
  let provider = dependencies.provider, close: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!agent.binding) fail("HOSTED_FINANCE_NOT_BOUND");
    const workflow = config.models[0].templates.conservative, binding = agent.binding!;
    if (binding.chainId !== workflow.chainId || !same(binding.wallet, agent.wallet) || !decimal(binding.agentId) || binding.agentId === "0") fail("HOSTED_FINANCE_BINDING_MISMATCH");
    if (!provider) {
      const rpcUrl = (await taskPrivateFile(config.rpcUrlFile)).trim();
      if (workflow.chainId === "10143") { const connection = await monadProvider(rpcUrl, config.rpcTransport); provider = connection.provider; close = connection.close; }
      else { taskLoopbackUrl(rpcUrl); provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1, batchMaxCount: 1 }); close = () => provider!.destroy(); }
    }
    const rpc = provider;
    const read = async (): Promise<HostedFinance> => {
      if (BigInt(await rpc.send("eth_chainId", [])) !== BigInt(binding.chainId)) fail("HOSTED_NETWORK_MISMATCH");
      const response = await (dependencies.fetcher ?? fetch)(`${config.underwriterUrl}/agents/${binding.agentId}/credit`,
        { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(binding.chainId === "10143" ? 30000 : 10000) });
      if (!response.ok) fail("HOSTED_FINANCE_UNDERWRITER_UNAVAILABLE");
      const c = await response.json();
      if (!c || c.agentId !== binding.agentId || !c.configuration || !c.addresses || !c.identity || !c.terms || !c.truth || !c.mirror ||
        c.configuration.chainId !== binding.chainId || !same(c.configuration.settlementAsset, workflow.asset) || c.configuration.assetDecimals !== "6" ||
        !same(c.addresses.account, workflow.account) || !same(c.addresses.escrow, workflow.escrowAddress) || !same(c.addresses.identity, config.identity) ||
        !same(c.identity.owner, agent.wallet) || !same(c.identity.wallet, agent.wallet)) fail("HOSTED_FINANCE_BINDING_MISMATCH");
      if (![c.tierCap, c.identity.version, c.truth.repayment, c.truth.default, c.mirror.repayment, c.mirror.success, c.mirror.default, c.terms.feeBps].every(decimal) ||
        typeof c.terms.score !== "string" || !/^-?\d+$/.test(c.terms.score) || !["A", "B", "C"].includes(c.terms.tier) || !c.block ||
        !integer(c.block.number) || !integer(c.block.timestamp) || !hash(c.block.hash) || typeof c.eligible !== "boolean" ||
        !(c.rejection === null || typeof c.rejection === "string" && /^[A-Z][A-Z0-9_]{0,80}$/.test(c.rejection))) fail("HOSTED_FINANCE_UNCONFIRMED");
      const block = await rpc.getBlock(c.block.number);
      if (!block || block.hash !== c.block.hash || block.timestamp !== c.block.timestamp) fail("HOSTED_FINANCE_SNAPSHOT_REORG");
      const at = (contract: Contract, method: string, args: unknown[] = []) => contract.getFunction(method).staticCall(...args, { blockTag: c.block.number });
      const account = new Contract(workflow.account, accountAbi, rpc), escrow = new Contract(workflow.escrowAddress, escrowAbi, rpc);
      const [managerAddress, adapterAddress, cash, policy, next, asset, decimals] = await Promise.all([
        at(account, "creditManager"), at(account, "adapter"), at(account, "cash", [binding.agentId]), at(account, "getPolicy", [binding.agentId]), at(escrow, "nextTaskId"),
        at(account, "settlementAsset"), at(new Contract(workflow.asset, ["function decimals() view returns(uint8)"], rpc), "decimals")]);
      if (!same(asset, workflow.asset) || decimals !== 6n) fail("HOSTED_FINANCE_ASSET_MISMATCH");
      if (!same(c.addresses.manager, managerAddress) || !same(c.addresses.adapter, adapterAddress)) fail("HOSTED_FINANCE_BINDING_MISMATCH");
      const manager = new Contract(managerAddress, managerAbi, rpc), adapter = new Contract(adapterAddress, adapterAbi, rpc);
      const [managerAccount, managerAdapter, managerEscrow, managerAsset, identity, reputation, actor] = await Promise.all([
        at(manager, "agentAccount"), at(manager, "adapter"), at(manager, "taskEscrow"), at(manager, "settlementAsset"),
        at(adapter, "identity"), at(adapter, "reputation"), at(adapter, "resolveAgent", [binding.agentId])]);
      if (!same(managerAccount, workflow.account) || !same(managerAdapter, adapterAddress) || !same(managerEscrow, workflow.escrowAddress) || !same(managerAsset, workflow.asset) ||
        !same(identity, config.identity) || !same(c.addresses.reputation, reputation) || !same(actor.owner, agent.wallet) || !same(actor.wallet, agent.wallet)) fail("HOSTED_FINANCE_BINDING_MISMATCH");
      // Complete ledger, independent of recent events or the user's retained run history.
      // Match the existing P0 reader's limit and fail rather than understate debt.
      if (next < 1n || next > 201n) fail("HOSTED_FINANCE_LEDGER_LIMIT");
      let debt = 0n, ownedTaskCount = 0;
      for (let first = 1; first < Number(next); first += 4) {
        const rows = await Promise.all(Array.from({ length: Math.min(4, Number(next) - first) }, async (_, offset) => {
          const taskId = first + offset;
          const [task, loan] = await Promise.all([at(escrow, "getTask", [taskId]), at(manager, "getLoan", [taskId])]);
          if (loan.status !== 0n && loan.agentId !== task.agentId || loan.status < 0n || loan.status > 4n) fail("HOSTED_FINANCE_UNCONFIRMED");
          return { task, loan };
        }));
        for (const { task, loan } of rows) if (task.agentId === BigInt(binding.agentId)) {
          ownedTaskCount++;
          if (loan.status === 1n) debt += loan.principal + loan.fee;
        }
      }
      const canonical = await rpc.getBlock(c.block.number);
      if (canonical?.hash !== c.block.hash || BigInt(await rpc.send("eth_chainId", [])) !== BigInt(binding.chainId)) fail("HOSTED_FINANCE_SNAPSHOT_REORG");
      return { status: "confirmed", observedAt: new Date().toISOString(), chainId: binding.chainId, agentId: binding.agentId, wallet: agent.wallet,
        block: { number: c.block.number, hash: c.block.hash, timestamp: c.block.timestamp }, cashRaw: String(cash), debtRaw: String(debt),
        scannedTaskCount: Number(next - 1n), ownedTaskCount,
        credit: { score: c.terms.score, tier: c.terms.tier, tierCapRaw: c.tierCap, feeBps: c.terms.feeBps, eligible: c.eligible, rejection: c.rejection },
        policy: { maxCashPerTxRaw: String(policy.maxCashPerTx), maxDebtPerTxRaw: String(policy.maxDebtPerTx), maxDebtPerDayRaw: String(policy.maxDebtPerDay), ownerFrozen: Boolean(policy.ownerFrozen) },
        counts: { repayments: c.truth.repayment, defaults: c.truth.default, mirrorRepayments: c.mirror.repayment, successes: c.mirror.success, mirrorDefaults: c.mirror.default } };
    };
    return await Promise.race([read(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new HostedError("HOSTED_FINANCE_TIMEOUT", 503)), 45000); })]);
  } catch (error) {
    return { status: "unavailable", observedAt: new Date().toISOString(), reason: error instanceof HostedError ? error.code : "HOSTED_FINANCE_UNCONFIRMED" };
  } finally { if (timeout) clearTimeout(timeout); close?.(); }
}
