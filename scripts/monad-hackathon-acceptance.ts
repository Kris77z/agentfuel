import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Contract, Interface, Wallet, getAddress, type JsonRpcProvider, type TransactionRequest, type TransactionReceipt } from "ethers";
import { ACCOUNT_ABI, MANAGER_ABI, accountInterface, canonical, requestDigest, type Json } from "../packages/sdk/src/protocol.js";
import { SessionStore } from "../packages/pi-loop/src/session.js";
import { ESCROW_ABI, atomicJson } from "../services/arena/src/protocol.js";
import { modelCatalogDigest } from "../services/hosted-agents/src/metered-task.js";
import type { HostedAgent, HostedFinance, HostedRun } from "../services/hosted-agents/src/types.js";
import type { MonadHostedBootstrap } from "./monad-hosted-runtime.js";
import { DemoJournal } from "./demo-journal.js";
import { monadProvider, readRpcUrlFile } from "./demo-rpc.js";

/** Explicit operator acceptance, never a product faucet. Only inspect is a
 * non-writing mode. Preparation, execution, recovery and audit stay separate. */
export const HACKATHON_CREDIT = Object.freeze({ origin: "https://monad.tabbyai.xyz", chainId: "10143", taskCount: 2,
  rewardRaw: "150000", creditLimit: "80000", cashRaw: "40000", priceRaw: "120000", totalBudgetRaw: "240000",
  creditsRaw: "200000", gasWei: "600000000000000000", taskLifetimeSeconds: 72 * 3600 });
export type HackathonMode = "inspect" | "prepare-tasks" | "prepare-agent" | "fund-agent" | "run-one" | "run-two" | "recover-one" | "recover-two" | "evidence" | "replay";
type ObjectValue = Record<string, any>;
type ConfirmedFinance = Extract<HostedFinance, { status: "confirmed" }>;
interface TaskPlan { taskId: string; problemId: "sum-integers"; creditLimit: "80000"; deadlineMs: number; poster: string; creation?: ObjectValue }
interface PaidEntry { input: { action: "metered-task"; requestId: string }; submittedAt?: string; before?: HostedFinance; after?: HostedFinance;
  gatewayBefore?: { offset: number; acceptedRequests: number }; result?: HostedRun; audit?: ObjectValue }
export interface HackathonJournal {
  version: 1; runtime: string; bootstrap: string; origin: string; chainId: "10143"; binding: string; startedAt: string; deadline: number;
  create: { requestId: string; name: string; modelId: "kimi-k2.6"; strategy: "balanced"; perRunBudgetRaw: "120000"; totalBudgetRaw: "240000"; allowCredit: true };
  deposit: { action: "deposit"; requestId: string; amountRaw: "40000" }; runs: [PaidEntry, PaidEntry]; planDigest: string;
  tasks: TaskPlan[]; owner?: string; agent?: HostedAgent; provision?: HostedRun; depositResult?: HostedRun; funded?: ObjectValue;
  gasFunding?: { amountWei: string; agentId: string; wallet: string; digest: string };
  poster?: string; cashSource?: string; gasSource?: string; replay?: { before: ObjectValue; after?: ObjectValue; verifiedAt?: string };
}
export interface HackathonOptions { runtime: string; output: string; bootstrap?: string; posterKeyFile?: string; cashSourceKeyFile?: string; gasSourceKeyFile?: string; gasWei?: string; recover?: boolean }
const sha = (value: unknown) => createHash("sha256").update(canonical(JSON.parse(JSON.stringify(value)) as Json)).digest("hex");
const shaText = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (code: string): never => { throw new Error(code); };
function check(value: unknown, code: string): asserts value { if (!value) fail(code); }
async function json<T = ObjectValue>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")); }
async function optional<T = ObjectValue>(file: string): Promise<T | undefined> {
  try { return await json<T>(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return undefined; }
}
function bootstrapBinding(b: MonadHostedBootstrap) {
  return sha({ chainId: b.chainId, contracts: b.contracts, identity: b.identity, asset: b.asset, payTo: b.payTo, roleKeyFiles: b.roleKeyFiles,
    rpcUrlFile: b.rpcUrlFile, rpcTransport: b.rpcTransport, maxFeePerGas: b.maxFeePerGas, frontendOrigin: b.frontendOrigin, gatewayReadyFile: b.gatewayReadyFile });
}
function immutablePlan(state: HackathonJournal) {
  return { version: state.version, runtime: state.runtime, bootstrap: state.bootstrap, origin: state.origin, chainId: state.chainId,
    binding: state.binding, startedAt: state.startedAt, deadline: state.deadline, create: state.create, deposit: state.deposit, runs: state.runs.map(entry => entry.input) };
}
/** Task-only preparation deliberately has no owner key or Agent side effect. */
export function createHackathonJournal(runtime: string, bootstrap: string, b: MonadHostedBootstrap, nowMs = Date.now()): HackathonJournal {
  check(isAbsolute(runtime) && isAbsolute(bootstrap) && b.chainId === "10143" && b.frontendOrigin === HACKATHON_CREDIT.origin, "HACKATHON_DOMAIN_REQUIRED");
  const state: HackathonJournal = { version: 1, runtime, bootstrap, chainId: "10143", origin: HACKATHON_CREDIT.origin, binding: bootstrapBinding(b),
    startedAt: new Date(nowMs).toISOString(), deadline: Math.floor(nowMs / 1000) + HACKATHON_CREDIT.taskLifetimeSeconds,
    create: { requestId: randomUUID(), name: `Tabby credit loop ${new Date(nowMs).toISOString().slice(0, 10)}`, modelId: "kimi-k2.6", strategy: "balanced", perRunBudgetRaw: "120000", totalBudgetRaw: "240000", allowCredit: true },
    deposit: { requestId: randomUUID(), action: "deposit", amountRaw: "40000" },
    runs: [{ input: { requestId: randomUUID(), action: "metered-task" } }, { input: { requestId: randomUUID(), action: "metered-task" } }], tasks: [], planDigest: "" };
  state.planDigest = sha(immutablePlan(state)); return state;
}
export function verifyHackathonJournal(state: HackathonJournal, runtime: string, bootstrap: string, b: MonadHostedBootstrap) {
  check(state.version === 1 && state.runtime === runtime && state.bootstrap === bootstrap && state.chainId === "10143" && state.origin === HACKATHON_CREDIT.origin
    && state.binding === bootstrapBinding(b) && state.planDigest === sha(immutablePlan(state)), "HACKATHON_BINDING_CHANGED");
  check(state.create.modelId === "kimi-k2.6" && state.create.strategy === "balanced" && state.create.perRunBudgetRaw === "120000"
    && state.create.totalBudgetRaw === "240000" && state.create.allowCredit && state.deposit.action === "deposit" && state.deposit.amountRaw === "40000"
    && state.runs.length === 2 && state.runs.every(entry => entry.input.action === "metered-task"), "HACKATHON_AUTHORIZATION_CHANGED");
  const ids = [state.create.requestId, state.deposit.requestId, ...state.runs.map(entry => entry.input.requestId)];
  check(new Set(ids).size === 4 && ids.every(id => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)), "HACKATHON_ORIGINAL_UUID_REQUIRED");
  check(Number.isSafeInteger(state.deadline) && state.deadline === Math.floor(Date.parse(state.startedAt) / 1000) + HACKATHON_CREDIT.taskLifetimeSeconds
    && state.tasks.length <= 2 && new Set(state.tasks.map(task => task.taskId)).size === state.tasks.length
    && state.tasks.every(task => /^[1-9][0-9]*$/.test(task.taskId) && task.problemId === "sum-integers" && task.creditLimit === "80000" && task.deadlineMs === state.deadline * 1000), "HACKATHON_TASK_PLAN_CHANGED");
  if (state.agent) check(state.owner === state.agent.owner && state.agent.modelId === state.create.modelId && state.agent.perRunBudgetRaw === "120000"
    && state.agent.totalBudgetRaw === "240000" && state.agent.allowCredit === true, "HACKATHON_AGENT_CHANGED");
  if (state.gasFunding) freezeHackathonGas(state);
}
/** Gas preparation has its own frozen snapshot so an already-prepared task
 * plan keeps its original digest. Omission during recovery uses that snapshot. */
