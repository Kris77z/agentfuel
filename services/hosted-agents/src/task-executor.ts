import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Contract, Interface, JsonRpcProvider, Transaction, Wallet, ZeroAddress, getAddress, keccak256, type TransactionReceipt } from "ethers";
import { ACCOUNT_ABI, MANAGER_ABI, canonical, sameAddress, uint, type Json } from "@agentfuel/sdk";
import { IdentityRegistry, IDENTITY_ABI, registrationFromReceipt } from "@agentfuel/erc8004/identity";
import type { DockerExecutor } from "@agentfuel/arena/docker";
import { readWorkflowStatus, runTaskWorkflow, validateWorkflowConfig, type WorkflowConfig, type WorkflowSession, type WorkflowStatus } from "@agentfuel/pi-loop/workflow";
import { SessionStore } from "@agentfuel/pi-loop/session";
import { taskLoopbackUrl, taskPrivateFile } from "../../../packages/pi-loop/src/task-runner/config.js";
import { monadProvider, type RpcTransport } from "../../../scripts/demo-rpc.js";
import { HostedError, type AgentSettings, type HostedBinding, type HostedExecution, type HostedExecutor, type HostedResult, type HostedStrategy } from "./types.js";

export interface HostedTaskModel {
  id: string;
  /** Operator-owned mapping to the fixed Relay's physical models, not a browser label. */
  physicalModels: { cheap: string; strong: string };
  templates: Record<HostedStrategy, WorkflowConfig>;
}
export interface HostedTaskExecutorConfig {
  version: 1; identity: string; guardianKeyFile: string; initialCashRaw?: string;
  rpcUrlFile: string; rpcTransport: RpcTransport; publicRpcUrl: string; walletDirectory: string;
  arenaUrl: string; underwriterUrl: string; models: HostedTaskModel[];
  timeoutMs?: number; pollTimeoutMs?: number;
  /** Optional one-time native gas grant. Budget counts grant value, separately from the sponsor's transaction fees. */
  gasGrantWei?: string; gasSponsorKeyFile?: string; gasSponsorBudgetWei?: string;
}
export interface HostedTaskDependencies { provider?: JsonRpcProvider; runner?: DockerExecutor }
interface RecordedTransaction { raw: string; hash: string; from: string; nonce: number; receipt?: unknown }
interface Snapshot {
  agent: string; owner: string; wallet: string; request: string; action: "provision" | "deposit" | "task"; reservedRaw: string; amountRaw?: string;
  settings: AgentSettings; config: HostedTaskExecutorConfig; workflow: WorkflowConfig; physicalModels: HostedTaskModel["physicalModels"];
}
interface ExecutorState { version: 1; snapshot: Snapshot; binding: string; transactions: Record<string, RecordedTransaction>; agentId?: string; result?: HostedResult }
interface WalletSlot { chainId: string; signer: string; account: string; directory: string; binding: string; phase: string }
interface GuardianSlot { directory?: string; hash?: string }
interface GasLedger { version: 1; chainId: string; sponsor: string; grants: Record<string, { wallet: string; amount: string; directory: string; transaction: RecordedTransaction; confirmed: boolean }> }

const strategies: HostedStrategy[] = ["conservative", "balanced", "aggressive"];
const hash = (v: unknown) => createHash("sha256").update(canonical(JSON.parse(JSON.stringify(v)) as Json)).digest("hex");
const closed = (phase: string) => ["Succeeded", "Failed", "Refunded", "Stopped"].includes(phase);
function fail(code: string): never { throw new HostedError(code, 503); }
const safeCode = (error: unknown) => { const code = (error as { code?: unknown; message?: unknown })?.code ?? (error as Error)?.message; return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,100}$/.test(code) ? code : "HOSTED_EXECUTION_UNCERTAIN"; };
function object(v: unknown, keys: string[]): asserts v is Record<string, any> {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(key => !keys.includes(key))) fail("HOSTED_TASK_CONFIG_INVALID");
}
function path(v: unknown): string { if (typeof v !== "string" || !isAbsolute(v) || resolve(v) !== v) fail("HOSTED_TASK_PATH_INVALID"); return v; }
function amount(v: unknown): string { try { uint(v, "amount"); return v as string; } catch { return fail("HOSTED_TASK_AMOUNT_INVALID"); } }
function domain(c: WorkflowConfig) { return { chainId: c.chainId, account: c.account.toLowerCase(), asset: c.asset.toLowerCase(), escrowAddress: c.escrowAddress.toLowerCase() }; }

