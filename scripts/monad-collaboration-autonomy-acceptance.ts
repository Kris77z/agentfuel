import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Contract, Wallet, getAddress, type JsonRpcProvider, type TransactionRequest } from "ethers";
import { SessionStore } from "../packages/pi-loop/src/session.js";
import { publicLiveHand, HOLDEM_LIVE_LIMITS, type LiveHandSession } from "../services/arena/src/holdem/live.js";
import { ESCROW_ABI, atomicJson } from "../services/arena/src/protocol.js";
import { DemoJournal } from "./demo-journal.js";
import { monadProvider, readRpcUrlFile } from "./demo-rpc.js";
import { reportDemoFailure } from "./demo-common.js";

/** Explicit production business acceptance. Default inspect never creates a key,
 * Agent, task, transaction or model call. Apply/recover share durable UUIDs and
 * original signed transactions; a failed/Unknown run is never replaced. */
export type AutonomyAcceptanceMode = "inspect" | "prepare-task" | "prepare-agent" | "apply" | "recover" | "evidence" | "replay";
interface State {
  version: 1; runtime: string; origin: string; bootstrap: string; owner: string;
  createdAt: string; createId: string; parentId: string; agentId?: string;
  parentSubmitted?: boolean; before?: unknown; after?: unknown;
  fresh?: { version: 1; gasFunding?: AutonomyGasBinding; ownerAdmission?: { checkedAt: string; ownerAgents: number; sponsoredOwnerSlots: number; sponsoredTotal: number }; protocolBefore?: RecheckFreezeSnapshot };
  task?: { taskId: string; deadline: number; rewardRaw: string; problemId: "sum-integers"; creditLimit: "80000"; poster: string; escrow: string };
  gasTarget?: string;
  recheckOf?: { directory: string; parentId: string; agentId: string; taskId: string; owner: string; sourceSessionDigest: string };
  settingsChange?: { before: JsonObject; after: JsonObject; appliedAt?: string };
  seed?: { amountRaw: "10000"; depositId: string; financeBefore: JsonObject; transfer?: { txHash: string; blockNumber: number; blockHash: string; canonical: true };
    deposit?: JsonObject; preparedAt?: string };
  replay?: { before: JsonObject; after?: JsonObject; parent: JsonObject; verifiedAt?: string };
  freezeRemedy?: { guardian: string; manager: string; account: string; agentId: string; taskId: string; before: RecheckFreezeSnapshot;
    transaction?: { txHash: string; blockNumber: number; blockHash: string; canonical: true; event: "AgentUnfrozen"; by: string };
    after?: RecheckFreezeSnapshot; completedAt?: string };
}
type JsonObject = Record<string, any>;
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function responseSummary(rawText?: string) {
  if (!rawText) return undefined;
  try { const response = JSON.parse(rawText); return { model: response.model, usage: response.usage, responseDigest: sha256(response) }; }
  catch { return { invalidJson: true, responseDigest: sha256(rawText) }; }
}
async function optional<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
function invariant(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
const RECHECK_MANAGER_ABI = ["function guardian() view returns(address)", "function protocolFrozen(uint256) view returns(bool)",
  "function defaultCount(uint256) view returns(uint256)", "function getLoan(uint256) view returns(tuple(uint256 agentId,uint256 principal,uint256 fee,uint256 loanDueAt,uint8 status))",
  "function unfreezeAgent(uint256)", "event AgentUnfrozen(uint256 indexed agentId,address by)"];
export interface RecheckFreezeSnapshot { block: { number: number; hash: string }; guardian: string; managerFrozen: boolean; accountFrozen: boolean;
  defaultsRaw: string; loan: { agentId: string; principal: string; fee: string; loanDueAt: string; status: string }; loanDigest: string }
export async function readRecheckFreezeSnapshot(provider: JsonRpcProvider, managerAddress: string, accountAddress: string, agentId: string, taskId: string): Promise<RecheckFreezeSnapshot> {
  const block = await provider.getBlock("latest"); invariant(block?.hash, "AUTONOMY_RECHECK_FREEZE_BLOCK_REQUIRED");
  const manager = new Contract(managerAddress, RECHECK_MANAGER_ABI, provider), account = new Contract(accountAddress, ["function protocolFrozen(uint256) view returns(bool)"], provider);
  const at = { blockTag: block.number };
  const [guardian, managerFrozen, accountFrozen, defaults, value] = await Promise.all([manager.guardian(at), manager.protocolFrozen(agentId, at),
    account.protocolFrozen(agentId, at), manager.defaultCount(agentId, at), manager.getLoan(taskId, at)]);
  const loan = { agentId: String(value.agentId), principal: String(value.principal), fee: String(value.fee), loanDueAt: String(value.loanDueAt), status: String(value.status) };
  invariant((await provider.getBlock(block.number))?.hash === block.hash, "AUTONOMY_RECHECK_FREEZE_BLOCK_CHANGED");
  return { block: { number: block.number, hash: block.hash }, guardian: getAddress(guardian), managerFrozen, accountFrozen, defaultsRaw: String(defaults), loan, loanDigest: sha256(loan) };
}
export function assertRecheckUnfreezePreservesHistory(before: RecheckFreezeSnapshot, after: RecheckFreezeSnapshot) {
  invariant(before.managerFrozen && before.accountFrozen && !after.managerFrozen && !after.accountFrozen, "AUTONOMY_RECHECK_UNFREEZE_NOT_CONFIRMED");
  invariant(before.guardian === after.guardian && before.defaultsRaw === "1" && after.defaultsRaw === "1"
    && before.loan.status === "3" && before.loan.principal === "0" && before.loan.fee === "0" && before.loanDigest === sha256(before.loan)
    && after.loanDigest === sha256(after.loan) && after.loanDigest === before.loanDigest, "AUTONOMY_RECHECK_UNFREEZE_HISTORY_CHANGED");
}
const publicRun = (run?: JsonObject) => run && ({ requestId: run.requestId, agentId: run.agentId, action: run.action,
  status: run.status, chargedRaw: run.chargedRaw, reason: run.reason, recoverable: run.recoverable,
  result: run.result && { phase: run.result.phase, terminal: run.result.terminal, success: run.result.success,
    chargedRaw: run.result.chargedRaw, refundedRaw: run.result.refundedRaw, reason: run.result.reason,
    autonomousGames: run.result.autonomousGames, autonomousTasks: run.result.autonomousTasks } });

export function assertFreshAutonomyOwner(input: { ownerAgents: number; sponsoredOwnerSlots: number; sponsoredTotal: number }) {
  invariant(input.ownerAgents === 0 && input.sponsoredOwnerSlots === 0, "AUTONOMY_FRESH_UNUSED_OWNER_REQUIRED");
  invariant(Number.isSafeInteger(input.sponsoredTotal) && input.sponsoredTotal >= 0 && input.sponsoredTotal + 2 <= 100, "AUTONOMY_FRESH_GLOBAL_QUOTA_INSUFFICIENT");
}
export function assertFreshAutonomyBaseline(input: { agent: JsonObject; finance: JsonObject; protocol: RecheckFreezeSnapshot;
  sponsoredOwnerSlots: number; sponsoredTotal: number; openTaskIds: string[]; taskId: string; seedPresent: boolean; recheckPresent: boolean }) {
  assertFreshAutonomyOwner({ ownerAgents: 0, sponsoredOwnerSlots: input.sponsoredOwnerSlots, sponsoredTotal: input.sponsoredTotal });
  invariant(!input.seedPresent && !input.recheckPresent, "AUTONOMY_FRESH_SEED_OR_REMEDY_FORBIDDEN");
  invariant(input.agent.spentRaw === "0" && BigInt(input.agent.reservedRaw ?? "0") === 0n && input.agent.totalBudgetRaw === "130000"
    && input.agent.perRunBudgetRaw === "120000" && input.agent.allowCredit === true && input.agent.modelId === "kimi-k2.6"
    && input.agent.strategy === "balanced", "AUTONOMY_FRESH_SETTINGS_CHANGED");
  invariant(input.finance.status === "confirmed" && input.finance.cashRaw === "0" && input.finance.debtRaw === "0"
    && input.finance.counts?.defaults === "0" && input.protocol.defaultsRaw === "0" && !input.protocol.managerFrozen && !input.protocol.accountFrozen,
    "AUTONOMY_FRESH_HEALTHY_IDENTITY_REQUIRED");
  invariant(input.openTaskIds.length === 1 && input.openTaskIds[0] === input.taskId, "AUTONOMY_FRESH_OTHER_OPEN_TASKS");
}
export interface AutonomyGasBinding { amountWei: string; journalId: "fund-agent-gas" | "fund-agent-gas-0.6" }
function validateAutonomyGasWei(amount: string) {
  invariant(/^[1-9][0-9]{0,17}$/.test(amount) && BigInt(amount) <= 600000000000000000n, "AUTONOMY_GAS_WEI_OUT_OF_RANGE");
}
/** Bind before signing. Saved intents also preserve older signed/default gas
 * transfers without changing their journal ID or creating another nonce. */
export function autonomyGasBinding(input: { fresh: boolean; requestedWei?: string; saved?: AutonomyGasBinding;
  intents?: JsonObject; legacySigned?: boolean; currentSigned?: boolean }): AutonomyGasBinding {
  if (input.requestedWei !== undefined) { validateAutonomyGasWei(input.requestedWei); invariant(input.fresh, "AUTONOMY_GAS_WEI_FRESH_ONLY"); }
  invariant(!(input.legacySigned && input.currentSigned), "AUTONOMY_GAS_JOURNAL_CONFLICT");
  const legacy = input.intents?.["fund-agent-gas-0.6"], current = input.intents?.["fund-agent-gas"];
  invariant(!legacy || !current, "AUTONOMY_GAS_JOURNAL_CONFLICT");
  invariant(!input.legacySigned || legacy, "AUTONOMY_GAS_ORIGINAL_INTENT_REQUIRED");
  invariant(!input.currentSigned || current, "AUTONOMY_GAS_ORIGINAL_INTENT_REQUIRED");
  const existing = legacy ?? current;
  const binding = input.saved ?? { amountWei: String(existing?.value ?? input.requestedWei ?? "600000000000000000"),
    journalId: legacy || !input.fresh ? "fund-agent-gas-0.6" : "fund-agent-gas" };
  validateAutonomyGasWei(binding.amountWei);
  invariant(["fund-agent-gas", "fund-agent-gas-0.6"].includes(binding.journalId)
    && (input.requestedWei === undefined || binding.amountWei === input.requestedWei)
    && (!existing || binding.amountWei === String(existing.value) && binding.journalId === (legacy ? "fund-agent-gas-0.6" : "fund-agent-gas")),
    "AUTONOMY_GAS_BINDING_CHANGED");
  return binding;
}
export interface AutonomyAcceptanceOptions { runtime: string; output?: string; bootstrap?: string; gasSourceKeyFile?: string; gasWei?: string; recover?: boolean; recheckOf?: string; fresh?: boolean }
export async function monadCollaborationAutonomyAcceptance(mode: AutonomyAcceptanceMode, options: AutonomyAcceptanceOptions) {
  invariant(!options.fresh || options.output && !options.recheckOf, "AUTONOMY_FRESH_EXPLICIT_DIRECTORY_REQUIRED");
  if (options.gasWei !== undefined) { validateAutonomyGasWei(options.gasWei); invariant(!options.recheckOf, "AUTONOMY_GAS_WEI_FRESH_ONLY"); }
  const runtime = resolve(options.runtime), output = resolve(options.output ?? join(runtime, "collaboration-autonomy-20261015"));
  const ready = await optional<JsonObject>(join(runtime, "ready.json"));
  const bootstrapFile = resolve(options.bootstrap ?? ready?.bootstrapFile ?? join(runtime, "..", "bootstrap.json"));
  const bootstrap = await optional<JsonObject>(bootstrapFile); invariant(bootstrap?.chainId === "10143", "MONAD_BOOTSTRAP_REQUIRED");
  const origin = String(bootstrap.frontendOrigin);
  invariant(origin === "https://monad.tabbyai.xyz", "MONAD_PUBLIC_ORIGIN_REQUIRED");
  if (ready) invariant(ready.chainId === "10143" && ready.frontendOrigin === origin, "MONAD_READY_BINDING_CHANGED");
  const store = new SessionStore<State>(output); let held = false;
  const connection = await monadProvider(await readRpcUrlFile(bootstrap.rpcUrlFile), bootstrap.rpcTransport);
  try {
    const provider = connection.provider; invariant(BigInt(await provider.send("eth_chainId", [])) === 10143n, "MONAD_NETWORK_MISMATCH");
    const recorded = await optional<State>(join(output, "session.json"));
    const journal = new DemoJournal(provider, join(output, "transactions.json")); await journal.load();
    const gasIntents = await optional<JsonObject>(join(output, "intents.json"));
    let selectedGas = autonomyGasBinding({ fresh: Boolean(recorded?.fresh || options.fresh), requestedWei: options.gasWei,
      saved: recorded?.fresh?.gasFunding, intents: gasIntents, legacySigned: journal.has("fund-agent-gas-0.6"), currentSigned: journal.has("fund-agent-gas") });
    const taskContract = new Contract(bootstrap.contracts.escrow, [...ESCROW_ABI,
      "function nextTaskId() view returns(uint256)", "function createTask(uint256,uint256)",
      "event TaskCreated(uint256 indexed taskId,address indexed poster,uint256 reward,uint256 deadline)"], provider);
    const templateDeadline = (await optional<JsonObject>(join(runtime, "runtime-journal", "session.json")))?.templateDeadlineMs;
    if (mode === "inspect") {
      const next = await taskContract.nextTaskId();
      const task = recorded?.task ? await taskContract.getTask(recorded.task.taskId) : undefined;
      const taskFunded = Boolean(recorded?.task && task?.reward === 150000n && getAddress(task.poster) === recorded.task.poster);
      const database = await optional<JsonObject>(join(runtime, "hosted", "database", "session.json"));
      const hosted = ready && await optional<JsonObject>(ready.hostedConfigFile);
      const taskConfig = hosted?.executor?.taskConfigFile && await optional<JsonObject>(hosted.executor.taskConfigFile);
      const template = taskConfig?.models?.find((model: JsonObject) => model.id === "kimi-k2.6")?.templates?.balanced;
      const block = await provider.getBlock("latest"); invariant(block?.hash, "MONAD_LATEST_BLOCK_REQUIRED");
      const catalog = [];
      for (const entry of template?.tasks ?? []) {
        const value = await taskContract.getTask(entry.taskId, { blockTag: block.number });
        catalog.push({ taskId: String(entry.taskId), status: String(value.status), assignedAgentId: String(value.agentId),
          deadline: String(value.deadline), rewardRaw: String(value.reward), escrowBalanceRaw: String(value.escrowBalance),
          openAndUnassigned: value.status === 1n && value.agentId === 0n && Number(value.deadline) > block.timestamp });
      }
      const token = new Contract(bootstrap.asset.address, ["function balanceOf(address) view returns(uint256)"], provider);
      const resources: JsonObject = {};
      for (const role of ["guardian", "underwriter", "verifier", "sponsor", "opponent"]) {
        const wallet = new Wallet((await readFile(bootstrap.roleKeyFiles[role], "utf8")).trim());
        resources[role] = { address: wallet.address, nativeWei: String(await provider.getBalance(wallet.address, block.number)),
          testUsdcRaw: String(await token.balanceOf(wallet.address, { blockTag: block.number })) };
      }
      if (options.gasSourceKeyFile) {
        const wallet = new Wallet((await readFile(options.gasSourceKeyFile, "utf8")).trim());
        resources.gasSource = { address: wallet.address, nativeWei: String(await provider.getBalance(wallet.address, block.number)) };
      }
      const requiredByAddress: Record<string, { address: string; testUsdcRaw: string; availableTestUsdcRaw: string; sufficient: boolean }> = {};
      for (const [role, amount] of [["guardian", taskFunded ? 0n : 150000n], ["sponsor", 200000n]] as const) {
        const address = resources[role].address, previous = requiredByAddress[address]?.testUsdcRaw ?? "0", required = BigInt(previous) + amount;
        requiredByAddress[address] = { address, testUsdcRaw: String(required), availableTestUsdcRaw: resources[role].testUsdcRaw,
          sufficient: BigInt(resources[role].testUsdcRaw) >= required };
      }
      invariant((await provider.getBlock(block.number))?.hash === block.hash, "AUTONOMY_INSPECT_BLOCK_CHANGED");
      const ownerSlots = recorded ? database?.sponsoredOwners?.[recorded.owner] ?? 0 : undefined;
      return { checkedAt: new Date().toISOString(), readOnly: true, chainId: "10143", origin, stateExists: Boolean(recorded),
        nextTaskId: String(next), templateDeadlineMs: templateDeadline, templateExpired: typeof templateDeadline === "number" && templateDeadline <= Date.now(),
        fresh: Boolean(recorded?.fresh || options.fresh), block: { number: block.number, hash: block.hash },
        quota: { globalUsed: database?.sponsoredTotal, globalCap: 100, globalRemaining: database ? Math.max(0, 100 - database.sponsoredTotal) : undefined,
          ownerUsed: ownerSlots, ownerCap: 3, ownerRemaining: ownerSlots === undefined ? undefined : Math.max(0, 3 - ownerSlots),
          freshTwoGameCapacity: database ? database.sponsoredTotal + 2 <= 100 && (ownerSlots ?? 0) === 0 : false, noQuotaReset: true },
        resources, requiredByAddress, required: { newTaskRewardRaw: taskFunded ? "0" : "150000", twoGameSponsorRewardRaw: "200000", agentGasWei: selectedGas.amountWei, agentCashSeedRaw: "0", operatorTransactionGasAdditional: true },
        currentTemplateDeadlineMs: template?.deadlineMs, currentTemplateExpired: typeof template?.deadlineMs !== "number" || template.deadlineMs <= Date.now(),
        catalog, otherOpenTasks: catalog.filter(entry => entry.openAndUnassigned && entry.taskId !== recorded?.task?.taskId).map(entry => entry.taskId),
        task: recorded?.task && { ...recorded.task, status: String(task.status), assignedAgentId: String(task.agentId) },
        agentId: recorded?.agentId, parentRequestId: recorded?.parentId,
        recheckOf: recorded?.recheckOf && { parentRequestId: recorded.recheckOf.parentId, taskId: recorded.recheckOf.taskId, sameAgentRequired: true },
        bounds: { maxGames: 2, maxGameModelCalls: 2 * HOLDEM_LIVE_LIMITS.maxCalls, parentBudgetRaw: recorded?.recheckOf ? "10000" : "130000", perTaskBudgetRaw: "120000",
          winnerGuaranteed: false, replacementUuidAllowed: false, gameUsesOfficialKimi: true }, businessPosts: 0, chainWrites: 0 };
    }
    await store.start(options.recover || mode === "recover"); held = true;
    let state = await store.read();
    if (!state) {
      invariant(!["recover", "evidence", "replay"].includes(mode), "AUTONOMY_ORIGINAL_ACCEPTANCE_REQUIRED");
      if (options.recheckOf) {
        const directory = resolve(options.recheckOf), original = await optional<State>(join(directory, "session.json"));
        invariant(directory !== output && original?.runtime === runtime && original.origin === origin && original.bootstrap === bootstrapFile
          && original.agentId && original.task && original.parentSubmitted && !original.recheckOf, "AUTONOMY_ORIGINAL_FAILURE_REQUIRED");
        invariant((original.after as JsonObject)?.status === "Failed", "AUTONOMY_ORIGINAL_TERMINAL_FAILURE_REQUIRED");
        const owner = new Wallet((await readFile(join(directory, "owner.key"), "utf8")).trim());
        invariant(owner.address === original.owner, "AUTONOMY_ORIGINAL_OWNER_CHANGED");
        state = { version: 1, runtime, origin, bootstrap: bootstrapFile, owner: original.owner, agentId: original.agentId,
          createId: original.createId, parentId: randomUUID(), createdAt: new Date().toISOString(),
          recheckOf: { directory, parentId: original.parentId, agentId: original.agentId, taskId: original.task.taskId, owner: original.owner, sourceSessionDigest: sha256(original) } };
      } else {
        let ownerKey: string | undefined;
        try { ownerKey = (await readFile(join(output, "owner.key"), "utf8")).trim(); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const owner = ownerKey ? new Wallet(ownerKey) : Wallet.createRandom();
        if (!ownerKey) await writeFile(join(output, "owner.key"), owner.privateKey + "\n", { mode: 0o600, flag: "wx" });
        state = { version: 1, runtime, origin, bootstrap: bootstrapFile, owner: owner.address, createdAt: new Date().toISOString(), createId: randomUUID(), parentId: randomUUID() };
        if (options.fresh) state.fresh = { version: 1 };
      }
      await store.write(state);
    }
    const saved = state; invariant(saved.runtime === runtime && saved.origin === origin && saved.bootstrap === bootstrapFile, "AUTONOMY_ACCEPTANCE_BINDING_CHANGED");
    if (options.fresh) invariant(saved.fresh && !saved.recheckOf && !saved.seed, "AUTONOMY_FRESH_EXISTING_SESSION_FORBIDDEN");
    selectedGas = autonomyGasBinding({ fresh: Boolean(saved.fresh), requestedWei: options.gasWei, saved: saved.fresh?.gasFunding,
      intents: gasIntents, legacySigned: journal.has("fund-agent-gas-0.6"), currentSigned: journal.has("fund-agent-gas") });
    if (options.recheckOf) invariant(saved.recheckOf?.directory === resolve(options.recheckOf), "AUTONOMY_RECHECK_SOURCE_CHANGED");
    if (saved.recheckOf) {
      const original = await optional<State>(join(saved.recheckOf.directory, "session.json"));
      invariant(original && sha256(original) === saved.recheckOf.sourceSessionDigest, "AUTONOMY_ORIGINAL_FAILURE_EVIDENCE_CHANGED");
    }
    const save = () => store.write(saved);
    if (saved.fresh && (saved.fresh.gasFunding || options.gasWei !== undefined || gasIntents?.[selectedGas.journalId])) {
      saved.fresh.gasFunding = selectedGas; await save();
    }
    const sharedOperator = async (keyFile: string, action: (wallet: Wallet) => Promise<unknown>) => {
      const wallet = new Wallet((await readFile(keyFile, "utf8")).trim(), provider);
      const lock = new SessionStore<{ directory?: string; hash?: string }>(join(runtime, "wallets", "operator", wallet.address.toLowerCase()));
      await lock.start(Boolean(options.recover || mode === "recover"));
      try {
        const active = await lock.read(); invariant(!active?.directory || active.directory === output, "AUTONOMY_OPERATOR_RECOVERY_REQUIRED");
        await lock.write({ directory: output });
        const result = await action(wallet); await lock.write({}); return result;
      } finally { await lock.close(); }
    };
    const send = async (id: string, wallet: Wallet, request: TransactionRequest, gasCeiling: bigint) => {
      const intent = { from: wallet.address, to: request.to, data: request.data ?? "0x", value: String(request.value ?? 0) };
      const intentFile = join(output, "intents.json"), intents = await optional<JsonObject>(intentFile) ?? {};
      if (intents[id]) assert.deepEqual(intents[id], intent, "AUTONOMY_TRANSACTION_INTENT_CHANGED");
      else { intents[id] = intent; await atomicJson(intentFile, intents); }
      if (!journal.has(id)) {
        invariant(await provider.getTransactionCount(wallet.address, "latest") === await provider.getTransactionCount(wallet.address, "pending"), "AUTONOMY_PENDING_OPERATOR_TRANSACTION");
        const fee = await provider.getFeeData(), ceiling = BigInt(bootstrap.maxFeePerGas);
        invariant(fee.maxFeePerGas && fee.maxFeePerGas <= ceiling, "AUTONOMY_FEE_CEILING_EXCEEDED");
        const estimate = await provider.estimateGas({ ...request, from: wallet.address });
        const gasLimit = estimate === 21000n ? estimate : (estimate * 13n + 9n) / 10n;
        invariant(gasLimit <= gasCeiling, "AUTONOMY_GAS_CEILING_EXCEEDED");
        await journal.send(id, wallet, { ...request, gasLimit, maxFeePerGas: ceiling, maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 2000000000n });
      }
      const receipt = await journal.receipt(id); invariant((await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash, "AUTONOMY_NON_CANONICAL_TRANSACTION");
      return receipt;
    };
    if (mode === "prepare-task") {
      await sharedOperator(bootstrap.roleKeyFiles.guardian, async poster => {
        const token = new Contract(bootstrap.asset.address, ["function balanceOf(address) view returns(uint256)", "function approve(address,uint256) returns(bool)"], provider);
        if (!saved.task) {
          const block = await provider.getBlock("latest"); invariant(block, "MONAD_LATEST_BLOCK_REQUIRED");
          const taskId = String(await taskContract.nextTaskId());
          if (saved.recheckOf) invariant(BigInt(taskId) === BigInt(saved.recheckOf.taskId) + 1n, "AUTONOMY_RECHECK_TASK_ID_CHANGED");
          saved.task = { taskId, deadline: Math.max(block.timestamp, Math.floor(Date.now() / 1000)) + 86400,
            rewardRaw: "150000", problemId: "sum-integers", creditLimit: "80000", poster: poster.address, escrow: getAddress(bootstrap.contracts.escrow) };
          await save();
        }
        const task = saved.task;
        invariant(task.poster === poster.address && task.escrow === getAddress(bootstrap.contracts.escrow), "AUTONOMY_TASK_DOMAIN_CHANGED");
        if (!journal.has("create-task")) {
          invariant(await taskContract.nextTaskId() === BigInt(task.taskId), "AUTONOMY_TASK_ID_CHANGED");
          invariant(task.deadline * 1000 > Date.now() + 300000, "AUTONOMY_TASK_DEADLINE_EXPIRED");
          invariant(await token.balanceOf(poster.address) >= BigInt(task.rewardRaw), "AUTONOMY_REWARD_BALANCE_INSUFFICIENT");
          await send("approve-task", poster, await token.approve.populateTransaction(task.escrow, BigInt(task.rewardRaw)), 2000000n);
        }
        const receipt = await send("create-task", poster, await taskContract.createTask.populateTransaction(BigInt(task.rewardRaw), task.deadline), 2000000n);
        const events = receipt.logs.filter(log => getAddress(log.address) === task.escrow).flatMap(log => { try { const value = taskContract.interface.parseLog(log); return value?.name === "TaskCreated" ? [value] : []; } catch { return []; } });
        invariant(events.length === 1 && String(events[0].args.taskId) === task.taskId, "AUTONOMY_TASK_EVENT_MISMATCH");
        const chain = await taskContract.getTask(task.taskId);
        invariant(getAddress(chain.poster) === poster.address && chain.reward === 150000n && Number(chain.deadline) === task.deadline, "AUTONOMY_TASK_CHAIN_MISMATCH");
        await atomicJson(join(output, "additional.json"), [{ taskId: task.taskId, problemId: task.problemId, creditLimit: task.creditLimit, deadlineMs: task.deadline * 1000 }]);
        await atomicJson(join(output, "task-evidence.json"), { checkedAt: new Date().toISOString(), chainId: "10143", ...task,
          creation: { txHash: receipt.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, canonical: true }, catalogAppended: false });
      });
      return { taskPrepared: true, taskId: saved.task!.taskId, additionalFile: join(output, "additional.json"), catalogAppended: false };
    }
    invariant(ready, "MONAD_RUNTIME_READY_REQUIRED");
    const hosted = await optional<JsonObject>(ready.hostedConfigFile), taskConfig = await optional<JsonObject>(hosted?.executor.taskConfigFile);
    invariant(hosted && taskConfig && hosted.autonomy?.games?.maxGames === 2, "AUTONOMY_RUNTIME_CONFIG_REQUIRED");
    let cookie = "";
    const api = async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${origin}/api/hosted${path}`, { method, redirect: "error", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      const value = await response.json() as JsonObject;
      if (!response.ok) throw new Error(typeof value.error === "string" && /^HOSTED_[A-Z0-9_]+$/.test(value.error) ? value.error : `AUTONOMY_HTTP_${response.status}`);
      if (path === "/auth/login") { cookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""; invariant(cookie, "AUTONOMY_COOKIE_REQUIRED"); }
      return value;
    };
    const owner = new Wallet((await readFile(join(saved.recheckOf?.directory ?? output, "owner.key"), "utf8")).trim()); invariant(owner.address === saved.owner, "AUTONOMY_OWNER_CHANGED");
    const challenge = await api("/auth/challenge", "POST", { wallet: owner.address });
    invariant(challenge.message.startsWith(`AgentFuel hosted agent login\nOrigin: ${origin}\nWallet: ${owner.address}\nChain: 10143\nNonce: `)
      && challenge.message.endsWith("This signature authenticates your platform account. It authorizes no blockchain transaction."), "AUTONOMY_AUTH_DOMAIN_CHANGED");
    await api("/auth/login", "POST", { challengeId: challenge.id, signature: await owner.signMessage(challenge.message) });
    const wait = async (requestId: string) => {
      const until = Date.now() + 1260000;
      while (Date.now() < until) {
        const snapshot = await api("/agents"), run = snapshot.runs.find((entry: JsonObject) => entry.requestId === requestId);
        if (run && !["Queued", "Running"].includes(run.status)) return run as JsonObject;
        await new Promise(done => setTimeout(done, 3000));
      }
      throw new Error("AUTONOMY_WAIT_TIMEOUT_INSPECT_ORIGINAL_UUID");
    };
    let snapshot = await api("/agents");
    let agent = snapshot.agents.find((entry: JsonObject) => entry.id === saved.agentId);
    if (saved.fresh && !saved.fresh.ownerAdmission && !["evidence", "replay"].includes(mode)) {
      const database = await optional<JsonObject>(join(runtime, "hosted", "database", "session.json")); invariant(database, "AUTONOMY_DATABASE_REQUIRED");
      const admission = { ownerAgents: snapshot.agents.length, sponsoredOwnerSlots: database.sponsoredOwners?.[owner.address] ?? 0, sponsoredTotal: database.sponsoredTotal };
      assertFreshAutonomyOwner(admission);
      saved.fresh.ownerAdmission = { ...admission, checkedAt: new Date().toISOString() }; await save();
    }
    if (saved.recheckOf) invariant(agent && agent.id === saved.recheckOf.agentId, "AUTONOMY_RECHECK_ORIGINAL_AGENT_REQUIRED");
    if (!agent && !["evidence", "replay"].includes(mode)) {
      const originalCreation = snapshot.runs.find((entry: JsonObject) => entry.requestId === saved.createId);
      agent = originalCreation ? snapshot.agents.find((entry: JsonObject) => entry.id === originalCreation.agentId)
        : await api("/agents", "POST", { requestId: saved.createId, name: "Monad automatic competition acceptance", modelId: "kimi-k2.6", strategy: "balanced",
          perRunBudgetRaw: "120000", totalBudgetRaw: "130000", allowCredit: true });
      invariant(agent, "AUTONOMY_ORIGINAL_AGENT_REQUIRED"); saved.agentId = agent.id; await save();
      const creation = await wait(saved.createId);
      invariant(["Succeeded", "Paused"].includes(creation.status), "AUTONOMY_PROVISION_NOT_RECOVERABLE");
    }
    invariant(agent && agent.owner.toLowerCase() === owner.address.toLowerCase(), "AUTONOMY_AGENT_OWNER_CHANGED");
    if (saved.recheckOf) invariant(agent.binding?.chainId === "10143", "AUTONOMY_RECHECK_ORIGINAL_IDENTITY_REQUIRED");
    if (!["evidence", "replay"].includes(mode) && !agent.binding) {
      const original = (await api("/agents")).runs.find((entry: JsonObject) => entry.requestId === saved.createId);
      invariant(original?.status === "Paused" && original.reason === "HOSTED_WALLET_GAS_REQUIRED", "AUTONOMY_INSPECT_ORIGINAL_PROVISION");
      if (!saved.gasTarget) { saved.gasTarget = getAddress(agent.wallet); await save(); }
      invariant(saved.gasTarget === getAddress(agent.wallet), "AUTONOMY_GAS_TARGET_CHANGED");
      if (saved.fresh) { saved.fresh.gasFunding ??= selectedGas; await save(); }
      await sharedOperator(options.gasSourceKeyFile ?? bootstrap.roleKeyFiles.guardian, async wallet => {
        await send(selectedGas.journalId, wallet, { to: saved.gasTarget, value: BigInt(selectedGas.amountWei) }, 21000n);
      });
      await api(`/agents/${agent.id}/runs`, "POST", { action: "provision", requestId: saved.createId });
      invariant((await wait(saved.createId)).status === "Succeeded", "AUTONOMY_PROVISION_INCOMPLETE");
      snapshot = await api("/agents"); agent = snapshot.agents.find((entry: JsonObject) => entry.id === saved.agentId);
    }
    invariant(agent?.binding?.chainId === "10143", "AUTONOMY_AGENT_CHAIN_REQUIRED");
    if (saved.recheckOf && !["evidence", "replay"].includes(mode) && !saved.seed?.preparedAt) {
      const oldRun = snapshot.runs.find((entry: JsonObject) => entry.requestId === saved.recheckOf!.parentId);
      invariant(oldRun?.status === "Failed" && oldRun.agentId === agent.id && agent.spentRaw === "130000", "AUTONOMY_RECHECK_ORIGINAL_FAILURE_CHANGED");
      invariant((!agent.activeRequestId || agent.activeRequestId === saved.seed?.depositId) && agent.status === "Ready", "AUTONOMY_RECHECK_AGENT_BUSY");
      const selectSettings = (value: JsonObject) => Object.fromEntries(["name", "modelId", "strategy", "perRunBudgetRaw", "totalBudgetRaw", "allowCredit"].map(key => [key, value[key]]));
      if (!saved.settingsChange) {
        saved.settingsChange = { before: selectSettings(agent), after: { ...selectSettings(agent), modelId: "kimi-k2.6", perRunBudgetRaw: "120000", totalBudgetRaw: "140000", allowCredit: false } };
        const finance = await api(`/agents/${agent.id}/finance`);
        invariant(finance.status === "confirmed" && finance.cashRaw === "0" && finance.debtRaw === "0" && finance.counts.defaults === "1", "AUTONOMY_RECHECK_ORIGINAL_FINANCE_CHANGED");
        saved.seed = { amountRaw: "10000", depositId: randomUUID(), financeBefore: finance }; await save();
      }
      invariant(saved.seed, "AUTONOMY_RECHECK_SEED_JOURNAL_REQUIRED");
      const current = selectSettings(agent);
      if (sha256(current) === sha256(saved.settingsChange.before)) agent = await api(`/agents/${agent.id}`, "PATCH", saved.settingsChange.after);
      else invariant(sha256(current) === sha256(saved.settingsChange.after), "AUTONOMY_RECHECK_SETTINGS_CHANGED");
      saved.settingsChange.appliedAt ??= new Date().toISOString(); await save();
      invariant(agent.spentRaw === "130000" && agent.totalBudgetRaw === "140000" && agent.allowCredit === false, "AUTONOMY_RECHECK_CUMULATIVE_BUDGET_CHANGED");
      // The infra-caused liquidation legitimately froze this identity. Use the
      // contract's guardian-only operational remedy; never rewrite its default
      // counter, old loan, reputation, original request or signed paid calls.
      await sharedOperator(bootstrap.roleKeyFiles.guardian, async guardian => {
        const managerAddress = getAddress(bootstrap.contracts.manager), accountAddress = getAddress(bootstrap.contracts.account);
        const current = await readRecheckFreezeSnapshot(provider, managerAddress, accountAddress, agent.binding.agentId, saved.recheckOf!.taskId);
        invariant(current.guardian === guardian.address && current.loan.agentId === agent.binding.agentId, "AUTONOMY_RECHECK_UNFREEZE_GUARDIAN_MISMATCH");
        if (!saved.freezeRemedy) {
          invariant(current.managerFrozen && current.accountFrozen && current.defaultsRaw === "1" && current.loan.status === "3"
            && current.loan.principal === "0" && current.loan.fee === "0", "AUTONOMY_RECHECK_ORIGINAL_FREEZE_REQUIRED");
          saved.freezeRemedy = { guardian: guardian.address, manager: managerAddress, account: accountAddress, agentId: agent.binding.agentId,
            taskId: saved.recheckOf!.taskId, before: current }; await save();
        }
        const remedy = saved.freezeRemedy;
        invariant(remedy.guardian === guardian.address && remedy.manager === managerAddress && remedy.account === accountAddress
          && remedy.agentId === agent.binding.agentId && remedy.taskId === saved.recheckOf!.taskId, "AUTONOMY_RECHECK_UNFREEZE_DOMAIN_CHANGED");
        invariant(current.defaultsRaw === "1" && current.loanDigest === remedy.before.loanDigest, "AUTONOMY_RECHECK_UNFREEZE_HISTORY_CHANGED");
        invariant(journal.has("unfreeze-original-agent-after-infra-default") || current.managerFrozen && current.accountFrozen,
          "AUTONOMY_RECHECK_UNFREEZE_ORIGINAL_JOURNAL_REQUIRED");
        const manager = new Contract(managerAddress, RECHECK_MANAGER_ABI, provider);
        const receipt = await send("unfreeze-original-agent-after-infra-default", guardian, await manager.unfreezeAgent.populateTransaction(agent.binding.agentId), 400000n);
        const events = receipt.logs.filter(log => getAddress(log.address) === managerAddress).flatMap(log => {
          try { const parsed = manager.interface.parseLog(log); return parsed?.name === "AgentUnfrozen" ? [parsed] : []; } catch { return []; }
        });
        invariant(events.length === 1 && String(events[0].args.agentId) === agent.binding.agentId
          && getAddress(events[0].args.by) === guardian.address, "AUTONOMY_RECHECK_UNFREEZE_EVENT_MISMATCH");
        const after = await readRecheckFreezeSnapshot(provider, managerAddress, accountAddress, agent.binding.agentId, saved.recheckOf!.taskId);
        assertRecheckUnfreezePreservesHistory(remedy.before, after);
        remedy.transaction = { txHash: receipt.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, canonical: true, event: "AgentUnfrozen", by: guardian.address };
        remedy.after = after; remedy.completedAt ??= new Date().toISOString(); await save();
      });
      await sharedOperator(bootstrap.roleKeyFiles.guardian, async wallet => {
        const token = new Contract(bootstrap.asset.address, ["function transfer(address,uint256) returns(bool)", "event Transfer(address indexed from,address indexed to,uint256 value)"], provider);
        const receipt = await send("seed-token-route-cash-10000", wallet, await token.transfer.populateTransaction(agent.wallet, 10000n), 2000000n);
        const transfer = receipt.logs.filter(log => getAddress(log.address) === getAddress(bootstrap.asset.address)).flatMap(log => {
          try { const parsed = token.interface.parseLog(log); return parsed?.name === "Transfer" ? [parsed] : []; } catch { return []; }
        });
        invariant(transfer.some(event => getAddress(event.args.from) === wallet.address && getAddress(event.args.to) === getAddress(agent.wallet) && event.args.value === 10000n), "AUTONOMY_RECHECK_SEED_TRANSFER_MISMATCH");
        saved.seed!.transfer = { txHash: receipt.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, canonical: true }; await save();
      });
      let deposit = (await api("/agents")).runs.find((entry: JsonObject) => entry.requestId === saved.seed!.depositId);
      if (!deposit || mode === "recover" && deposit.status === "Paused") await api(`/agents/${agent.id}/runs`, "POST", { action: "deposit", requestId: saved.seed.depositId, amountRaw: saved.seed.amountRaw });
      deposit = deposit && !["Queued", "Running"].includes(deposit.status) && mode !== "recover" ? deposit : await wait(saved.seed.depositId);
      invariant(deposit.status === "Succeeded", "AUTONOMY_RECHECK_INSPECT_ORIGINAL_DEPOSIT");
      const finance = await api(`/agents/${agent.id}/finance`);
      invariant(finance.status === "confirmed" && finance.cashRaw === "10000" && finance.debtRaw === "0" && finance.counts.defaults === "1", "AUTONOMY_RECHECK_SEED_FINANCE_CHANGED");
      saved.seed.deposit = publicRun(deposit); saved.seed.preparedAt = new Date().toISOString(); await save();
      snapshot = await api("/agents"); agent = snapshot.agents.find((entry: JsonObject) => entry.id === saved.agentId);
    }
    if (mode === "prepare-agent") return { agentPrepared: true, hostedAgentId: agent.id, agentId: agent.binding.agentId, wallet: agent.wallet,
      createRequestId: saved.createId, parentRequestId: saved.parentId, recheck: Boolean(saved.recheckOf), settingsChange: saved.settingsChange,
      freezeRemedy: saved.freezeRemedy, gasFunding: saved.fresh?.gasFunding, seedCashRaw: saved.seed?.amountRaw, depositRequestId: saved.seed?.depositId, paidModelsStarted: 0 };
    let parent = (await api("/agents")).runs.find((entry: JsonObject) => entry.requestId === saved.parentId);
    if (!["evidence", "replay"].includes(mode)) {
      if (!parent) {
        invariant(!agent.activeRequestId && agent.status === "Ready", "AUTONOMY_AGENT_BUSY");
        const template = taskConfig.models.find((model: JsonObject) => model.id === agent.modelId).templates[agent.strategy];
        invariant(template.deadlineMs > Date.now() + 300000, "AUTONOMY_NEW_TEMPLATE_DEADLINE_EXPIRED");
        invariant(saved.task && template.tasks.some((task: JsonObject) => task.taskId === saved.task!.taskId), "AUTONOMY_NEW_TASK_NOT_APPENDED");
        const open = await taskContract.getTask(saved.task.taskId); invariant(open.status === 1n && open.agentId === 0n, "AUTONOMY_NEW_TASK_NOT_OPEN");
        const finance = await api(`/agents/${agent.id}/finance`);
        invariant(finance.status === "confirmed" && finance.cashRaw === (saved.recheckOf ? "10000" : "0") && finance.debtRaw === "0", "AUTONOMY_CASH_BASELINE_REQUIRED");
        if (saved.recheckOf) invariant(saved.seed?.preparedAt && agent.spentRaw === "130000" && agent.totalBudgetRaw === "140000"
          && agent.allowCredit === false && finance.counts.defaults === "1", "AUTONOMY_RECHECK_BASELINE_CHANGED");
        const credits = await optional<JsonObject>(join(runtime, "credits", agent.id, "session.json"));
        invariant(!credits || !credits.grants?.length && !credits.redemptions?.length, "AUTONOMY_ZERO_TOKEN_BASELINE_REQUIRED");
        const database = await optional<JsonObject>(join(runtime, "hosted", "database", "session.json"));
        if (saved.fresh) {
          invariant(database && saved.fresh.ownerAdmission, "AUTONOMY_FRESH_OWNER_ADMISSION_REQUIRED");
          const openTaskIds: string[] = [];
          for (const entry of template.tasks) {
            const value = await taskContract.getTask(entry.taskId);
            if (value.status === 1n && value.agentId === 0n && Number(value.deadline) * 1000 > Date.now()) openTaskIds.push(String(entry.taskId));
          }
          const protocol = await readRecheckFreezeSnapshot(provider, bootstrap.contracts.manager, bootstrap.contracts.account, agent.binding.agentId, saved.task.taskId);
          assertFreshAutonomyBaseline({ agent, finance, protocol, sponsoredOwnerSlots: database.sponsoredOwners?.[agent.owner] ?? 0,
            sponsoredTotal: database.sponsoredTotal, openTaskIds, taskId: saved.task.taskId, seedPresent: Boolean(saved.seed), recheckPresent: Boolean(saved.recheckOf || saved.freezeRemedy) });
          invariant(hosted.autonomy.plannerPriceRaw === "10000" && hosted.autonomy.games.maxSpendPerGameRaw === "0"
            && hosted.autonomy.games.maxGames === 2, "AUTONOMY_FRESH_RUNTIME_BOUNDS_CHANGED");
          saved.fresh.protocolBefore = protocol;
        }
        saved.before ??= { finance, rewardTokens: 0, sponsoredOwnerSlots: database?.sponsoredOwners?.[agent.owner] ?? 0, sponsoredTotal: database?.sponsoredTotal ?? 0,
          settings: { perRunBudgetRaw: agent.perRunBudgetRaw, totalBudgetRaw: agent.totalBudgetRaw, spentRaw: agent.spentRaw, allowCredit: agent.allowCredit },
          configuration: { ...hosted.autonomy, plannerRelayUrl: undefined }, walletNonce: await provider.getTransactionCount(agent.wallet) }; await save();
        saved.parentSubmitted = true; await save(); // Persist original UUID before the business POST.
        await api(`/agents/${agent.id}/runs`, "POST", { action: "autonomous", requestId: saved.parentId });
      } else if (mode === "recover" && parent.status === "Paused") {
        // Explicit operator recovery is always the same parent and original child.
        await api(`/agents/${agent.id}/runs`, "POST", { action: "autonomous", requestId: saved.parentId });
      }
      parent = parent && !["Queued", "Running"].includes(parent.status) && mode !== "recover" ? parent : await wait(saved.parentId);
    }
    invariant(parent, "AUTONOMY_ORIGINAL_PARENT_REQUIRED");
    if (mode === "replay") {
      snapshot = await api("/agents"); agent = snapshot.agents.find((entry: JsonObject) => entry.id === saved.agentId);
      invariant(parent.status === "Succeeded" && parent.result?.success === true && !agent.activeRequestId, "AUTONOMY_REPLAY_SUCCESS_REQUIRED");
      const counters = async () => {
        const addresses = new Map<string, string>([["agent", agent.wallet]]);
        for (const role of ["guardian", "underwriter", "verifier", "sponsor", "opponent"]) {
          const wallet = new Wallet((await readFile(bootstrap.roleKeyFiles[role], "utf8")).trim()); addresses.set(role, wallet.address);
        }
        const nonceEntries = [];
        for (const [role, address] of addresses) nonceEntries.push([role, { address, nonce: await provider.getTransactionCount(address, "latest") }]);
        const health = await fetch("http://127.0.0.1:3427/health", { signal: AbortSignal.timeout(10000) }); invariant(health.ok, "AUTONOMY_GATEWAY_HEALTH_REQUIRED");
        const gateway = await health.json() as JsonObject; invariant(Number.isSafeInteger(gateway.acceptedRequests), "AUTONOMY_GATEWAY_COUNTER_REQUIRED");
        const base = join(runtime, "hosted", "agents", agent.id, "runs", saved.parentId);
        const host = await optional<JsonObject>(join(base, "autonomy-host", "session.json"));
        let gameVendorAttempts = 0, gameChildren = 0;
        for (const child of Object.values(host?.children ?? {}) as JsonObject[]) if (child.run.action === "game") {
          gameChildren++; const hand = await optional<JsonObject>(join(child.directory, "game", "session.json")); gameVendorAttempts += hand?.turns?.length ?? 0;
        }
        const ledger = await optional<JsonObject>(join(runtime, "credits", agent.id, "session.json"));
        const database = await optional<JsonObject>(join(runtime, "hosted", "database", "session.json"));
        return { nonces: Object.fromEntries(nonceEntries), magpieAcceptedRequests: gateway.acceptedRequests, gameVendorAttempts, gameChildren,
          creditsRedemptions: ledger?.redemptions?.length ?? 0, rewardGrants: ledger?.grants?.length ?? 0,
          sponsoredOwnerSlots: database?.sponsoredOwners?.[agent.owner], sponsoredTotal: database?.sponsoredTotal };
      };
      saved.replay ??= { before: await counters(), parent: publicRun(parent)! }; await save();
      await api(`/agents/${agent.id}/runs`, "POST", { action: "autonomous", requestId: saved.parentId });
      const after = await api("/agents"), repeated = after.runs.find((entry: JsonObject) => entry.requestId === saved.parentId);
      invariant(!after.agents.find((entry: JsonObject) => entry.id === saved.agentId)?.activeRequestId, "AUTONOMY_REPLAY_CREATED_ACTIVE_REQUEST");
      assert.deepEqual(publicRun(repeated), saved.replay.parent, "AUTONOMY_REPLAY_CHANGED_TERMINAL_PARENT");
      saved.replay.after = await counters(); assert.deepEqual(saved.replay.after, saved.replay.before, "AUTONOMY_REPLAY_CREATED_EFFECTS");
      saved.replay.verifiedAt = new Date().toISOString(); await save();
    }
    snapshot = await api("/agents"); agent = snapshot.agents.find((entry: JsonObject) => entry.id === saved.agentId);
    parent = snapshot.runs.find((entry: JsonObject) => entry.requestId === saved.parentId);
    const report = await collectAutonomyEvidence({ runtime, output, state: saved, agent, parent, provider, finance: await api(`/agents/${agent.id}/finance`) });
    saved.after = publicRun(parent); await save(); await atomicJson(join(output, "evidence.json"), report);
    return report;
  } finally { if (held) await store.close(); connection.close(); }
}

/** Only bounded public summaries/hashes/usage leave private request directories. */
export async function collectAutonomyEvidence(input: { runtime: string; output: string; state: State; agent: JsonObject; parent: JsonObject; provider: JsonRpcProvider; finance: JsonObject }) {
  const { runtime, state, agent, parent, provider, finance } = input;
  const parentDirectory = join(runtime, "hosted", "agents", agent.id, "runs", state.parentId);
  const host = await optional<JsonObject>(join(parentDirectory, "autonomy-host", "session.json"));
  const loop = await optional<JsonObject>(join(parentDirectory, "autonomy-loop", "session.json"));
  const hashes = new Set<string>(), games: JsonObject[] = [], tasks: JsonObject[] = [], planner: JsonObject[] = [], unfinishedChildren: string[] = [];
  if (state.freezeRemedy?.transaction?.txHash) hashes.add(state.freezeRemedy.transaction.txHash);
  for (const child of Object.values(host?.children ?? {}) as JsonObject[]) {
    invariant(resolve(child.directory) === join(parentDirectory, "children", child.run.requestId), "AUTONOMY_CHILD_DIRECTORY_CHANGED");
    if (child.run.action === "game") {
      const hand = await optional<LiveHandSession>(join(child.directory, "game", "session.json"));
      const outcome = await optional<JsonObject>(join(child.directory, "session.json"));
      if (!outcome?.result?.terminal) unfinishedChildren.push(child.run.requestId);
      const payment = await optional<JsonObject>(join(child.directory, "reward-transactions.json"));
      for (const entry of Object.values(payment ?? {}) as JsonObject[]) if (typeof entry.txHash === "string") hashes.add(entry.txHash);
      games.push({ requestId: child.run.requestId, fundingFor: child.run.fundingFor, rewardKind: child.run.rewardKind,
        reservedRaw: child.run.reservedRaw, allowCredit: child.agent.allowCredit,
        result: outcome?.result && { phase: outcome.result.phase, success: outcome.result.success, terminal: outcome.result.terminal,
          matchId: outcome.result.matchId, rewardRaw: outcome.result.rewardRaw, creditsGranted: outcome.result.creditsGranted, txHash: outcome.result.txHash },
        hand: hand && publicLiveHand(hand), physicalAttempts: hand?.turns.map(turn => ({ turn: turn.turn, seat: turn.seat, requestedModel: turn.request.model,
          outcome: turn.outcome, requestDigest: turn.requestDigest, response: responseSummary(turn.response?.rawText) })) });
    } else {
      const taskState = await optional<JsonObject>(join(child.directory, "task-executor", "session.json"));
      const workflow = await optional<JsonObject>(join(child.directory, "task-executor", "workflow", "session.json"));
      const solver = workflow?.rewardChild?.solve;
      const ledger = await optional<JsonObject>(join(child.directory, "task-executor", "workflow", "metered", "inference-ledger", "session.json"));
      const result = taskState?.result;
      if (!result?.terminal) unfinishedChildren.push(child.run.requestId);
      for (const hash of [result?.acceptTxHash, result?.paymentTxHash, result?.txHash, result?.settlement?.txHash]) if (typeof hash === "string") hashes.add(hash);
      tasks.push({ requestId: child.run.requestId, action: child.run.action, result: result && { phase: result.phase, terminal: result.terminal,
        success: result.success, reason: result.reason, taskId: result.taskId, chargedRaw: result.chargedRaw, fromCashRaw: result.fromCashRaw,
        fromCreditRaw: result.fromCreditRaw, creditsUsed: result.creditsUsed, acceptTxHash: result.acceptTxHash, paymentId: result.paymentId,
        paymentTxHash: result.paymentTxHash, settlement: result.settlement }, snapshotDigest: taskState && sha256(taskState),
        rounds: (solver?.rounds ?? []).map((round: JsonObject) => ({ tier: round.tier, model: round.model, state: round.state,
          responseDigest: round.response && sha256(round.response), usage: round.response?.usage })),
        meteredInferences: (ledger?.invocations ?? []).map((entry: JsonObject) => ({ id: entry.id, state: entry.state, requestDigest: entry.requestDigest,
          modelId: entry.modelId, selectedPhysicalModel: ledger?.catalog?.find((model: JsonObject) => model.id === entry.modelId)?.model,
          physicalResponseModel: entry.result?.response?.model, usage: entry.result?.usage, chargedCredits: entry.result?.chargedCredits,
          responseDigest: entry.result?.response && sha256(entry.result.response) })) });
    }
  }
  for (const step of loop?.steps ?? []) {
    if (BigInt(step.decisionChargedRaw ?? "0") <= 0n) continue;
    const plan = await optional<JsonObject>(join(parentDirectory, "planner", step.decisionId, "session.json"));
    const receipt = plan?.inference?.receipt; if (receipt?.txHash) hashes.add(receipt.txHash);
    planner.push({ decisionId: step.decisionId, chargedRaw: step.decisionChargedRaw, paymentId: receipt?.paymentId, txHash: receipt?.txHash,
      physicalModel: receipt?.model, physicalResponseModel: plan?.inference?.result?.model, usage: plan?.inference?.result?.usage,
      resultDigest: plan?.inference?.result && sha256(plan.inference.result) });
  }
  const receipts = [];
  for (const hash of hashes) {
    invariant(/^0x[0-9a-f]{64}$/i.test(hash), "AUTONOMY_PUBLIC_HASH_INVALID");
    const receipt = await provider.getTransactionReceipt(hash); invariant(receipt && receipt.status === 1, "AUTONOMY_RECEIPT_UNCONFIRMED");
    const block = await provider.getBlock(receipt.blockNumber); invariant(block?.hash === receipt.blockHash, "AUTONOMY_RECEIPT_NOT_CANONICAL");
    receipts.push({ txHash: hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: receipt.status, canonical: true });
  }
  const creditLedger = await optional<JsonObject>(join(runtime, "credits", agent.id, "session.json"));
  const hostedDatabase = await optional<JsonObject>(join(runtime, "hosted", "database", "session.json"));
  const childIds = tasks.map(task => task.requestId);
  const redemptions = (creditLedger?.redemptions ?? []).filter((entry: JsonObject) => childIds.some(id => entry.redemptionId.startsWith(`${id}:round:`)))
    .map((entry: JsonObject) => ({ redemptionId: entry.redemptionId, status: entry.status, requestDigest: entry.requestDigest,
      model: entry.model, response: responseSummary(entry.response?.rawText), chargedTokens: entry.chargedTokens, usage: entry.usage, error: entry.error }));
  const rewardGrants = (creditLedger?.grants ?? []).filter((entry: JsonObject) => games.some(game => game.requestId === entry.grantId))
    .map((entry: JsonObject) => ({ grantId: entry.grantId, matchId: entry.matchId, replayDigest: entry.replayDigest, winners: entry.winners, allocations: entry.allocations }));
  const settled = tasks.filter(task => task.result?.success && task.result.settlement?.passed);
  const arena = await optional<JsonObject>(join(runtime, "arena-http-journal.json"));
  const independent = [];
  for (const task of settled) {
    invariant(state.task && task.result!.taskId === state.task.taskId, "AUTONOMY_UNEXPECTED_TASK_EXECUTED");
    invariant(receipts.some(receipt => receipt.txHash === task.result!.settlement.txHash), "AUTONOMY_SETTLEMENT_RECEIPT_REQUIRED");
    const escrow = new Contract(state.task.escrow, ESCROW_ABI, provider);
    const receipt = await provider.getTransactionReceipt(task.result!.settlement.txHash);
    const events = receipt!.logs.filter(log => getAddress(log.address) === getAddress(state.task!.escrow)).flatMap(log => {
      try { const parsed = escrow.interface.parseLog(log); return parsed?.name === "TaskSettled" ? [parsed] : []; } catch { return []; }
    });
    invariant(events.length === 1 && String(events[0].args.taskId) === task.result!.taskId && events[0].args.passed === true, "AUTONOMY_SETTLEMENT_EVENT_MISMATCH");
    const chain = await escrow.getTask(task.result!.taskId);
    invariant(chain.status === 3n && String(chain.agentId) === agent.binding.agentId && chain.escrowBalance === 0n, "AUTONOMY_SETTLED_TASK_CHAIN_MISMATCH");
    const checked = arena?.runs.find((run: JsonObject) => run.taskId === task.result!.taskId && run.status === "settled" && run.result?.settlement?.txHash === task.result!.settlement.txHash);
    invariant(checked?.result?.verdict?.mode === "docker" && checked.result.verdict.passed === true
      && checked.result.tests.length > 0 && checked.result.tests.every((test: JsonObject) => test.passed === true), "AUTONOMY_INDEPENDENT_DOCKER_VERDICT_REQUIRED");
    independent.push({ runId: checked.runId, taskId: checked.taskId, mode: checked.result.verdict.mode,
      evidenceHash: checked.result.verdict.evidenceHash, passed: true, tests: checked.result.tests.map((test: JsonObject) => ({ case: test.case, passed: test.passed })),
      settlement: { txHash: receipt!.hash, verifier: await escrow.verifier(), event: { repaidRaw: String(events[0].args.repaid), slashedRaw: String(events[0].args.slashed), residualRaw: String(events[0].args.agentResidual) } } });
  }
  const baseComplete = games.some(game => game.result?.success && (BigInt(game.result.rewardRaw ?? "0") > 0n || game.result.creditsGranted > 0))
    && settled.length > 0 && finance.status === "confirmed" && finance.debtRaw === "0";
  let recheck: JsonObject | undefined;
  if (state.recheckOf) {
    const original = await optional<State>(join(state.recheckOf.directory, "session.json"));
    invariant(original && sha256(original) === state.recheckOf.sourceSessionDigest && (original.after as JsonObject)?.status === "Failed"
      && original.agentId === agent.id && original.parentId !== state.parentId, "AUTONOMY_ORIGINAL_FAILURE_EVIDENCE_CHANGED");
    const chargedTokens = redemptions.reduce((total: number, entry: JsonObject) => total + (entry.status === "Completed" ? entry.chargedTokens ?? 0 : 0), 0);
    const wonOriginalGameTokens = games.some(game => game.rewardKind === "llm-credits" && game.result?.creditsGranted > 0
      && rewardGrants.some((grant: JsonObject) => grant.grantId === game.requestId && grant.allocations[0] === game.result.creditsGranted));
    const physicalUsageVerified = redemptions.some((entry: JsonObject) => entry.status === "Completed" && entry.model === "kimi-k2.6"
      && entry.response?.model === "kimi-k2.6" && entry.usage?.total_tokens === entry.chargedTokens && entry.chargedTokens > 0);
    let unfreezeAuditVerified = false;
    if (state.freezeRemedy) {
      const remedy = state.freezeRemedy;
      invariant(remedy.completedAt && remedy.transaction && remedy.after, "AUTONOMY_RECHECK_UNFREEZE_AUDIT_INCOMPLETE");
      assertRecheckUnfreezePreservesHistory(remedy.before, remedy.after);
      for (const snapshot of [remedy.before, remedy.after]) invariant((await provider.getBlock(snapshot.block.number))?.hash === snapshot.block.hash,
        "AUTONOMY_RECHECK_FREEZE_BLOCK_CHANGED");
      const current = await readRecheckFreezeSnapshot(provider, remedy.manager, remedy.account, agent.binding.agentId, remedy.taskId);
      assertRecheckUnfreezePreservesHistory(remedy.before, current);
      const manager = new Contract(remedy.manager, RECHECK_MANAGER_ABI, provider), receipt = await provider.getTransactionReceipt(remedy.transaction.txHash);
      const events = receipt!.logs.filter(log => getAddress(log.address) === getAddress(remedy.manager)).flatMap(log => {
        try { const parsed = manager.interface.parseLog(log); return parsed?.name === "AgentUnfrozen" ? [parsed] : []; } catch { return []; }
      });
      invariant(events.length === 1 && String(events[0].args.agentId) === agent.binding.agentId
        && getAddress(events[0].args.by) === remedy.guardian, "AUTONOMY_RECHECK_UNFREEZE_EVENT_MISMATCH");
      unfreezeAuditVerified = true;
    }
    const rewardTaskPassed = settled.some(task => task.action === "reward-task" && task.result?.taskId === state.task?.taskId
      && task.result.settlement.loanStatus === "0" && task.result.settlement.repaidRaw === "0" && task.result.settlement.slashedRaw === "0" && task.result.settlement.residualRaw === "150000");
    recheck = { originalParentRequestId: original.parentId, originalTaskId: original.task?.taskId, originalAgentId: original.agentId,
      originalFailurePreserved: true, sourceSessionDigest: state.recheckOf.sourceSessionDigest, newParentRequestId: state.parentId,
      settingsChange: state.settingsChange, seed: state.seed && { amountRaw: state.seed.amountRaw, depositRequestId: state.seed.depositId,
        transfer: state.seed.transfer, deposit: state.seed.deposit },
      fixture: "Same Agent; explicit cumulative budget increase and 10000 test USDC seed selects token replenishment; original spent/default/quota retained",
      originalSpentRaw: "130000", cumulativeTotalBudgetRaw: "140000", newParentSpendCeilingRaw: "10000", additionalBorrowingAllowed: false,
      originalDefaults: state.seed?.financeBefore?.counts?.defaults, observedDefaults: finance.counts?.defaults,
      originalDefaultPreserved: state.seed?.financeBefore?.counts?.defaults === "1" && finance.counts?.defaults === "1",
      actualRewardTokensUsed: chargedTokens, rewardTaskPassed, noPaidPlanner: planner.length === 0,
      wonOriginalGameTokens, physicalUsageVerified, currentSpentRaw: agent.spentRaw,
      parentTerminalSuccess: parent.status === "Succeeded" && parent.result?.success === true && !agent.activeRequestId && unfinishedChildren.length === 0 && !loop?.pendingTaskChildId,
      terminalReplayVerified: Boolean(state.replay?.verifiedAt),
      freezeRemedy: state.freezeRemedy, unfreezeAuditVerified,
      sameAgentRewardLoopAccepted: baseComplete && rewardTaskPassed && chargedTokens > 0 && planner.length === 0 && wonOriginalGameTokens && physicalUsageVerified
        && agent.spentRaw === "130000" && finance.counts?.defaults === "1" && state.seed?.financeBefore?.counts?.defaults === "1"
        && parent.status === "Succeeded" && parent.result?.success === true && !agent.activeRequestId && unfinishedChildren.length === 0 && !loop?.pendingTaskChildId };
  }
  let fresh: JsonObject | undefined;
  if (state.fresh) {
    const usagePresent = (usage: JsonObject | undefined) => Boolean(usage && (
      Number.isSafeInteger(usage.total_tokens) && usage.total_tokens > 0
      || Number.isSafeInteger(usage.promptTokens) && Number.isSafeInteger(usage.completionTokens) && usage.promptTokens + usage.completionTokens > 0));
    const physicalGameUsageVerified = games.length > 0 && games.length <= 2 && games.every(game => game.result?.terminal && game.rewardKind === "usdc"
      && game.hand?.phase === "Complete" && game.physicalAttempts?.length > 0 && game.physicalAttempts.length <= HOLDEM_LIVE_LIMITS.maxCalls
      && BigInt(game.result.rewardRaw ?? "0") === (game.hand.result?.winners.includes(0) ? 100000n / BigInt(game.hand.result.winners.length) : 0n)
      && game.physicalAttempts.every((attempt: JsonObject) => attempt.outcome === "Applied" && attempt.requestedModel === "kimi-k2.6"
        && attempt.response?.model === "kimi-k2.6" && usagePresent(attempt.response?.usage) && attempt.response.responseDigest));
    const physicalPlannerUsageVerified = planner.length === 1 && planner.every(plan => plan.physicalModel && plan.physicalResponseModel && plan.resultDigest && plan.txHash && usagePresent(plan.usage));
    const paidTaskUsageVerified = settled.some(task => task.action === "metered-task" && BigInt(task.result.fromCreditRaw ?? "0") > 0n
      && task.meteredInferences.length > 0 && task.meteredInferences.every((entry: JsonObject) => entry.state === "Completed"
        && entry.physicalResponseModel && entry.responseDigest && BigInt(entry.chargedCredits ?? "0") > 0n && usagePresent(entry.usage)));
    const parentTerminalSuccess = parent.status === "Succeeded" && parent.result?.success === true && !agent.activeRequestId
      && unfinishedChildren.length === 0 && !loop?.pendingTaskChildId;
    const defaultPreserved = (state.before as JsonObject)?.finance?.counts?.defaults === "0" && finance.counts?.defaults === "0"
      && state.fresh.protocolBefore?.defaultsRaw === "0";
    const borrowedAndRepaid = independent.some(verdict => BigInt(verdict.settlement.event.repaidRaw) > 0n && verdict.settlement.event.slashedRaw === "0");
    fresh = { ownerAdmission: state.fresh.ownerAdmission, protocolBefore: state.fresh.protocolBefore, gasFunding: state.fresh.gasFunding,
      initialCashRaw: (state.before as JsonObject)?.finance?.cashRaw, initialRewardTokens: (state.before as JsonObject)?.rewardTokens,
      agentCashSeedRaw: "0", noSeedOrFreezeRemedy: !state.seed && !state.recheckOf && !state.freezeRemedy,
      physicalGameUsageVerified, physicalPlannerUsageVerified, paidTaskUsageVerified, parentTerminalSuccess, defaultPreserved, borrowedAndRepaid,
      currentSpentRaw: agent.spentRaw, terminalReplayVerified: Boolean(state.replay?.verifiedAt),
      loopAccepted: baseComplete && physicalGameUsageVerified && physicalPlannerUsageVerified && paidTaskUsageVerified && borrowedAndRepaid
        && parentTerminalSuccess && defaultPreserved && agent.spentRaw === "130000" && Boolean(state.fresh.ownerAdmission)
        && (state.before as JsonObject)?.finance?.cashRaw === "0" && (state.before as JsonObject)?.rewardTokens === 0
        && !state.seed && !state.recheckOf && !state.freezeRemedy };
  }
  const complete = baseComplete && (!recheck || recheck.sameAgentRewardLoopAccepted === true) && (!fresh || fresh.loopAccepted === true);
  return { version: 1, checkedAt: new Date().toISOString(), chainId: "10143", modelMode: "real-vendor", hostedAgentId: agent.id,
    agentId: agent.binding.agentId, wallet: agent.wallet, parent: publicRun(parent), parentRequestId: state.parentId,
    scope: "Public Next authentication and autonomous real Kimi games; original parent/child tasks; independent Docker verifier and canonical Monad settlement",
    before: state.before, after: { finance, sponsoredOwnerSlots: hostedDatabase?.sponsoredOwners?.[agent.owner], sponsoredTotal: hostedDatabase?.sponsoredTotal },
    games, tasks, planner, redemptions, rewardGrants, independentVerifier: independent, canonicalReceipts: receipts, recheck, fresh,
    terminalParent: { phase: loop?.phase, reason: loop?.reason, completedTasks: loop?.completedTasks, completedGames: loop?.completedGames,
      pendingTaskChildId: loop?.pendingTaskChildId, unfinishedChildren, activeRequestId: agent.activeRequestId },
    terminalReplay: state.replay && { ...state.replay, originalParentUuid: state.parentId, noNewEffectsVerified: Boolean(state.replay.verifiedAt) },
    automaticGameToSettledTaskAccepted: complete, winnerGuaranteed: false, terminalFailureOrPausePreserved: !complete,
    fullRecheckAccepted: state.recheckOf ? complete && Boolean(state.replay?.verifiedAt) && recheck?.unfreezeAuditVerified === true : undefined,
    fullFreshAccepted: state.fresh ? complete && Boolean(state.replay?.verifiedAt) : undefined,
    noReplacementUuid: true, noModelResponseText: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [runtime, mode, ...flags] = process.argv.slice(2);
  const argument = (name: string) => { const at = flags.indexOf(name); return at < 0 ? undefined : flags[at + 1]; };
  if (!runtime || flags.includes("--gas-wei") && !argument("--gas-wei") || !["inspect", "prepare-task", "prepare-agent", "apply", "recover", "evidence", "replay"].includes(mode)) {
    console.error("Usage: monad-collaboration-autonomy-acceptance.ts RUNTIME inspect|prepare-task|prepare-agent|apply|recover|evidence|replay [--out DIRECTORY] [--bootstrap FILE] [--gas-source-key-file FILE] [--fresh [--gas-wei WEI] | --recheck-of ORIGINAL_DIRECTORY] [--recover]"); process.exitCode = 1;
  } else monadCollaborationAutonomyAcceptance(mode as AutonomyAcceptanceMode, { runtime, output: argument("--out"), bootstrap: argument("--bootstrap"),
    gasSourceKeyFile: argument("--gas-source-key-file"), gasWei: argument("--gas-wei"), recheckOf: argument("--recheck-of"), recover: flags.includes("--recover"), fresh: flags.includes("--fresh") }).then(result => console.log(JSON.stringify(result))).catch(error => { reportDemoFailure(error); process.exitCode = 1; });
}