export function freezeHackathonGas(state: HackathonJournal, requested?: string, recordedIntentAmount?: string): string {
  check(state.agent && state.owner === state.agent.owner, "HACKATHON_GAS_AGENT_REQUIRED");
  const amountWei = requested ?? state.gasFunding?.amountWei ?? recordedIntentAmount ?? HACKATHON_CREDIT.gasWei;
  check(typeof amountWei === "string" && /^(0|[1-9][0-9]{0,77})$/.test(amountWei)
    && BigInt(amountWei) > 0n && BigInt(amountWei) <= BigInt(HACKATHON_CREDIT.gasWei), "HACKATHON_GAS_AMOUNT_INVALID");
  check(recordedIntentAmount === undefined || recordedIntentAmount === amountWei, "HACKATHON_ORIGINAL_GAS_INTENT_CHANGED");
  const value = { amountWei, agentId: state.agent.id, wallet: getAddress(state.agent.wallet) };
  const snapshot = { ...value, digest: sha({ planDigest: state.planDigest, binding: state.binding, ...value }) };
  if (state.gasFunding) assert.deepEqual(state.gasFunding, snapshot, "HACKATHON_GAS_SNAPSHOT_CHANGED");
  else state.gasFunding = snapshot;
  return amountWei;
}
/** Missing response after a persisted dispatch needs explicit recovery, always
 * with the original UUID. Terminal failures never create a replacement call. */
export function hackathonDispatch(entry: PaidEntry, current: HostedRun | undefined, recover: boolean): "post" | "wait" | "terminal" {
  if (current) {
    check(current.requestId === entry.input.requestId && current.action === entry.input.action, "HACKATHON_REQUEST_CHANGED");
    if (current.status === "Succeeded" || current.status === "Failed") return "terminal";
    if (current.status === "Paused") { check(recover, "HACKATHON_PAUSED_USE_ORIGINAL_RECOVER"); return "post"; }
    return "wait";
  }
  check(!entry.result, "HACKATHON_SAVED_RUN_MISSING");
  check(!entry.submittedAt || recover, "HACKATHON_UNCERTAIN_DISPATCH_USE_ORIGINAL_RECOVER"); return "post";
}
/** Retrying an earlier stage after the next task has completed must not rebase
 * its original after-finance onto the Agent's later balance/reputation. */
export function recordHackathonOutcome(entry: PaidEntry, run: HostedRun, finance?: HostedFinance) {
  check(run.requestId === entry.input.requestId && run.action === entry.input.action, "HACKATHON_REQUEST_CHANGED");
  const frozen = entry.result && ["Succeeded", "Failed"].includes(entry.result.status);
  if (frozen) assert.deepEqual(publicRun(run), publicRun(entry.result), "HACKATHON_ORIGINAL_TERMINAL_RESULT_CHANGED");
  else { entry.result = structuredClone(run); if (!finance) delete entry.after; }
  if (finance && (!frozen || entry.after?.status !== "confirmed")) entry.after = structuredClone(finance);
}
export function verifyHackathonRun(state: HackathonJournal, index: 0 | 1, run: HostedRun, before: HostedFinance, after: HostedFinance) {
  const entry = state.runs[index], result = run.result;
  check(state.agent?.binding && state.tasks[index] && run.requestId === entry.input.requestId && run.agentId === state.agent.id && run.action === "metered-task", "HACKATHON_RUN_BINDING_CHANGED");
  check(run.status === "Succeeded" && result?.terminal && result.success && result.settlement?.passed && result.taskId === state.tasks[index].taskId,
    "HACKATHON_INDEPENDENT_SUCCESS_REQUIRED");
  check(before.status === "confirmed" && after.status === "confirmed" && [before, after].every(finance => finance.chainId === "10143"
    && finance.agentId === state.agent!.binding!.agentId && getAddress(finance.wallet) === getAddress(state.agent!.wallet) && finance.debtRaw === "0"
    && finance.counts.defaults === "0" && finance.counts.mirrorDefaults === "0"), "HACKATHON_HEALTHY_CONFIRMED_FINANCE_REQUIRED");
  check(before.credit.eligible && !before.policy.ownerFrozen, "HACKATHON_REAL_CREDIT_ADMISSION_REQUIRED");
  const principal = BigInt(result.fromCreditRaw ?? "0"), cash = BigInt(result.fromCashRaw ?? "0"), repaid = BigInt(result.settlement.repaidRaw);
  check(run.chargedRaw === "120000" && result.chargedRaw === "120000" && (result.refundedRaw ?? "0") === "0"
    && cash + principal === 120000n && principal > 0n && principal <= 80000n && cash === BigInt(before.cashRaw)
    && result.settlement.loanStatus === "2" && result.settlement.slashedRaw === "0" && repaid > principal, "HACKATHON_CREDIT_REPAYMENT_REQUIRED");
  if (index === 0) check(before.cashRaw === "40000" && principal === 80000n, "HACKATHON_FIRST_CREDIT_BASELINE_CHANGED");
  check(BigInt(after.cashRaw) === BigInt(before.cashRaw) - cash + BigInt(result.settlement.residualRaw)
    && BigInt(after.counts.repayments) === BigInt(before.counts.repayments) + 1n
    && BigInt(after.counts.mirrorRepayments) === BigInt(before.counts.mirrorRepayments) + 1n
    && BigInt(after.counts.successes) === BigInt(before.counts.successes) + 1n
    && BigInt(after.credit.score) > BigInt(before.credit.score), "HACKATHON_INCOME_REPUTATION_REQUIRED");
  if (index === 1) check(state.runs[0].after?.status === "confirmed" && before.cashRaw === state.runs[0].after.cashRaw
    && before.counts.repayments === state.runs[0].after.counts.repayments && before.counts.successes === state.runs[0].after.counts.successes,
    "HACKATHON_NEXT_TASK_MUST_USE_PRIOR_INCOME");
}
const publicRun = (run?: HostedRun) => run && ({ requestId: run.requestId, agentId: run.agentId, action: run.action, status: run.status, chargedRaw: run.chargedRaw,
  reason: run.reason, result: run.result && { phase: run.result.phase, success: run.result.success, terminal: run.result.terminal, taskId: run.result.taskId,
    chargedRaw: run.result.chargedRaw, refundedRaw: run.result.refundedRaw, fromCashRaw: run.result.fromCashRaw, fromCreditRaw: run.result.fromCreditRaw,
    paymentId: run.result.paymentId, paymentTxHash: run.result.paymentTxHash, settlement: run.result.settlement } });