/** Pure, closed-schema validation. Only trusted private configuration supplies URLs, domains and routes. */
export function validateHostedTaskExecutorConfig(value: unknown): HostedTaskExecutorConfig {
  object(value, ["version", "identity", "guardianKeyFile", "initialCashRaw", "rpcUrlFile", "rpcTransport", "publicRpcUrl", "walletDirectory", "arenaUrl", "underwriterUrl", "models", "timeoutMs", "pollTimeoutMs", "gasGrantWei", "gasSponsorKeyFile", "gasSponsorBudgetWei"]);
  if (value.version !== 1 || !["direct", "system-https-proxy"].includes(value.rpcTransport) || !Array.isArray(value.models) || !value.models.length || value.models.length > 8) fail("HOSTED_TASK_CONFIG_INVALID");
  try { if (getAddress(value.identity) === ZeroAddress) throw new Error(); } catch { fail("HOSTED_TASK_CONFIG_INVALID"); }
  path(value.guardianKeyFile); path(value.rpcUrlFile); path(value.walletDirectory);
  taskLoopbackUrl(value.arenaUrl); taskLoopbackUrl(value.underwriterUrl);
  amount(value.initialCashRaw ?? "0");
  const sponsorship = [value.gasGrantWei, value.gasSponsorKeyFile, value.gasSponsorBudgetWei];
  if (sponsorship.some(v => v !== undefined)) {
    if (sponsorship.some(v => v === undefined) || BigInt(amount(value.gasGrantWei)) < 1n || BigInt(amount(value.gasSponsorBudgetWei)) < BigInt(value.gasGrantWei)) fail("HOSTED_GAS_CONFIG_INVALID");
    path(value.gasSponsorKeyFile);
  }
  for (const field of ["timeoutMs", "pollTimeoutMs"] as const) if (value[field] !== undefined && (!Number.isSafeInteger(value[field]) || value[field] < 1000 || value[field] > 300000)) fail("HOSTED_TASK_CONFIG_INVALID");
  let expected: string | undefined;
  const ids = new Set<string>();
  for (const model of value.models) {
    object(model, ["id", "physicalModels", "templates"]);
    if (typeof model.id !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(model.id) || ids.has(model.id)) fail("HOSTED_TASK_CONFIG_INVALID"); ids.add(model.id);
    object(model.physicalModels, ["cheap", "strong"]);
    if ([model.physicalModels.cheap, model.physicalModels.strong].some(v => typeof v !== "string" || !/^[a-zA-Z0-9_./:-]{1,120}$/.test(v))) fail("HOSTED_TASK_CONFIG_INVALID");
    object(model.templates, strategies);
    for (const strategy of strategies) {
      const workflow = validateWorkflowConfig(model.templates[strategy]);
      if (!["31337", "10143"].includes(workflow.chainId) || !workflow.providers.length) fail("HOSTED_TASK_CONFIG_INVALID");
      workflow.providers.forEach(provider => taskLoopbackUrl(provider.relayUrl));
      const observed = hash(domain(workflow)); if (expected && observed !== expected) fail("HOSTED_TASK_DOMAIN_MISMATCH"); expected = observed;
      const rpc = new URL(value.publicRpcUrl);
      if (rpc.username || rpc.password || rpc.search || rpc.hash) fail("HOSTED_TASK_RPC_INVALID");
      if (workflow.chainId === "31337") { taskLoopbackUrl(value.publicRpcUrl); if (value.rpcTransport !== "direct") fail("HOSTED_TASK_RPC_INVALID"); }
      else if (rpc.protocol !== "https:") fail("HOSTED_TASK_RPC_INVALID");
    }
  }
  return structuredClone(value) as HostedTaskExecutorConfig;
}
export async function loadHostedTaskExecutorConfig(file: string): Promise<HostedTaskExecutorConfig> {
  try {
    const config = validateHostedTaskExecutorConfig(JSON.parse(await taskPrivateFile(path(file))));
    new Wallet((await taskPrivateFile(config.guardianKeyFile)).trim());
    if (config.gasSponsorKeyFile) new Wallet((await taskPrivateFile(config.gasSponsorKeyFile)).trim());
    const rpc = (await taskPrivateFile(config.rpcUrlFile)).trim(), chainId = config.models[0].templates.conservative.chainId;
    if (chainId === "31337") taskLoopbackUrl(rpc);
    else { const u = new URL(rpc); if (u.protocol !== "https:" || u.username || u.password || u.hash) fail("HOSTED_TASK_RPC_INVALID"); }
    return config;
  } catch (error) { throw new HostedError(safeCode(error) === "HOSTED_EXECUTION_UNCERTAIN" ? "HOSTED_TASK_PRIVATE_CONFIG_REQUIRED" : safeCode(error), 503); }
}