const managerABI = [...MANAGER_ABI, "function repaymentCount(uint256) view returns(uint256)", "function defaultCount(uint256) view returns(uint256)",
  "event LoanOpened(uint256 indexed taskId,uint256 indexed agentId,uint256 amount,uint8 tier)", "event LoanRepaid(uint256 indexed taskId,uint256 principal,uint256 fee)"];
const escrowABI = [...ESCROW_ABI, "function settlementAsset() view returns(address)", "function nextTaskId() view returns(uint256)", "function createTask(uint256,uint256)",
  "event TaskCreated(uint256 indexed taskId,address indexed poster,uint256 reward,uint256 deadline)"];
const parsedEvents = (receipt: TransactionReceipt, contract: Contract, name: string) => receipt.logs.filter(log => getAddress(log.address) === getAddress(String(contract.target)))
  .flatMap(log => { try { const event = contract.interface.parseLog(log); return event?.name === name ? [event] : []; } catch { return []; } });
async function confirmedReceipt(provider: JsonRpcProvider, hash: string, to: string, from?: string) {
  check(/^0x[0-9a-f]{64}$/i.test(hash), "HACKATHON_TRANSACTION_HASH_REQUIRED");
  const receipt = await provider.getTransactionReceipt(hash);
  check(receipt?.status === 1 && receipt.to && getAddress(receipt.to) === getAddress(to) && (!from || getAddress(receipt.from) === getAddress(from))
    && (await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash, "HACKATHON_CANONICAL_RECEIPT_REQUIRED"); return receipt;
}
/** Read saved private artifacts and canonical chain evidence; never redispatch
 * a model to reconstruct an answer. Only this whitelist may be published. */
export async function collectHackathonTaskEvidence(state: HackathonJournal, index: 0 | 1, bootstrap: MonadHostedBootstrap, provider: JsonRpcProvider, gatewayLines: ObjectValue[]) {
  check(BigInt(await provider.send("eth_chainId", [])) === 10143n, "HACKATHON_NETWORK_MISMATCH");
  const entry = state.runs[index]; check(entry.result && entry.before && entry.after && entry.gatewayBefore, "HACKATHON_ORIGINAL_BOUNDARIES_REQUIRED");
  verifyHackathonRun(state, index, entry.result, entry.before, entry.after);
  const agent = state.agent!, chainAgent = agent.binding!.agentId, taskId = state.tasks[index].taskId, result = entry.result.result!;
  const directory = join(state.runtime, "hosted", "agents", agent.id, "runs", entry.input.requestId, "task-executor");
  const saved = await json(join(directory, "session.json")), workflow = await json(join(directory, "workflow", "session.json"));
  check(saved.snapshot.request === entry.input.requestId && saved.snapshot.agent === agent.id && saved.snapshot.action === "metered-task"
    && saved.snapshot.wallet === agent.wallet && saved.snapshot.owner === state.owner && saved.snapshot.settings.perRunBudgetRaw === "120000"
    && saved.snapshot.settings.totalBudgetRaw === "240000" && saved.snapshot.settings.allowCredit === true, "HACKATHON_FROZEN_SNAPSHOT_CHANGED");
  assert.deepEqual(saved.result, result, "HACKATHON_SAVED_RESULT_CHANGED");
  const purchase = await json(join(directory, "workflow", "metered", "allowance-purchase", "session.json"));
  const ledger = await json(join(directory, "workflow", "metered", "inference-ledger", "session.json"));
  const handle = purchase.handle, inference = purchase.inference, quote = handle?.quote;
  check(quote?.chainId === "10143" && quote.taskId === taskId && quote.agentId === chainAgent && quote.price === "120000"
    && getAddress(quote.account) === getAddress(bootstrap.contracts.account) && getAddress(quote.asset) === getAddress(bootstrap.asset.address)
    && getAddress(quote.payTo) === getAddress(bootstrap.payTo) && quote.service === "infercredit/allowance"
    && quote.paymentId === result.paymentId && handle.submission?.txHash === result.paymentTxHash && quote.requestDigest === requestDigest(handle.input), "HACKATHON_ALLOWANCE_PAYMENT_CHANGED");
  check(inference?.result?.kind === "inference-allowance" && inference.result.creditsRaw === "200000"
    && inference.result.paymentId === quote.paymentId && inference.result.taskId === taskId && inference.result.agentId === chainAgent
    && inference.result.modelCatalogDigest === modelCatalogDigest(purchase.config.catalog), "HACKATHON_ALLOWANCE_GRANT_REQUIRED");
  assert.deepEqual(handle.input.allowance, { creditsRaw: "200000", modelCatalogDigest: modelCatalogDigest(purchase.config.catalog) });
  const account = new Contract(bootstrap.contracts.account, ACCOUNT_ABI, provider), manager = new Contract(bootstrap.contracts.manager, managerABI, provider);
  const escrow = new Contract(bootstrap.contracts.escrow, escrowABI, provider);
  const paid = await confirmedReceipt(provider, result.paymentTxHash!, bootstrap.contracts.account, agent.wallet);
  const transaction = await provider.getTransaction(paid.hash), operation = transaction && accountInterface.parseTransaction({ data: transaction.data, value: transaction.value });
  check(operation?.name === "payProvider" && String(operation.args[0]) === chainAgent && getAddress(operation.args[1]) === getAddress(bootstrap.payTo)
    && String(operation.args[2]) === "120000" && operation.args[3] === result.paymentId && String(operation.args[4].taskId) === taskId, "HACKATHON_PAYMENT_CALL_CHANGED");
  const paidEvents = parsedEvents(paid, account, "ProviderPaid"), opened = parsedEvents(paid, manager, "LoanOpened");
  check(paidEvents.length === 1 && String(paidEvents[0].args.agentId) === chainAgent && paidEvents[0].args.paymentId === result.paymentId
    && getAddress(paidEvents[0].args.provider) === getAddress(bootstrap.payTo) && String(paidEvents[0].args.fromCash) === result.fromCashRaw
    && String(paidEvents[0].args.fromCredit) === result.fromCreditRaw && opened.length === 1 && String(opened[0].args.taskId) === taskId
    && String(opened[0].args.agentId) === chainAgent && String(opened[0].args.amount) === result.fromCreditRaw, "HACKATHON_LOAN_PAYMENT_EVENT_REQUIRED");
  const verifier = await escrow.verifier(); check(getAddress(verifier) !== getAddress(agent.wallet), "HACKATHON_INDEPENDENT_VERIFIER_REQUIRED");
  const settled = await confirmedReceipt(provider, result.settlement!.txHash, bootstrap.contracts.escrow, verifier);
  check(result.settlement!.block.number === settled.blockNumber && result.settlement!.block.hash === settled.blockHash
    && paid.blockNumber <= settled.blockNumber, "HACKATHON_SETTLEMENT_BLOCK_CHANGED");
  const settlements = parsedEvents(settled, escrow, "TaskSettled"), repayments = parsedEvents(settled, manager, "LoanRepaid");
  check(settlements.length === 1 && repayments.length === 1 && String(settlements[0].args.taskId) === taskId && settlements[0].args.passed
    && String(settlements[0].args.repaid) === result.settlement!.repaidRaw && String(settlements[0].args.slashed) === "0"
    && String(settlements[0].args.agentResidual) === result.settlement!.residualRaw && String(repayments[0].args.taskId) === taskId
    && String(repayments[0].args.principal) === result.fromCreditRaw, "HACKATHON_CANONICAL_REPAYMENT_REQUIRED");
  const fee = BigInt(result.fromCreditRaw!) * BigInt(operation.args[4].feeBps) / 10000n;
  check(repayments[0].args.fee === fee && repayments[0].args.principal + fee === BigInt(result.settlement!.repaidRaw), "HACKATHON_SIGNED_CREDIT_FEE_CHANGED");
  const [payment, task, loan] = await Promise.all([account.getPayment(result.paymentId), escrow.getTask(taskId), manager.getLoan(taskId)]);
  check(String(payment.agentId) === chainAgent && String(payment.taskId) === taskId && String(payment.fromCash) === result.fromCashRaw
    && String(payment.fromCredit) === result.fromCreditRaw && payment.refundedAmount === 0n && task.status === 3n && String(task.agentId) === chainAgent
    && task.escrowBalance === 0n && loan.status === 2n && String(loan.agentId) === chainAgent && loan.principal + loan.fee === 0n, "HACKATHON_FINAL_LOAN_TASK_MISMATCH");
  for (const finance of [entry.before, entry.after] as ConfirmedFinance[]) {
    check((await provider.getBlock(finance.block.number))?.hash === finance.block.hash, "HACKATHON_FINANCE_BLOCK_REORG");
    const at = { blockTag: finance.block.number };
    check(String(await account.cash(chainAgent, at)) === finance.cashRaw && String(await manager.repaymentCount(chainAgent, at)) === finance.counts.repayments
      && String(await manager.defaultCount(chainAgent, at)) === "0", "HACKATHON_FINANCE_CHAIN_MISMATCH");
  }
  const arena = await json(join(state.runtime, "arena-http-journal.json"));
  const independent = arena.runs.find((run: ObjectValue) => run.taskId === taskId && run.status === "settled" && run.result?.settlement?.txHash === settled.hash);
  check(independent?.result.verdict.mode === "docker" && independent.result.verdict.passed && independent.result.tests.length > 0
    && independent.result.tests.every((test: ObjectValue) => test.passed === true), "HACKATHON_INDEPENDENT_DOCKER_TESTS_REQUIRED");
  check(ledger.binding.agentId === chainAgent && ledger.binding.taskId === taskId && getAddress(ledger.binding.wallet) === getAddress(agent.wallet)
    && ledger.grants.length === 1 && ledger.grants[0].source.kind === "chain-payment" && ledger.grants[0].source.paymentId === result.paymentId
    && ledger.grants[0].source.txHash === paid.hash && ledger.grants[0].credits === "200000" && ledger.invocations.length > 0, "HACKATHON_METERED_LEDGER_REQUIRED");
  assert.deepEqual(ledger.catalog, [...purchase.config.catalog].sort((a, b) => a.id.localeCompare(b.id)), "HACKATHON_LEDGER_CATALOG_CHANGED");
  const used = new Set<number>(), models: ObjectValue[] = []; let spent = 0n;
  for (const invocation of ledger.invocations) {
    check(invocation.state === "Completed" && invocation.response?.status === 200, "HACKATHON_UNKNOWN_MODEL_NOT_ACCEPTED");
    const model = ledger.catalog.find((entry: ObjectValue) => entry.id === invocation.modelId), response = invocation.response.body, usage = response.usage;
    check(model && invocation.request.model === model.model && response.model === (model.responseModel ?? model.model)
      && invocation.requestDigest === sha(invocation.request) && sha(invocation.result.response) === sha(response), "HACKATHON_MODEL_RESPONSE_BINDING_CHANGED");
    check([usage?.prompt_tokens, usage?.completion_tokens, usage?.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0)
      && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens && usage.total_tokens > 0, "HACKATHON_ACTUAL_USAGE_REQUIRED");
    assert.deepEqual(invocation.result.usage, { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens });
    const charged = BigInt(usage.prompt_tokens) * BigInt(model.inputMicroCreditsPerToken) + BigInt(usage.completion_tokens) * BigInt(model.outputMicroCreditsPerToken);
    check(String(charged) === invocation.result.chargedCredits && charged <= BigInt(invocation.reservedCredits), "HACKATHON_METERED_CHARGE_CHANGED"); spent += charged;
    let physical: ObjectValue | undefined;
    for (const line of gatewayLines.slice(entry.gatewayBefore.offset)) {
      if (line.phase !== "Response" || line.httpStatus !== 200 || line.model !== response.model || used.has(line.attempt)) continue;
      const raw = await readFile(join(dirname(bootstrap.gatewayReadyFile), "responses", `attempt-${line.attempt}.json`), "utf8");
      check(shaText(raw) === line.responseDigest, "HACKATHON_GATEWAY_RESPONSE_DIGEST_CHANGED");
      if (sha(JSON.parse(raw)) !== sha(response)) continue;
      const dispatch = gatewayLines.find(candidate => candidate.phase === "DispatchIntent" && candidate.attempt === line.attempt && candidate.model === response.model);
      check(dispatch, "HACKATHON_GATEWAY_DISPATCH_REQUIRED"); physical = { attempt: line.attempt, model: line.model, requestDigest: dispatch.requestDigest,
        responseDigest: line.responseDigest, usage: line.usage, providerRequestId: line.providerRequestId }; break;
    }
    check(physical, "HACKATHON_REAL_GATEWAY_RESPONSE_REQUIRED"); used.add(physical.attempt);
    models.push({ invocationId: invocation.id, modelId: invocation.modelId, requestedModel: model.model, responseModel: response.model,
      usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens },
      chargedCredits: String(charged), requestDigest: invocation.requestDigest, responseDigest: sha(response), gateway: physical });
  }
  check(spent <= 200000n, "HACKATHON_ALLOWANCE_OVERRUN");
  const candidate = workflow.child?.candidate ?? workflow.rewardChild?.submission?.payload?.code;
  return { requestId: entry.input.requestId, taskId, status: "Succeeded", acceptancePassed: true, chargedRaw: "120000", paymentId: result.paymentId,
    payment: { txHash: paid.hash, blockNumber: paid.blockNumber, blockHash: paid.blockHash, canonical: true, fromCashRaw: result.fromCashRaw,
      fromCreditRaw: result.fromCreditRaw, feeRaw: String(fee), feeBps: String(operation.args[4].feeBps), provider: bootstrap.payTo },
    settlement: { ...result.settlement, canonical: true, verifier }, independent: { runId: independent.runId, mode: "docker", passed: true,
      evidenceHash: independent.result.verdict.evidenceHash, testCount: independent.result.tests.length, tests: independent.result.tests.map((test: ObjectValue) => ({ case: test.case, passed: test.passed })) },
    modelCalls: models, consumedCreditsRaw: String(spent), artifactDigest: typeof candidate === "string" ? shaText(candidate) : undefined,
    snapshotDigest: sha(saved), financeBefore: entry.before, financeAfter: entry.after };
}

export async function monadHackathonAcceptance(mode: HackathonMode, options: HackathonOptions) {
  const runtime = resolve(options.runtime), output = resolve(options.output);
  check(isAbsolute(options.runtime) && isAbsolute(options.output) && output !== runtime && !output.startsWith(join(runtime, "hosted") + "/"), "HACKATHON_SEPARATE_PRIVATE_OUTPUT_REQUIRED");
  const ready = await optional(join(runtime, "ready.json")), bootstrapFile = resolve(options.bootstrap ?? ready?.bootstrapFile ?? join(runtime, "..", "bootstrap.json"));
  const b = await json<MonadHostedBootstrap>(bootstrapFile);
  check(b.chainId === "10143" && b.frontendOrigin === HACKATHON_CREDIT.origin && b.asset.decimals === 6, "HACKATHON_PUBLIC_MONAD_REQUIRED");
  const connection = await monadProvider(await readRpcUrlFile(b.rpcUrlFile), b.rpcTransport), provider = connection.provider;
  const store = new SessionStore<HackathonJournal>(output); let held = false;
  try {
    check(BigInt(await provider.send("eth_chainId", [])) === 10143n, "HACKATHON_NETWORK_MISMATCH");
    const escrow = new Contract(b.contracts.escrow, escrowABI, provider);
    check(getAddress(await escrow.settlementAsset()) === getAddress(b.asset.address), "HACKATHON_ESCROW_ASSET_CHANGED");
    const recorded = await optional<HackathonJournal>(join(output, "session.json"));
    if (mode === "inspect") {
      if (recorded) verifyHackathonJournal(recorded, runtime, bootstrapFile, b);
      const tasks = [];
      for (const entry of recorded?.tasks ?? []) { const task = await escrow.getTask(entry.taskId); tasks.push({ taskId: entry.taskId, deadlineMs: entry.deadlineMs,
        status: String(task.status), assignedAgentId: String(task.agentId), escrowBalanceRaw: String(task.escrowBalance), expired: entry.deadlineMs <= Date.now() }); }
      return { checkedAt: new Date().toISOString(), readOnly: true, stateExists: Boolean(recorded), chainId: "10143", nextTaskId: String(await escrow.nextTaskId()),
        tasks, agentId: recorded?.agent?.id, requestIds: recorded?.runs.map(entry => entry.input.requestId), chainWrites: 0, businessPosts: 0, modelCalls: 0 };
    }
    await store.start(Boolean(options.recover || mode.startsWith("recover"))); held = true;
    let state = await store.read();
    if (!state) {
      check(mode === "prepare-tasks" || mode === "prepare-agent", "HACKATHON_ORIGINAL_PREPARATION_REQUIRED");
      state = createHackathonJournal(runtime, bootstrapFile, b); await store.write(state);
    }
    const saved = state; verifyHackathonJournal(saved, runtime, bootstrapFile, b); const save = () => store.write(saved);
    const journal = new DemoJournal(provider, join(output, "transactions.json")); await journal.load();
    const withOperator = async <T>(keyFile: string | undefined, role: "poster" | "gasSource" | "cashSource", action: (wallet: Wallet) => Promise<T>) => {
      check(keyFile && isAbsolute(keyFile), "HACKATHON_EXPLICIT_OPERATOR_KEY_FILE_REQUIRED");
      const wallet = new Wallet((await readFile(keyFile, "utf8")).trim(), provider);
      check(!saved[role] || saved[role] === wallet.address, "HACKATHON_OPERATOR_CHANGED"); saved[role] ??= wallet.address; await save();
      const lock = new SessionStore<{ directory?: string }>(join(runtime, "wallets", "operator", wallet.address.toLowerCase())); await lock.start(Boolean(options.recover));
      try { const prior = await lock.read(); check(!prior?.directory || prior.directory === output, "HACKATHON_ORIGINAL_OPERATOR_RECOVERY_REQUIRED");
        await lock.write({ directory: output }); const result = await action(wallet); await lock.write({}); return result;
      } finally { await lock.close(); }
    };
    const send = async (id: string, wallet: Wallet, transaction: TransactionRequest, gasCeiling: bigint) => {
      const intent = { from: wallet.address, to: transaction.to, data: transaction.data ?? "0x", value: String(transaction.value ?? 0), gasCeiling: String(gasCeiling) };
      const file = join(output, "intents.json"), intents = await optional(file) ?? {};
      if (intents[id]) assert.deepEqual(intents[id], intent, "HACKATHON_TRANSACTION_INTENT_CHANGED"); else { intents[id] = intent; await atomicJson(file, intents); }
      if (!journal.has(id)) {
        check(await provider.getTransactionCount(wallet.address, "latest") === await provider.getTransactionCount(wallet.address, "pending"), "HACKATHON_PENDING_OPERATOR_TRANSACTION");
        const fee = await provider.getFeeData(), maximum = BigInt(b.maxFeePerGas), estimate = await provider.estimateGas({ ...transaction, from: wallet.address });
        const gasLimit = estimate === 21000n ? estimate : (estimate * 13n + 9n) / 10n;
        check(fee.maxFeePerGas && fee.maxFeePerGas <= maximum && gasLimit <= gasCeiling, "HACKATHON_FEE_OR_GAS_CEILING");
        await journal.send(id, wallet, { ...transaction, gasLimit, maxFeePerGas: maximum, maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 2000000000n });
      }
      const receipt = await journal.receipt(id); check((await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash, "HACKATHON_OPERATOR_TRANSACTION_REORG"); return receipt;
    };
    if (mode === "prepare-tasks") {
      await withOperator(options.posterKeyFile, "poster", async poster => {
        const token = new Contract(b.asset.address, ["function approve(address,uint256) returns(bool)", "function balanceOf(address) view returns(uint256)"], provider);
        // createTask is permissionless; the explicit poster supplies its own
        // approved test USDC. No presumed guardian/owner-only permission.
        for (let index = 0; index < 2; index++) {
          if (!saved.tasks[index]) { saved.tasks[index] = { taskId: String(await escrow.nextTaskId()), problemId: "sum-integers", creditLimit: "80000", deadlineMs: saved.deadline * 1000, poster: poster.address }; await save(); }
          const task = saved.tasks[index], createId = `create-task-${index}`;
          check(task.poster === poster.address, "HACKATHON_POSTER_CHANGED");
          if (!journal.has(createId)) {
            check(task.deadlineMs > Math.max(Date.now(), (await provider.getBlock("latest"))!.timestamp * 1000) + 3600000, "HACKATHON_TASK_WINDOW_EXPIRED");
            check(String(await escrow.nextTaskId()) === task.taskId && await token.balanceOf(poster.address) >= 150000n, "HACKATHON_TASK_ID_OR_FUNDS_CHANGED");
            await send(`approve-task-${index}`, poster, await token.approve.populateTransaction(b.contracts.escrow, 150000n), 2000000n);
          }
          const receipt = await send(createId, poster, await escrow.createTask.populateTransaction(150000n, saved.deadline), 2000000n);
          const events = parsedEvents(receipt, escrow, "TaskCreated"), current = await escrow.getTask(task.taskId);
          check(events.length === 1 && String(events[0].args.taskId) === task.taskId && getAddress(events[0].args.poster) === poster.address
            && current.reward === 150000n && Number(current.deadline) === saved.deadline && getAddress(current.poster) === poster.address, "HACKATHON_CREATED_TASK_MISMATCH");
          task.creation = { txHash: receipt.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, canonical: true }; await save();
        }
      });
      await atomicJson(join(output, "additional.json"), saved.tasks.map(({ taskId, problemId, creditLimit, deadlineMs }) => ({ taskId, problemId, creditLimit, deadlineMs })));
      const summary = { observedAt: new Date().toISOString(), chainId: "10143", tasks: saved.tasks, catalogAppended: false, newAgents: 0, modelCalls: 0 };
      await atomicJson(join(output, "task-creation-public-summary.json"), summary);
      return { ...summary, additionalFile: join(output, "additional.json"), next: "Stop all three Monad units, cold backup, audit append-tasks with this exact additional.json, recover same runtime; no existing request is resumed." };
    }
    check(ready?.chainId === "10143" && ready.frontendOrigin === saved.origin && ready.hostedConfigFile === join(runtime, "hosted.json"), "HACKATHON_RUNTIME_READY_REQUIRED");
    const hosted = await json(ready.hostedConfigFile), taskConfig = await json(hosted.executor.taskConfigFile);
    check(taskConfig.initialCashRaw === "0" && taskConfig.metered.priceRaw === "120000" && taskConfig.metered.creditsRaw === "200000", "HACKATHON_RUNTIME_PRICE_CHANGED");
    let ownerKey: string | undefined;
    try { ownerKey = (await readFile(join(output, "owner.key"), "utf8")).trim(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    check(ownerKey || mode === "prepare-agent", "HACKATHON_ORIGINAL_OWNER_REQUIRED");
    const owner = ownerKey ? new Wallet(ownerKey) : Wallet.createRandom();
    if (!ownerKey) await writeFile(join(output, "owner.key"), owner.privateKey + "\n", { mode: 0o600, flag: "wx" });
    check(!saved.owner || saved.owner === owner.address, "HACKATHON_OWNER_CHANGED"); saved.owner ??= owner.address; await save();
    let cookie = "";
    const api = async (path: string, method = "GET", body?: unknown): Promise<any> => {
      const response = await fetch(`${saved.origin}/api/hosted${path}`, { method, redirect: "error", headers: { origin: saved.origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.endsWith("/finance") ? 90000 : 60000) });
      const value = await response.json(); check(response.ok, `HACKATHON_HOSTED_HTTP_${response.status}`);
      if (path === "/auth/login") { cookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""; check(cookie.startsWith("agentfuel_hosted_session="), "HACKATHON_AUTH_COOKIE_REQUIRED"); } return value;
    };
    const challenge = await api("/auth/challenge", "POST", { wallet: owner.address });
    check(challenge.message.startsWith(`AgentFuel hosted agent login\nOrigin: ${saved.origin}\nWallet: ${owner.address}\nChain: 10143\nNonce: `)
      && challenge.message.endsWith("This signature authenticates your platform account. It authorizes no blockchain transaction."), "HACKATHON_AUTH_DOMAIN_CHANGED");
    await api("/auth/login", "POST", { challengeId: challenge.id, signature: await owner.signMessage(challenge.message) });
    const wait = async (id: string): Promise<HostedRun> => {
      const end = Date.now() + 660000;
      while (Date.now() < end) { const snapshot = await api("/agents"), run = snapshot.runs.find((value: HostedRun) => value.requestId === id);
        if (run && !["Queued", "Running"].includes(run.status)) return run; await new Promise(resolve => setTimeout(resolve, 2000)); }
      return fail("HACKATHON_WAIT_TIMEOUT_USE_ORIGINAL_UUID");
    };
    if (mode === "prepare-agent") {
      saved.agent ??= await api("/agents", "POST", saved.create); await save();
      saved.provision = await wait(saved.create.requestId); await save();
      check(saved.provision.status === "Succeeded" || saved.provision.status === "Paused" && saved.provision.reason === "HOSTED_WALLET_GAS_REQUIRED", "HACKATHON_PROVISION_REQUIRES_INSPECTION");
      return { owner: saved.owner, agentId: saved.agent!.id, wallet: saved.agent!.wallet, provision: publicRun(saved.provision), newTaskRequests: 0, modelCalls: 0 };
    }
    check(saved.agent, "HACKATHON_PREPARE_AGENT_FIRST");
    let snapshot = await api("/agents"), agent: HostedAgent = snapshot.agents.find((value: HostedAgent) => value.id === saved.agent!.id);
    check(agent && agent.owner === saved.owner && getAddress(agent.wallet) === getAddress(saved.agent.wallet), "HACKATHON_AGENT_IDENTITY_CHANGED");
    if (mode === "fund-agent") {
      check(!saved.runs.some(entry => entry.submittedAt), "HACKATHON_NO_TOPUP_AFTER_EXECUTION");
      const originalGasIntent = (await optional(join(output, "intents.json")))?.["fund-agent-mon"];
      const gasWei = freezeHackathonGas(saved, options.gasWei, originalGasIntent?.value); await save(); // Before reading a signer or broadcasting.
      const gas = await withOperator(options.gasSourceKeyFile, "gasSource", async wallet => send("fund-agent-mon", wallet, { to: agent.wallet, value: BigInt(gasWei) }, 21000n));
      const cash = await withOperator(options.cashSourceKeyFile, "cashSource", async wallet => {
        const token = new Contract(b.asset.address, ["function transfer(address,uint256) returns(bool)"], provider);
        return send("fund-agent-usdc", wallet, await token.transfer.populateTransaction(agent.wallet, 40000n), 2000000n);
      });
      const transfer = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
      check(cash.logs.some(log => { try { const event = transfer.parseLog(log); return getAddress(log.address) === getAddress(b.asset.address)
        && event?.name === "Transfer" && getAddress(event.args.from) === saved.cashSource && getAddress(event.args.to) === getAddress(agent.wallet) && event.args.value === 40000n; } catch { return false; } }), "HACKATHON_CASH_TRANSFER_REQUIRED");
      const provision: HostedRun | undefined = snapshot.runs.find((value: HostedRun) => value.requestId === saved.create.requestId);
      check(provision, "HACKATHON_ORIGINAL_PROVISION_REQUIRED");
      if (provision.status === "Paused") { check(provision.reason === "HOSTED_WALLET_GAS_REQUIRED", "HACKATHON_ORIGINAL_PROVISION_INSPECT_REQUIRED");
        await api(`/agents/${agent.id}/runs`, "POST", { action: "provision", requestId: saved.create.requestId }); }
      saved.provision = await wait(saved.create.requestId); check(saved.provision.status === "Succeeded", "HACKATHON_PROVISION_NOT_SUCCEEDED");
      const deposit: HostedRun | undefined = (await api("/agents")).runs.find((value: HostedRun) => value.requestId === saved.deposit.requestId);
      check(!deposit || deposit.status !== "Failed", "HACKATHON_ORIGINAL_DEPOSIT_FAILED");
      if (!deposit || deposit.status === "Paused") await api(`/agents/${agent.id}/runs`, "POST", saved.deposit);
      saved.depositResult = await wait(saved.deposit.requestId); check(saved.depositResult.status === "Succeeded", "HACKATHON_DEPOSIT_NOT_SUCCEEDED");
      snapshot = await api("/agents"); agent = snapshot.agents.find((value: HostedAgent) => value.id === agent.id); saved.agent = agent;
      const finance: HostedFinance = await api(`/agents/${agent.id}/finance`);
      check(finance.status === "confirmed" && finance.cashRaw === "40000" && finance.debtRaw === "0" && finance.credit.eligible
        && finance.counts.defaults === "0" && finance.counts.repayments === "0" && finance.counts.successes === "0", "HACKATHON_FRESH_HEALTHY_CASH_BASELINE_REQUIRED");
      saved.funded = { mon: { amountWei: gasWei, txHash: gas.hash, blockNumber: gas.blockNumber, blockHash: gas.blockHash }, cash: { txHash: cash.hash, blockNumber: cash.blockNumber, blockHash: cash.blockHash }, finance }; await save();
      return { funded: true, agentId: agent.id, chainAgentId: agent.binding?.agentId, wallet: agent.wallet, funding: saved.funded };
    }
    check(agent.binding && saved.funded && !agent.configurationRequired, "HACKATHON_FUNDED_PROVISIONED_AGENT_REQUIRED"); saved.agent = agent; await save();
    const gateway = async () => {
      const config = await json(b.gatewayReadyFile), healthUrl = config.bridgeHealthUrl ?? "http://127.0.0.1:3427/health";
      check(healthUrl === "http://127.0.0.1:3427/health", "HACKATHON_GATEWAY_HEALTH_DOMAIN_CHANGED");
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) }); check(response.ok, "HACKATHON_GATEWAY_UNAVAILABLE");
      const health = await response.json(), raw = await readFile(join(dirname(b.gatewayReadyFile), "attempts.jsonl"), "utf8");
      const lines: ObjectValue[] = raw.trim() ? raw.trim().split("\n").map(line => JSON.parse(line)) : [];
      check(health.ready && Number.isSafeInteger(health.acceptedRequests) && health.acceptedRequests === lines.filter(line => line.phase === "DispatchIntent").length, "HACKATHON_GATEWAY_COUNTER_MISMATCH");
      return { lines, acceptedRequests: health.acceptedRequests as number, journalDigest: shaText(raw) };
    };
    if (["run-one", "run-two", "recover-one", "recover-two"].includes(mode)) {
      const index: 0 | 1 = mode.endsWith("one") ? 0 : 1, entry = saved.runs[index], recovery = mode.startsWith("recover");
      if (index === 1) { check(saved.runs[0].result?.status === "Succeeded", "HACKATHON_FIRST_SUCCESS_REQUIRED");
        saved.runs[0].audit = await collectHackathonTaskEvidence(saved, 0, b, provider, (await gateway()).lines); await save(); }
      const current: HostedRun | undefined = snapshot.runs.find((value: HostedRun) => value.requestId === entry.input.requestId);
      const action = hackathonDispatch(entry, current, recovery);
      if (action === "post" && !entry.submittedAt) {
        check(saved.tasks.length === 2, "HACKATHON_TWO_FRESH_TASKS_REQUIRED");
        for (const task of saved.tasks) check(taskConfig.models.every((model: ObjectValue) => model.templates.balanced.tasks.some((entry: ObjectValue) => entry.taskId === task.taskId
          && entry.deadlineMs === task.deadlineMs && entry.creditLimit === "80000" && entry.problemId === "sum-integers")), "HACKATHON_TASK_CATALOG_APPEND_REQUIRED");
        const task = await escrow.getTask(saved.tasks[index].taskId);
        check(task.status === 1n && task.agentId === 0n && task.reward === 150000n && task.escrowBalance === 150000n
          && Number(task.deadline) * 1000 > Date.now() + 300000, "HACKATHON_EXPECTED_OPEN_ESCROW_TASK_REQUIRED");
        const finance: HostedFinance = await api(`/agents/${agent.id}/finance`);
        check(finance.status === "confirmed" && finance.credit.eligible && finance.debtRaw === "0" && finance.counts.defaults === "0"
          && BigInt(finance.cashRaw) < 120000n && 120000n - BigInt(finance.cashRaw) <= 80000n, "HACKATHON_REAL_CREDIT_ADMISSION_REQUIRED");
        if (index === 0) check(finance.cashRaw === "40000" && finance.counts.repayments === "0" && finance.counts.successes === "0", "HACKATHON_FIRST_FINANCE_CHANGED");
        entry.before = finance; const baseline = await gateway(); entry.gatewayBefore = { offset: baseline.lines.length, acceptedRequests: baseline.acceptedRequests };
        entry.submittedAt = new Date().toISOString(); await save();
      }
      if (action === "post") await api(`/agents/${agent.id}/runs`, "POST", entry.input);
      const outcome = action === "terminal" ? current! : await wait(entry.input.requestId);
      recordHackathonOutcome(entry, outcome); await save();
      recordHackathonOutcome(entry, outcome, await api(`/agents/${agent.id}/finance`)); await save();
      if (entry.result?.status === "Succeeded") { entry.audit = await collectHackathonTaskEvidence(saved, index, b, provider, (await gateway()).lines); await save(); }
      return { observedAt: new Date().toISOString(), stage: index + 1, result: publicRun(entry.result), financeBefore: entry.before, financeAfter: entry.after,
        acceptancePassed: Boolean(entry.audit), next: entry.result?.status === "Paused" ? `Use recover-${index === 0 ? "one" : "two"} with this original directory/UUID; never replace paid or Unknown work.` : index === 0 && entry.audit ? "run-two" : "evidence" };
    }
    const counters = async () => {
      const roles: ObjectValue = { agent: agent.wallet };
      for (const [role, file] of Object.entries(b.roleKeyFiles)) roles[role] = new Wallet((await readFile(file, "utf8")).trim()).address;
      const nonces: ObjectValue = {};
      for (const [role, address] of Object.entries(roles)) nonces[role] = { address, latest: await provider.getTransactionCount(address, "latest"), pending: await provider.getTransactionCount(address, "pending") };
      const read = await gateway(); return { nonces, gatewayAcceptedRequests: read.acceptedRequests, gatewayLines: read.lines.length, gatewayJournalDigest: read.journalDigest,
        agentSpentRaw: agent.spentRaw, originalRequestIds: saved.runs.map(entry => entry.input.requestId) };
    };
    if (mode === "replay") {
      check(saved.runs.every(entry => entry.result?.status === "Succeeded" && entry.audit?.acceptancePassed) && !agent.activeRequestId, "HACKATHON_COMPLETED_ORIGINALS_REQUIRED");
      saved.replay ??= { before: await counters() }; await save();
      for (const entry of saved.runs) { await api(`/agents/${agent.id}/runs`, "POST", entry.input); const repeated = await wait(entry.input.requestId);
        assert.deepEqual(publicRun(repeated), publicRun(entry.result), "HACKATHON_REPLAY_CHANGED_RESULT"); }
      const refreshed = await api("/agents"); agent = refreshed.agents.find((value: HostedAgent) => value.id === agent.id);
      check(!agent.activeRequestId, "HACKATHON_REPLAY_CREATED_ACTIVE_REQUEST"); saved.replay.after = await counters();
      assert.deepEqual(saved.replay.after, saved.replay.before, "HACKATHON_REPLAY_CREATED_NEW_EFFECTS"); saved.replay.verifiedAt = new Date().toISOString(); await save();
    }
    const proofs = [], currentGateway = await gateway();
    for (const index of [0, 1] as const) {
      const entry = saved.runs[index];
      if (entry.result?.status === "Succeeded") { entry.audit = await collectHackathonTaskEvidence(saved, index, b, provider, currentGateway.lines); proofs.push(entry.audit); }
      else proofs.push({ acceptancePassed: false, run: publicRun(entry.result), requestId: entry.input.requestId });
    }
    const summary = { schemaVersion: 1, observedAt: new Date().toISOString(), origin: saved.origin, chainId: "10143", owner: saved.owner,
      agentId: agent.id, chainAgentId: agent.binding!.agentId, wallet: agent.wallet, mode: "Two explicit sequential metered-task requests, same Agent, bounded budget; no autonomous planner/game",
      initialCashRaw: "40000", perRunBudgetRaw: "120000", totalBudgetRaw: "240000", totalChargedRaw: saved.runs.reduce((sum, entry) => sum + BigInt(entry.result?.chargedRaw ?? "0"), 0n).toString(),
      acceptancePassed: proofs.length === 2 && proofs.every(proof => proof.acceptancePassed) && Boolean(saved.replay?.verifiedAt), tasks: proofs, replay: saved.replay,
      modelMode: "Real Kimi through deployed Magpie; canonical payment, saved physical responses, independent Docker/Arena", funding: saved.funded };
    await save(); await atomicJson(join(output, "credit-loop-public-summary.json"), summary); return summary;
  } finally { if (held) await store.close(); connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const mode = value("--mode"), runtime = value("--runtime"), output = value("--out");
  if (!runtime || !output || !["inspect", "prepare-tasks", "prepare-agent", "fund-agent", "run-one", "run-two", "recover-one", "recover-two", "evidence", "replay"].includes(mode ?? "")) {
    console.error("Usage: monad-hackathon-acceptance.ts --runtime ABS_RUNTIME --out ABS_NEW_PRIVATE_DIR --mode inspect|prepare-tasks|prepare-agent|fund-agent|run-one|run-two|recover-one|recover-two|evidence|replay [--bootstrap ABS_FILE] [--poster-key-file ABS_FILE] [--cash-source-key-file ABS_FILE] [--gas-source-key-file ABS_FILE] [--gas-wei RAW_UINT_MAX_600000000000000000] [--recover]"); process.exitCode = 1;
  } else monadHackathonAcceptance(mode as HackathonMode, { runtime, output, bootstrap: value("--bootstrap"), posterKeyFile: value("--poster-key-file"),
    cashSourceKeyFile: value("--cash-source-key-file"), gasSourceKeyFile: value("--gas-source-key-file"), gasWei: value("--gas-wei"), recover: args.includes("--recover") }).then(result => console.log(JSON.stringify(result))).catch(error => {
    const message = error instanceof Error ? error.message : "";
    console.error(/^[A-Z][A-Z0-9_]{1,120}$/.test(message) ? message : "HACKATHON_ACCEPTANCE_FAILED_INSPECT_ORIGINAL_PRIVATE_JOURNAL"); process.exitCode = 1;
  });
}