const accountAbi = [...ACCOUNT_ABI, "function taskEscrow() view returns(address)", "function protocolFrozen(uint256) view returns(bool)",
  "function getPolicy(uint256) view returns(tuple(uint256 maxCashPerTx,uint256 maxDebtPerTx,uint256 maxDebtPerDay,bool ownerFrozen))",
  "function setPolicy(uint256,tuple(uint256 maxCashPerTx,uint256 maxDebtPerTx,uint256 maxDebtPerDay,bool ownerFrozen))", "function depositCash(uint256,uint256) payable"];
const managerAbi = [...MANAGER_ABI, "function guardian() view returns(address)", "function taskEscrow() view returns(address)", "function adapter() view returns(address)", "function enrollAgent(uint256)"];
const adapterAbi = ["function identity() view returns(address)", "function creditManager() view returns(address)", "function snapshotVersion(uint256) view returns(uint64)", "function identityChanged(uint256) view returns(bool)"];
const tokenAbi = ["function balanceOf(address) view returns(uint256)", "function approve(address,uint256) returns(bool)"];
const iface = { identity: new Interface(IDENTITY_ABI), account: new Interface(accountAbi), manager: new Interface(managerAbi), token: new Interface(tokenAbi) };

/** Hosted custody adapter. It does not deploy contracts, fund wallets, run games, or grant new credit. */
export class HostedTaskExecutor implements HostedExecutor {
  readonly config: HostedTaskExecutorConfig;
  constructor(config: HostedTaskExecutorConfig, private dependencies: HostedTaskDependencies = {}) { this.config = validateHostedTaskExecutorConfig(config); }
  private snapshot(input: HostedExecution): Snapshot {
    const agent = input.agent, model = this.config.models.find(model => model.id === agent.modelId);
    if (!model || !strategies.includes(agent.strategy)) fail("HOSTED_TASK_MODEL_NOT_ALLOWED");
    const settings: AgentSettings = { name: agent.name, modelId: agent.modelId, strategy: agent.strategy, perRunBudgetRaw: amount(agent.perRunBudgetRaw), totalBudgetRaw: amount(agent.totalBudgetRaw), allowCredit: agent.allowCredit };
    if (input.run.action !== "deposit" && input.run.amountRaw !== undefined) fail("HOSTED_EXECUTION_BINDING_INVALID");
    if (typeof settings.allowCredit !== "boolean" || BigInt(settings.perRunBudgetRaw) < 1n || BigInt(settings.totalBudgetRaw) < BigInt(settings.perRunBudgetRaw)) fail("HOSTED_TASK_BUDGET_INVALID");
    const workflow = structuredClone(model.templates[agent.strategy]);
    workflow.agentId = agent.binding?.agentId ?? "1"; workflow.allowCredit = settings.allowCredit;
    const reserved = BigInt(amount(input.run.reservedRaw)), limit = BigInt(settings.perRunBudgetRaw);
    if (input.run.action === "task") {
      if (!agent.binding || agent.binding.chainId !== workflow.chainId || !sameAddress(agent.binding.wallet, agent.wallet) || reserved < 1n || reserved > limit || BigInt(amount(agent.spentRaw)) + reserved > BigInt(settings.totalBudgetRaw)) fail("HOSTED_TASK_BUDGET_INVALID");
      workflow.maxPrice = String(reserved < BigInt(workflow.maxPrice) ? reserved : BigInt(workflow.maxPrice));
      workflow.tasks = workflow.tasks.map(task => ({ ...task, creditLimit: settings.allowCredit ? String(BigInt(task.creditLimit) < reserved ? BigInt(task.creditLimit) : reserved) : "0" }));
    } else if (input.run.action === "deposit") {
      if (!agent.binding || agent.binding.chainId !== workflow.chainId || !sameAddress(agent.binding.wallet, agent.wallet) || reserved !== 0n || BigInt(amount(input.run.amountRaw)) === 0n) fail("HOSTED_DEPOSIT_BINDING_INVALID");
    } else if (agent.binding || reserved !== 0n) fail("HOSTED_PROVISION_BINDING_INVALID");
    validateWorkflowConfig(workflow);
    return { agent: agent.id, owner: agent.owner, wallet: getAddress(agent.wallet), request: input.run.requestId, action: input.run.action as Snapshot["action"], reservedRaw: input.run.reservedRaw, ...(input.run.action === "deposit" ? { amountRaw: input.run.amountRaw } : {}), settings,
      config: structuredClone(this.config), workflow, physicalModels: structuredClone(model.physicalModels) };
  }
  async execute(input: HostedExecution): Promise<HostedResult> {
    if (!["provision", "deposit", "task"].includes(input.run.action)) throw new HostedError("HOSTED_ACTION_NOT_SUPPORTED", 400);
    if (input.run.agentId !== input.agent.id || !isAbsolute(input.directory)) fail("HOSTED_EXECUTION_BINDING_INVALID");
    const store = new SessionStore<ExecutorState>(join(input.directory, "task-executor")); await store.start(input.recover);
    let state: ExecutorState | undefined, verified = false, provider = this.dependencies.provider, close: (() => void) | undefined;
    try {
      state = await store.read();
      if (state) {
        if (state.version !== 1 || state.binding !== hash(state.snapshot) || state.snapshot.agent !== input.agent.id || state.snapshot.request !== input.run.requestId || state.snapshot.action !== input.run.action || state.snapshot.owner !== input.agent.owner || !sameAddress(state.snapshot.wallet, input.agent.wallet) || state.snapshot.reservedRaw !== input.run.reservedRaw) fail("HOSTED_EXECUTION_BINDING_CHANGED");
        if (state.snapshot.action !== "provision" && (!input.agent.binding || input.agent.binding.agentId !== state.snapshot.workflow.agentId || input.agent.binding.chainId !== state.snapshot.workflow.chainId || !sameAddress(input.agent.binding.wallet, state.snapshot.wallet))) fail("HOSTED_EXECUTION_BINDING_CHANGED");
        if (state.snapshot.amountRaw !== input.run.amountRaw) fail("HOSTED_EXECUTION_BINDING_CHANGED");
        validateHostedTaskExecutorConfig(state.snapshot.config); validateWorkflowConfig(state.snapshot.workflow);
      } else {
        // The root admission may survive a crash before this adapter's first save. No external action precedes this save.
        const snapshot = this.snapshot(input); state = { version: 1, snapshot, binding: hash(snapshot), transactions: {} }; await store.write(state);
      }
      verified = true;
      if (state.result?.terminal) return structuredClone(state.result);
      const snapshot = state.snapshot, config = snapshot.config, workflow = snapshot.workflow;
      const key = (await taskPrivateFile(path(input.keyFile))).trim(); let wallet: Wallet;
      try { wallet = new Wallet(key); } catch { return fail("HOSTED_AGENT_KEY_INVALID"); }
      if (!sameAddress(wallet.address, snapshot.wallet)) fail("HOSTED_AGENT_KEY_MISMATCH");
      if (sameAddress(wallet.address, new Wallet((await taskPrivateFile(config.guardianKeyFile)).trim()).address) || config.gasSponsorKeyFile && sameAddress(wallet.address, new Wallet((await taskPrivateFile(config.gasSponsorKeyFile)).trim()).address)) fail("HOSTED_AGENT_OPERATOR_COLLISION");
      if (!provider) {
        const rpcUrl = (await taskPrivateFile(config.rpcUrlFile)).trim();
        if (workflow.chainId === "10143") { const connection = await monadProvider(rpcUrl, config.rpcTransport); provider = connection.provider; close = connection.close; }
        else { taskLoopbackUrl(rpcUrl); provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1, batchMaxCount: 1 }); close = () => provider!.destroy(); }
      }
      const rpc = provider!; wallet = wallet.connect(rpc);
      const checkNetwork = async () => { if (BigInt(await rpc.send("eth_chainId", [])) !== BigInt(workflow.chainId)) fail("HOSTED_NETWORK_MISMATCH"); };
      await checkNetwork();
      const account = new Contract(workflow.account, accountAbi, rpc), managerAddress = await account.getFunction("creditManager").staticCall(), manager = new Contract(managerAddress, managerAbi, rpc);
      const adapterAddress = await account.getFunction("adapter").staticCall(), adapter = new Contract(adapterAddress, adapterAbi, rpc);
      const [asset, accountEscrow, managerAccount, managerEscrow, managerAdapter, registry, adapterManager] = await Promise.all([
        account.getFunction("settlementAsset").staticCall(), account.getFunction("taskEscrow").staticCall(), manager.getFunction("agentAccount").staticCall(), manager.getFunction("taskEscrow").staticCall(), manager.getFunction("adapter").staticCall(), adapter.getFunction("identity").staticCall(), adapter.getFunction("creditManager").staticCall()]);
      if (!sameAddress(asset, workflow.asset) || !sameAddress(accountEscrow, workflow.escrowAddress) || !sameAddress(managerAccount, workflow.account) || !sameAddress(managerEscrow, workflow.escrowAddress) || !sameAddress(managerAdapter, adapterAddress) || !sameAddress(registry, config.identity) || !sameAddress(adapterManager, managerAddress)) fail("HOSTED_PROTOCOL_BINDING_MISMATCH");
      const identity = new IdentityRegistry({ address: config.identity, provider: rpc, expectedChainId: BigInt(workflow.chainId) });
      const save = () => store.write(state!);
      const step = async (id: string, signer: Wallet, to: string, data: string, value = 0n): Promise<TransactionReceipt> => {
        await checkNetwork(); let entry = state!.transactions[id];
        if (!entry) {
          if (snapshot.action === "task" && Date.now() + workflow.minRemainingMs >= workflow.deadlineMs) fail("WORKFLOW_DEADLINE");
          if (await rpc.getBalance(signer.address) === 0n) fail("HOSTED_WALLET_GAS_REQUIRED");
          const populated = await signer.populateTransaction({ to, data, value, chainId: BigInt(workflow.chainId) });
          if (BigInt(populated.gasLimit!) > 1000000n) fail("HOSTED_PROVISION_GAS_LIMIT");
          const raw = await signer.signTransaction(populated); entry = { raw, hash: keccak256(raw), from: signer.address, nonce: Number(populated.nonce) }; state!.transactions[id] = entry; await save();
        }
        const signed = Transaction.from(entry.raw);
        if (signed.hash !== entry.hash || !sameAddress(signed.from!, signer.address) || !sameAddress(entry.from, signer.address) || signed.chainId !== BigInt(workflow.chainId) || signed.nonce !== entry.nonce || !sameAddress(signed.to!, to) || signed.data !== data || signed.value !== value) fail("HOSTED_TRANSACTION_BINDING_CHANGED");
        let receipt = await rpc.getTransactionReceipt(entry.hash);
        if (!receipt) {
          if (snapshot.action === "task" && Date.now() + workflow.minRemainingMs >= workflow.deadlineMs) fail("WORKFLOW_DEADLINE");
          if (await rpc.getTransaction(entry.hash)) fail("HOSTED_TRANSACTION_PENDING");
          if (await rpc.getTransactionCount(signer.address, "latest") > entry.nonce) fail("HOSTED_TRANSACTION_UNCERTAIN");
          try {
            await rpc.broadcastTransaction(entry.raw);
            const deadline = Date.now() + (config.timeoutMs ?? 10000);
            do { receipt = await rpc.getTransactionReceipt(entry.hash); if (receipt) break; await delay(100); } while (Date.now() < deadline);
          } catch { fail("HOSTED_TRANSACTION_UNCERTAIN"); }
        }
        if (!receipt) fail("HOSTED_TRANSACTION_UNCERTAIN");
        const block = await rpc.getBlock(receipt.blockNumber);
        if (block?.hash !== receipt.blockHash || receipt.hash !== entry.hash || !sameAddress(receipt.from, signer.address) || !receipt.to || !sameAddress(receipt.to, to)) fail("HOSTED_TRANSACTION_UNCERTAIN");
        entry.receipt = receipt.toJSON(); await save();
        if (receipt.status === 0) fail("HOSTED_TRANSACTION_REVERTED"); if (receipt.status !== 1) fail("HOSTED_TRANSACTION_UNCERTAIN"); return receipt;
      };
      const directory = join(store.directory, "workflow"), walletDirectory = join(config.walletDirectory, wallet.address.toLowerCase()), walletStore = new SessionStore<WalletSlot>(walletDirectory);
      await walletStore.start(input.recover);
      let held = true;
      try {
        const slot = await walletStore.read(), binding = snapshot.action === "task" ? hash(workflow) : state.binding;
        if (slot?.phase === "Stopped") { const old = await readWorkflowStatus(slot.directory); if (!old) fail("WORKFLOW_RECOVERY_REQUIRED"); slot.phase = old.phase; }
        if (slot && (!sameAddress(slot.signer, wallet.address) || !closed(slot.phase) && (slot.directory !== directory || slot.binding !== binding || slot.chainId !== workflow.chainId || !sameAddress(slot.account, workflow.account)))) fail("WORKFLOW_RECOVERY_REQUIRED");
        const walletSlot = (phase: string) => walletStore.write({ chainId: workflow.chainId, signer: wallet.address, account: workflow.account, directory, binding, phase });
        await walletSlot("Paused");
        if (snapshot.action === "provision") {
          if (config.gasSponsorKeyFile) {
            const sponsor = new Wallet((await taskPrivateFile(config.gasSponsorKeyFile)).trim(), rpc);
            if (sameAddress(sponsor.address, wallet.address)) fail("HOSTED_GAS_SPONSOR_BINDING_INVALID");
            // Shared by sponsorship and enrollment when both operator roles use the same key.
            const nonceStore = new SessionStore<GuardianSlot>(join(config.walletDirectory, "operator", sponsor.address.toLowerCase())); await nonceStore.start(input.recover);
            const ledgerStore = new SessionStore<GasLedger>(join(config.walletDirectory, "gas-grants", `${workflow.chainId}-${sponsor.address.toLowerCase()}`));
            let ledgerHeld = false;
            try {
              await ledgerStore.start(input.recover); ledgerHeld = true;
              const ledger = await ledgerStore.read() ?? { version: 1 as const, chainId: workflow.chainId, sponsor: sponsor.address, grants: {} };
              if (ledger.version !== 1 || ledger.chainId !== workflow.chainId || !sameAddress(ledger.sponsor, sponsor.address)) fail("HOSTED_GAS_LEDGER_INVALID");
              let reserved = 0n;
              for (const entry of Object.values(ledger.grants)) {
                const signed = Transaction.from(entry.transaction.raw);
                if (signed.hash !== entry.transaction.hash || !sameAddress(signed.from!, sponsor.address) || signed.chainId !== BigInt(workflow.chainId) || !sameAddress(signed.to!, entry.wallet) || signed.value !== BigInt(amount(entry.amount)) || signed.data !== "0x" || signed.gasLimit !== 21000n) fail("HOSTED_GAS_LEDGER_INVALID");
                reserved += signed.value;
              }
              let grant = ledger.grants[snapshot.agent];
              if (grant && !sameAddress(grant.wallet, wallet.address)) fail("HOSTED_GAS_GRANT_BINDING_CHANGED");
              const active = await nonceStore.read();
              if (active?.directory && active.directory !== store.directory) fail("HOSTED_OPERATOR_RECOVERY_REQUIRED");
              if (!grant) {
                const value = BigInt(config.gasGrantWei!);
                if (reserved + value > BigInt(config.gasSponsorBudgetWei!)) fail("HOSTED_GAS_BUDGET_EXHAUSTED");
                if (await rpc.getBalance(sponsor.address) <= value) fail("HOSTED_GAS_SPONSOR_FUNDS_REQUIRED");
                await nonceStore.write({ directory: store.directory });
                let transaction = state.transactions.gas;
                if (!transaction) {
                  const populated = await sponsor.populateTransaction({ to: wallet.address, value, data: "0x", gasLimit: 21000n, chainId: BigInt(workflow.chainId) });
                  const raw = await sponsor.signTransaction(populated); transaction = { raw, hash: keccak256(raw), from: sponsor.address, nonce: Number(populated.nonce) }; state.transactions.gas = transaction; await save();
                }
                grant = { wallet: wallet.address, amount: config.gasGrantWei!, directory: store.directory, transaction, confirmed: false };
                ledger.grants[snapshot.agent] = grant; await ledgerStore.write(ledger); // Unknown sends consume the reserved grant budget too.
              }
              if (!grant.confirmed && grant.directory !== store.directory) fail("HOSTED_GAS_RECOVER_ORIGINAL_REQUIRED");
              if (!grant.confirmed || grant.directory === store.directory) {
                state.transactions.gas = grant.transaction; await save(); await nonceStore.write({ directory: store.directory, hash: grant.transaction.hash });
                await step("gas", sponsor, wallet.address, "0x", BigInt(grant.amount)); grant.confirmed = true; await ledgerStore.write(ledger); await nonceStore.write({});
              }
            } finally { if (ledgerHeld) await ledgerStore.close(); await nonceStore.close(); }
          }
          const uri = `urn:agentfuel:hosted:${snapshot.agent}`;
          const registration = registrationFromReceipt(await step("register", wallet, config.identity, iface.identity.encodeFunctionData("register(string)", [uri])), config.identity, wallet.address, uri);
          state.agentId = String(registration.agentId); await save();
          let current = await identity.readIdentity(registration.agentId);
          if (!sameAddress(current.owner, wallet.address)) fail("HOSTED_IDENTITY_OWNER_CHANGED");
          if (!sameAddress(current.wallet, wallet.address)) {
            let data: string;
            if (state.transactions.bind) data = Transaction.from(state.transactions.bind.raw).data;
            else { const consent = await identity.signWalletConsent(wallet, registration.agentId); data = iface.identity.encodeFunctionData("setAgentWallet", [registration.agentId, wallet.address, consent.deadline, consent.signature]); }
            await step("bind", wallet, config.identity, data); current = await identity.readIdentity(registration.agentId);
            if (!sameAddress(current.wallet, wallet.address)) fail("HOSTED_IDENTITY_WALLET_CHANGED");
          }
          const guardian = new Wallet((await taskPrivateFile(config.guardianKeyFile)).trim(), rpc);
          if (!sameAddress(await manager.getFunction("guardian").staticCall(), guardian.address)) fail("HOSTED_GUARDIAN_NOT_AUTHORIZED");
          const guardianStore = new SessionStore<GuardianSlot>(join(config.walletDirectory, "operator", guardian.address.toLowerCase())); await guardianStore.start(input.recover);
          try {
            const active = await guardianStore.read(); if (active?.directory && active.directory !== store.directory) fail("HOSTED_GUARDIAN_RECOVERY_REQUIRED");
            // Claim the shared guardian nonce writer before preparing/sending this request's original enrollment.
            await guardianStore.write({ directory: store.directory, ...(state.transactions.enroll ? { hash: state.transactions.enroll.hash } : {}) });
            const version = await adapter.getFunction("snapshotVersion").staticCall(state.agentId);
            if (state.transactions.enroll || version === 0n) await step("enroll", guardian, managerAddress, iface.manager.encodeFunctionData("enrollAgent", [state.agentId]));
            if (await adapter.getFunction("snapshotVersion").staticCall(state.agentId) === 0n || await adapter.getFunction("identityChanged").staticCall(state.agentId)) fail("HOSTED_ENROLLMENT_UNCONFIRMED");
            await guardianStore.write({});
          } finally { await guardianStore.close(); }
        } else state.agentId = workflow.agentId;
        const id = state.agentId!;
        const deposit = async (value: bigint) => {
          if (!state!.transactions.deposit) {
            const balance = workflow.asset === ZeroAddress ? await rpc.getBalance(wallet.address) : await new Contract(workflow.asset, tokenAbi, rpc).getFunction("balanceOf").staticCall(wallet.address);
            if (balance < value) fail("HOSTED_AGENT_FUNDS_REQUIRED");
          }
          if (workflow.asset !== ZeroAddress) await step("approve", wallet, workflow.asset, iface.token.encodeFunctionData("approve", [workflow.account, value]));
          await step("deposit", wallet, workflow.account, iface.account.encodeFunctionData("depositCash", [id, value]), workflow.asset === ZeroAddress ? value : 0n);
        };
        if (snapshot.action === "deposit") {
          const current = await identity.readIdentity(BigInt(id));
          if (!sameAddress(current.owner, wallet.address) || !sameAddress(current.wallet, wallet.address)) fail("HOSTED_IDENTITY_CHANGED");
          await deposit(BigInt(snapshot.amountRaw!));
          state.result = { phase: "Deposited", terminal: true, success: true, chargedRaw: "0", cashRaw: String(await account.getFunction("cash").staticCall(id)), txHash: state.transactions.deposit.hash };
          await walletSlot("Succeeded"); await save(); return structuredClone(state.result);
        }
        let pendingPayment = false;
        if (snapshot.action === "task" && await readWorkflowStatus(directory)) {
          const existing = JSON.parse(await readFile(join(directory, "session.json"), "utf8")) as WorkflowSession;
          pendingPayment = !!(existing.handle?.submission || existing.child?.inference);
        }
        // Paid/uncertain requests must still reach the existing workflow's read-only refund/chain-termination recovery,
        // including when a default has frozen the Agent. They must never trigger a new policy transaction.
        if (!pendingPayment) {
          const current = await identity.readIdentity(BigInt(id));
          if (!sameAddress(current.owner, wallet.address) || !sameAddress(current.wallet, wallet.address) || await adapter.getFunction("snapshotVersion").staticCall(id) === 0n || await adapter.getFunction("identityChanged").staticCall(id)) fail("HOSTED_IDENTITY_CHANGED");
          const policy = await account.getFunction("getPolicy").staticCall(id);
          if (policy.ownerFrozen || await account.getFunction("protocolFrozen").staticCall(id)) fail("HOSTED_AGENT_FROZEN");
          const cashCap = snapshot.action === "task" ? snapshot.reservedRaw : snapshot.settings.perRunBudgetRaw;
          const target = { maxCashPerTx: cashCap, maxDebtPerTx: snapshot.settings.allowCredit ? cashCap : "0", maxDebtPerDay: snapshot.settings.allowCredit ? snapshot.settings.totalBudgetRaw : "0", ownerFrozen: false };
          if (state.transactions.policy || String(policy.maxCashPerTx) !== target.maxCashPerTx || String(policy.maxDebtPerTx) !== target.maxDebtPerTx || String(policy.maxDebtPerDay) !== target.maxDebtPerDay) await step("policy", wallet, workflow.account, iface.account.encodeFunctionData("setPolicy", [id, target]));
          const currentPolicy = await account.getFunction("getPolicy").staticCall(id);
          if (currentPolicy.ownerFrozen || String(currentPolicy.maxCashPerTx) !== target.maxCashPerTx || String(currentPolicy.maxDebtPerTx) !== target.maxDebtPerTx || String(currentPolicy.maxDebtPerDay) !== target.maxDebtPerDay) fail("HOSTED_POLICY_CHANGED");
        }
        if (snapshot.action === "provision") {
          const initial = BigInt(config.initialCashRaw ?? "0");
          if (initial > 0n) await deposit(initial);
          const binding: HostedBinding = { agentId: id, chainId: workflow.chainId, wallet: wallet.address };
          state.result = { phase: "Ready", terminal: true, success: true, chargedRaw: "0", binding, cashRaw: String(await account.getFunction("cash").staticCall(id)), txHash: state.transactions.register.hash };
          await walletSlot("Succeeded"); await save(); return structuredClone(state.result);
        }
        // The workflow owns this same wallet lock from here; its durable binding is already frozen.
        await walletStore.close(); held = false;
        const status = await runTaskWorkflow(directory, workflow, { signer: wallet, provider: rpc, rpcUrl: config.publicRpcUrl, arenaUrl: config.arenaUrl, underwriterUrl: config.underwriterUrl,
          walletLockDirectory: walletDirectory, runner: this.dependencies.runner, recoverLock: input.recover, timeoutMs: config.timeoutMs, pollTimeoutMs: config.pollTimeoutMs });
        state.result = await this.taskResult(directory, state, status, account, rpc); await save(); return structuredClone(state.result);
      } finally { if (held) await walletStore.close(); }
    } catch (error) {
      if (!state || !verified) throw error; // A conflicting caller must never rewrite another request's valid journal/result.
      const reason = safeCode(error);
      // Even partially provisioned identities retain their original request; never register another ID on an unknown result.
      state.result = { phase: "Paused", terminal: false, success: false, chargedRaw: "0", reason };
      await store.write(state); return structuredClone(state.result);
    } finally { close?.(); await store.close(); }
  }
  private async taskResult(directory: string, state: ExecutorState, status: WorkflowStatus, account: Contract, rpc: JsonRpcProvider): Promise<HostedResult> {
    const privateState = JSON.parse(await readFile(join(directory, "session.json"), "utf8")) as WorkflowSession;
    const run = (privateState.child?.inference?.result as unknown as { run?: { rounds?: { tier: "cheap" | "strong"; model: string; body: { model?: string } }[] } })?.run;
    if (run?.rounds?.some(round => round.model !== state.snapshot.physicalModels[round.tier] || round.body.model !== round.model)) fail("HOSTED_PHYSICAL_MODEL_MISMATCH");
    let charged = 0n;
    if (status.paymentId) {
      const payment = await account.getFunction("getPayment").staticCall(status.paymentId);
      if (payment.fromCash + payment.fromCredit > 0n) {
        const quote = privateState.handle!.quote, transactionHash = privateState.handle?.submission?.txHash, receipt = transactionHash ? await rpc.getTransactionReceipt(transactionHash) : null;
        const block = receipt ? await rpc.getBlock(receipt.blockNumber) : null;
        const event = receipt?.logs.filter(log => sameAddress(log.address, state.snapshot.workflow.account)).map(log => { try { return account.interface.parseLog(log); } catch { return null; } }).filter(event => event?.name === "ProviderPaid" && event.args.paymentId === status.paymentId);
        if (payment.agentId !== BigInt(state.snapshot.workflow.agentId) || payment.fromCash + payment.fromCredit !== BigInt(quote.price) || payment.refundedAmount > payment.fromCash + payment.fromCredit || payment.fromCredit > 0n && payment.taskId !== BigInt(status.choice!.taskId) || receipt?.status !== 1 || receipt.hash !== transactionHash || block?.hash !== receipt.blockHash || !sameAddress(receipt.from, state.snapshot.wallet) || !receipt.to || !sameAddress(receipt.to, state.snapshot.workflow.account) || event?.length !== 1 || event[0]!.args.agentId !== payment.agentId || event[0]!.args.fromCash !== payment.fromCash || event[0]!.args.fromCredit !== payment.fromCredit || !sameAddress(event[0]!.args.provider, quote.payTo)) fail("HOSTED_PAYMENT_UNCONFIRMED");
        charged = BigInt(payment.fromCash) + BigInt(payment.fromCredit) - BigInt(payment.refundedAmount);
      }
    }
    if (charged > BigInt(state.snapshot.reservedRaw)) fail("HOSTED_TASK_BUDGET_EXCEEDED");
    return { phase: status.phase, terminal: closed(status.phase), success: status.phase === "Succeeded", chargedRaw: String(charged), ...(status.reason ? { reason: status.reason } : {}),
      ...(status.choice ? { taskId: status.choice.taskId } : {}), ...(status.paymentId ? { paymentId: status.paymentId } : {}), ...(status.acceptTxHash ? { txHash: status.acceptTxHash } : {}),
      cashRaw: String(await account.getFunction("cash").staticCall(state.snapshot.workflow.agentId)), ...(status.finance ? { principalRaw: status.finance.principal, feeRaw: status.finance.fee } : {}) };
  }
}
export const createHostedTaskExecutor = (config: HostedTaskExecutorConfig, dependencies?: HostedTaskDependencies) => new HostedTaskExecutor(config, dependencies);
