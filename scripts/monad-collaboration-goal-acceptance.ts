import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Contract, Wallet, getAddress } from "ethers";
import { accountInterface, ACCOUNT_ABI, canonical, requestDigest, type Json } from "../packages/sdk/src/protocol.js";
import { atomicJson } from "../services/arena/src/protocol.js";
import { validateGoalView, type GoalView } from "../services/hosted-agents/src/goal-types.js";
import type { HostedAgent, HostedFinance, HostedRun } from "../services/hosted-agents/src/types.js";
import type { GoalCall, GoalModelRoute, GoalState } from "../services/hosted-agents/src/goals/executor.js";
import { parseMissionReview } from "../services/hosted-agents/src/goals/commander.js";
import { inspectGoalArtifact } from "../services/hosted-agents/src/goals/acceptance.js";
import { normalizeSpecialistOutput } from "../services/hosted-agents/src/specialists/execution.js";
import type { PaymentRecord } from "../services/provider-relay/src/store.js";
import { externalResultBinding } from "../services/hosted-agents/src/external/hiring.js";
import { monadProvider, readRpcUrlFile, type RpcTransport } from "./demo-rpc.js";

/** Explicit paid acceptance through the deployed frontend and Hosted pipeline.
 * UUIDs, owner wallet, goal text, Agent and budget are frozen before submission.
 * No direct model calls and no funding transaction are made by this script. */
export const collaborationOrigin = "https://monad.tabbyai.xyz";
const recordedCollaborationCases = {
  external: { modelId: "kimi-k2.6", budgetRaw: "60000", depositRaw: "60000", goal: "请由写作专家完成一份可以直接发给团队的中文产品更新，正文不超过220字。只使用以下我提供的事实：Tabby 工作台支持任务执行、独立复核以及付款凭证查看；这次验收发生在 Monad 测试网；用户可以在同一个工作台选择模型。请用一个标题、一个短段落和三项功能列表呈现。不得补充用户数量、收益、安全保证、发布日期或已经上线主网等信息。只需要一个写作专家阶段，之后由平台独立复核。" },
  fallback: { modelId: "kimi-k3", budgetRaw: "50000", depositRaw: "50000", goal: "请完成两个不同专家的顺序交付物，必须分为两个阶段：第一阶段由 analyst 分析，第二阶段由 writer 使用第一阶段的计算结果写给团队的简报，不要再添加第三个专家阶段。平台会另外独立复核。唯一数据：A 产品17单，每单10元；B 产品29单，每单10元。第一阶段计算总订单、两产品收入、总收入和B与A的订单差，并给出计算式；第二阶段保留这些准确结果，写一个不超过200字的中文简报，包含标记 TABBY-SAME-GOAL-20261015。不要声称联网、执行代码或发消息，不编造原因、趋势、日期与其他数据。" },
  "fallback-recheck": { modelId: "kimi-k3", budgetRaw: "50000", depositRaw: "50000", goal: "请完成恰好两个不同专家的顺序交付物：第一阶段 analyst，第二阶段 writer，不增加第三个专家；平台会另行独立复核。唯一原始数据：A产品17单，每单10元；B产品29单，每单10元。analyst需要计算并展示计算式：总订单46单，A收入170元，B收入290元，总收入460元，B与A的订单差12单。writer必须使用前一阶段结果并核对这些数值，只返回下面的极简简报模板，不添加标题、解释、计算式或Markdown装饰。第二阶段最终文本目标80–120个Unicode字符，总计不超过160字，标点、空格、换行和标记均计入；这只限制第二阶段最终文本，不限制第一阶段分析。模板如下：\nTABBY-SAME-GOAL-20261015\n订单合计46单；A收入170元，B收入290元，合计460元；B比A多12单。数据仅支持这些计算，不代表趋势或原因。以上结果已根据前一阶段计算整理，可供团队核对。\n不要声称联网、执行代码或发消息，不编造原因、趋势、日期或其他数据。" },
} as const;
/** A new acceptance may reuse the successful bounded prompt without first
 * creating a failed run. Its marker identifies the frozen prompt fixture;
 * request UUIDs, journal startedAt and fresh receipts identify the new run. */
export const collaborationCases = { ...recordedCollaborationCases, "fallback-fresh": recordedCollaborationCases["fallback-recheck"] } as const;
type CaseName = keyof typeof collaborationCases;
type Mode = "prepare" | "prepare-recheck" | "run" | "recover" | "audit" | "audit-failed";
interface PreviousFailed { requestId: string; reason: "HOSTED_GOAL_REVIEW_FAILED"; chargedRaw: "50000"; paymentIds: string[]; txHashes: string[] }
export interface SavedCase { create: Record<string, unknown> & { requestId: string }; deposit: { requestId: string; action: "deposit"; amountRaw: string }; goal: { requestId: string; action: "goal"; goal: string }; agent?: HostedAgent; provision?: HostedRun; depositResult?: HostedRun; result?: HostedRun; financeBefore?: HostedFinance; financeAfter?: HostedFinance; gatewayBefore?: { offset: number; acceptedRequests: number }; submittedAt?: string; audit?: unknown; retryOf?: string; previousFailed?: PreviousFailed }
export interface Journal { version: 1; origin: typeof collaborationOrigin; chainId: "10143"; runtime: string; owner: string; startedAt: string; cases: Partial<Record<CaseName, SavedCase>> }
export interface CollaborationAcceptanceOptions { runtime: string; output: string; mode: Mode; caseName?: CaseName; rpcUrlFile?: string; rpcTransport?: RpcTransport; waitMs?: number }
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const same = (a: string, b: string) => getAddress(a) === getAddress(b);
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
async function json<T = any>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")); }
async function missing(error: unknown) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return undefined; }
export function verifyCollaborationJournal(journal: Journal, runtime: string, owner: string) {
  assert.equal(journal.version, 1); assert.equal(journal.origin, collaborationOrigin); assert.equal(journal.chainId, "10143");
  assert.equal(journal.runtime, runtime); assert.ok(same(journal.owner, owner), "ACCEPTANCE_OWNER_CHANGED");
  for (const [name, entry] of Object.entries(journal.cases) as [CaseName, SavedCase][]) {
    const spec = collaborationCases[name]; assert.ok(spec, "ACCEPTANCE_CASE_UNKNOWN");
    assert.equal(entry.create.modelId, spec.modelId); assert.equal(entry.create.perRunBudgetRaw, spec.budgetRaw);
    assert.equal(entry.goal.goal, spec.goal); assert.equal(entry.goal.action, "goal");
    assert.equal(entry.deposit.amountRaw, spec.depositRaw); assert.equal(entry.deposit.action, "deposit");
    for (const id of [entry.create.requestId, entry.goal.requestId, entry.deposit.requestId]) assert.match(id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    if (entry.agent) { assert.ok(same(entry.agent.owner, owner)); assert.equal(entry.agent.modelId, spec.modelId); }
    if (name === "fallback-fresh") {
      assert.equal(entry.retryOf, undefined, "FRESH_FALLBACK_IS_NOT_A_RECHECK"); assert.equal(entry.previousFailed, undefined, "FRESH_FALLBACK_IS_NOT_A_RECHECK");
      assert.equal(new Set([entry.create.requestId, entry.deposit.requestId, entry.goal.requestId]).size, 3, "FRESH_FALLBACK_UUID_COLLISION");
      assert.equal(entry.create.totalBudgetRaw, spec.budgetRaw, "FRESH_FALLBACK_CUMULATIVE_BUDGET_CHANGED");
      assert.equal(entry.create.allowCredit, false, "FRESH_FALLBACK_CASH_ONLY_REQUIRED");
      for (const [otherName, other] of Object.entries(journal.cases)) if (otherName !== name && other) {
        assert.ok(![other.create.requestId, other.deposit.requestId, other.goal.requestId].some(id => [entry.create.requestId, entry.deposit.requestId, entry.goal.requestId].includes(id)), "FRESH_FALLBACK_ORIGINAL_UUID_COLLISION");
        if (other.agent && entry.agent) { assert.notEqual(other.agent.id, entry.agent.id, "FRESH_FALLBACK_ORIGINAL_AGENT_COLLISION"); assert.ok(!same(other.agent.wallet, entry.agent.wallet), "FRESH_FALLBACK_ORIGINAL_WALLET_COLLISION"); }
      }
    }
    if (name === "fallback-recheck") {
      const original = journal.cases.fallback; assert.ok(original?.agent && entry.agent, "RECHECK_ORIGINAL_AGENT_REQUIRED");
      assert.equal(entry.retryOf, original.goal.requestId); assert.deepEqual(entry.create, original.create);
      assert.equal(entry.agent.id, original.agent.id); assert.ok(same(entry.agent.wallet, original.agent.wallet));
      assert.notEqual(entry.goal.requestId, original.goal.requestId); assert.notEqual(entry.deposit.requestId, original.deposit.requestId);
      assert.equal(entry.previousFailed?.requestId, original.goal.requestId); assert.equal(entry.previousFailed?.chargedRaw, "50000");
      assert.equal(entry.previousFailed?.reason, "HOSTED_GOAL_REVIEW_FAILED");
      assert.ok(original.result, "RECHECK_ORIGINAL_FAILED_RESULT_REQUIRED"); const rejected = verifyRejectedFallback(original.result);
      assert.deepEqual(entry.previousFailed.paymentIds, rejected.calls.map(call => call.paymentId)); assert.deepEqual(entry.previousFailed.txHashes, rejected.calls.map(call => call.txHash));
    }
  }
}
export function verifyCollaborationMission(name: CaseName, run: HostedRun): GoalView {
  assert.equal(run.status, "Succeeded", `CASE_NOT_SUCCEEDED:${run.requestId}:${run.status}:${run.reason ?? ""}`);
  assert.equal(run.result?.success, true); assert.equal(run.result?.terminal, true);
  const mission = validateGoalView(run.mission ?? run.result!.mission!);
  assert.equal(mission.stage, "completed"); assert.equal(mission.review?.passed, true);
  assert.ok(mission.answer?.trim()); assert.ok(mission.phases.every(phase => phase.output?.trim()), "EXPERT_OUTPUT_REQUIRED");
  assert.ok(mission.calls.length >= 3 && mission.calls.every(call => call.promptTokens > 0 && call.completionTokens > 0));
  if (name.startsWith("fallback")) assert.equal(mission.phases.length, 2, "TWO_SEQUENTIAL_CONTEXT_PHASES_REQUIRED");
  const stages = ["plan", ...mission.phases.map((_, index) => `phase-${index}`), "review"];
  const revised = mission.calls.some(call => call.stage === "revision" || call.stage === "revision-review");
  assert.deepEqual(mission.calls.map(call => call.stage), revised ? [...stages, "revision", "revision-review"] : stages, "COLLABORATION_CALL_SEQUENCE_CHANGED");
  if (name.startsWith("fallback")) assert.deepEqual(mission.calls.map(call => call.stage), ["plan", "phase-0", "phase-1", "review"], "FALLBACK_ORIGINAL_FOUR_CALLS_REQUIRED");
  assert.ok(mission.calls.filter(call => !call.stage.startsWith("phase-")).every(call => !call.external), "INDEPENDENT_HOST_REVIEW_REQUIRED");
  assert.ok(mission.calls.every(call => call.paymentId && call.txHash && call.requestDigest), "ORIGINAL_PAID_CALL_PROOFS_REQUIRED");
  assert.equal(new Set(mission.calls.map(call => call.paymentId)).size, mission.calls.length, "DUPLICATE_GOAL_PAYMENT");
  assert.equal(new Set(mission.calls.map(call => call.txHash)).size, mission.calls.length, "DUPLICATE_GOAL_TRANSACTION");
  if (!revised) assert.equal(mission.answer, mission.phases.at(-1)?.output, "ORIGINAL_ARTIFACT_CHANGED");
  const external = mission.calls.filter(call => call.external);
  assert.ok(external.length > 0, "REAL_EXTERNAL_HIRE_REQUIRED");
  for (const call of external) { assert.equal(call.external!.service.identity?.chainId, "10143"); assert.equal(call.external!.service.identity?.agentId, "1999"); }
  const charged = mission.calls.reduce((sum, call) => sum + BigInt(call.chargedRaw), 0n);
  assert.equal(charged.toString(), run.result!.chargedRaw); assert.equal(charged.toString(), run.chargedRaw); assert.ok(charged <= BigInt(collaborationCases[name].budgetRaw));
  if (name.startsWith("fallback")) {
    assert.equal(mission.calls[0].model, "kimi-k3"); assert.equal(mission.calls[0].chargedRaw, "20000");
    assert.equal(mission.phases[0].taskType, "analyst"); assert.equal(mission.phases[1].taskType, "writer");
    assert.ok(mission.calls.slice(1).every(call => call.model === "kimi-k2.6" && call.chargedRaw === "10000"), "SAME_GOAL_BUDGET_DOWNGRADE_REQUIRED");
    assert.equal(charged, 50000n); assert.match(mission.answer!, /TABBY-SAME-GOAL-20261015/);
    if (name === "fallback-recheck" || name === "fallback-fresh") {
      const characters = Array.from(mission.answer!).length; assert.ok(characters >= 80 && characters <= 120 && characters <= 160, "RECHECK_FINAL_CHARACTER_LIMIT_REQUIRED");
      for (const number of ["46", "170", "290", "460", "12"]) assert.ok(mission.answer!.includes(number), "RECHECK_REQUIRED_CALCULATION_MISSING");
    }
  }
  return mission;
}

/** Bind a permitted revision to the original artifact, failed first review and
 * independently reviewed final output. Public evidence contains only digests;
 * original outputs and physical responses remain in their existing journals. */
export function collaborationRevisionEvidence(mission: GoalView, saved: Pick<GoalState, "calls" | "input" | "research">) {
  assert.deepEqual(saved.calls.map(call => call.stage), mission.calls.map(call => call.stage), "PRIVATE_GOAL_CALL_SEQUENCE_CHANGED");
  const revision = saved.calls.find(call => call.stage === "revision");
  if (!revision) return { performed: false as const };
  const original = mission.phases.at(-1)!.output!, final = mission.answer!, originalReview = saved.calls.find(call => call.stage === "review")!, finalReview = saved.calls.find(call => call.stage === "revision-review")!;
  assert.ok(originalReview?.response && revision.response && finalReview?.response, "REVISION_DELIVERY_PROOFS_REQUIRED");
  const initialInput = JSON.parse(originalReview.messages[1].content), revisionInput = JSON.parse(revision.messages[1].content), finalInput = JSON.parse(finalReview.messages[1].content);
  for (const input of [initialInput, revisionInput, finalInput]) assert.equal(input.originalGoal, saved.input.goal, "REVISION_ORIGINAL_GOAL_CHANGED");
  assert.equal(initialInput.artifact, original, "INITIAL_REVIEW_ARTIFACT_CHANGED");
  assert.equal(revisionInput.artifact, original, "REVISION_ORIGINAL_ARTIFACT_CHANGED");
  const firstReview = parseMissionReview(originalReview.response.text), measurement = inspectGoalArtifact(saved.input.goal, original, saved.research?.evidence.observedAt);
  if (measurement.failures.length) {
    firstReview.passed = false; firstReview.summary = `验收未通过：${measurement.failures.join(" ")}`.slice(0, 4000);
    firstReview.checks = [...measurement.failures, ...firstReview.checks].slice(0, 20).map(check => check.slice(0, 1000));
  }
  assert.equal(firstReview.passed, false, "REVISION_REQUIRES_FAILED_FIRST_REVIEW");
  assert.deepEqual(revisionInput.review, firstReview, "REVISION_REVIEW_FEEDBACK_CHANGED");
  assert.equal(normalizeSpecialistOutput(mission.phases.at(-1)!.taskType, revision.response.text), final, "REVISION_FINAL_OUTPUT_CHANGED");
  assert.equal(finalInput.artifact, final, "REVISION_REVIEW_ARTIFACT_CHANGED");
  assert.deepEqual(parseMissionReview(finalReview.response.text), mission.review, "REVISION_INDEPENDENT_REVIEW_CHANGED");
  assert.deepEqual(inspectGoalArtifact(saved.input.goal, final, saved.research?.evidence.observedAt).failures, [], "REVISION_FINAL_CONSTRAINT_FAILED");
  return { performed: true as const, count: 1, original: { stage: `phase-${mission.phases.length - 1}`, sha256: sha(original), characters: original.length },
    revised: { stage: revision.stage, sha256: sha(final), characters: final.length },
    firstReview: { stage: originalReview.stage, passed: false, checkCount: firstReview.checks.length },
    finalReview: { stage: finalReview.stage, passed: true, checkCount: mission.review!.checks.length } };
}

/** Freeze a new preparation before any create POST; repeated preparation uses
 * the same three IDs. Old journals and their original failed goal stay intact. */
export function prepareCollaborationCase(journal: Journal, name: Exclude<CaseName, "fallback-recheck">): SavedCase {
  verifyCollaborationJournal(journal, journal.runtime, journal.owner);
  const existing = journal.cases[name]; if (existing) return existing;
  const date = new Date(journal.startedAt); assert.ok(Number.isFinite(date.getTime()), "ACCEPTANCE_STARTED_AT_INVALID");
  const spec = collaborationCases[name], label = date.toISOString().slice(0, 10).replaceAll("-", "");
  const entry: SavedCase = { create: { requestId: randomUUID(), name: `Tabby Monad ${name} ${label}`, modelId: spec.modelId, strategy: "balanced", perRunBudgetRaw: spec.budgetRaw, totalBudgetRaw: name === "fallback-fresh" ? spec.budgetRaw : "200000", allowCredit: false }, deposit: { requestId: randomUUID(), action: "deposit", amountRaw: spec.depositRaw }, goal: { requestId: randomUUID(), action: "goal", goal: spec.goal } };
  journal.cases[name] = entry; verifyCollaborationJournal(journal, journal.runtime, journal.owner); return entry;
}

/** A rejected, fully paid original run is retained as a failed acceptance,
 * never converted into a successful run or resumed under a changed goal. */
export function verifyRejectedFallback(run: HostedRun): GoalView {
  assert.equal(run.status, "Failed", "RECHECK_ORIGINAL_MUST_BE_TERMINAL_FAILED"); assert.equal(run.reason, "HOSTED_GOAL_REVIEW_FAILED");
  assert.equal(run.result?.terminal, true); assert.equal(run.result?.success, false); assert.equal(run.result?.reason, "HOSTED_GOAL_REVIEW_FAILED");
  assert.equal(run.result?.chargedRaw, "50000");
  const mission = validateGoalView(run.mission ?? run.result!.mission!); assert.equal(mission.stage, "completed"); assert.equal(mission.review?.passed, false);
  assert.equal(mission.calls.length, 4); assert.deepEqual(mission.calls.map(call => [call.stage, call.model, call.chargedRaw]), [["plan", "kimi-k3", "20000"], ["phase-0", "kimi-k2.6", "10000"], ["phase-1", "kimi-k2.6", "10000"], ["review", "kimi-k2.6", "10000"]]);
  assert.ok(mission.calls.every(call => call.paymentId && call.txHash), "RECHECK_ORIGINAL_FOUR_PAYMENTS_REQUIRED");
  return mission;
}
export function prepareFallbackRecheckCase(journal: Journal, agent: HostedAgent, originalRun: HostedRun, provision: HostedRun): SavedCase {
  const original = journal.cases.fallback; assert.ok(original?.agent && original.result, "RECHECK_ORIGINAL_HISTORY_REQUIRED");
  assert.equal(originalRun.requestId, original.goal.requestId); assert.equal(originalRun.goal, collaborationCases.fallback.goal);
  const rejected = verifyRejectedFallback(originalRun); assert.deepEqual(originalRun.result, original.result.result, "RECHECK_ORIGINAL_RESULT_CHANGED");
  assert.equal(agent.id, original.agent.id); assert.equal(originalRun.agentId, agent.id); assert.ok(same(agent.wallet, original.agent.wallet) && same(agent.owner, journal.owner));
  assert.equal(agent.modelId, "kimi-k3"); assert.equal(agent.perRunBudgetRaw, "50000"); assert.equal(agent.totalBudgetRaw, original.agent.totalBudgetRaw);
  assert.equal(provision.requestId, original.create.requestId); assert.equal(provision.status, "Succeeded");
  const existing = journal.cases["fallback-recheck"];
  if (existing) { verifyCollaborationJournal(journal, journal.runtime, journal.owner); return existing; }
  assert.ok(!agent.activeRequestId, "RECHECK_ORIGINAL_AGENT_BUSY"); assert.ok(BigInt(agent.spentRaw) >= 50000n);
  const entry: SavedCase = { create: structuredClone(original.create), agent: structuredClone(agent), provision: structuredClone(provision), deposit: { requestId: randomUUID(), action: "deposit", amountRaw: "50000" }, goal: { requestId: randomUUID(), action: "goal", goal: collaborationCases["fallback-recheck"].goal }, retryOf: original.goal.requestId, previousFailed: { requestId: original.goal.requestId, reason: "HOSTED_GOAL_REVIEW_FAILED", chargedRaw: "50000", paymentIds: rejected.calls.map(call => call.paymentId!), txHashes: rejected.calls.map(call => call.txHash!) } };
  journal.cases["fallback-recheck"] = entry; verifyCollaborationJournal(journal, journal.runtime, journal.owner); return entry;
}

/** The deployed catalog may use cheap/strong route IDs while public mission
 * calls use Kimi model IDs. Resolve only the exact frozen physical route and
 * its original named port; never scan or guess a payment journal directory. */
export function goalRelayJournalDirectory(runtime: string, publicModel: string, call: GoalCall,
  gateway: { models: { id: string; model: string; responseModel?: string }[] },
  configured: GoalModelRoute[], readyPorts: Record<string, number>, originalPorts: Record<string, number>) {
  const route = call.route, receipt = call.inference?.receipt;
  assert.ok(route && receipt && call.handle, "GOAL_AUDIT_FROZEN_ROUTE_REQUIRED");
  assert.equal(route.id, publicModel, "GOAL_AUDIT_PUBLIC_MODEL_CHANGED");
  const approved = configured.filter(model => model.id === publicModel);
  assert.equal(approved.length, 1, "GOAL_AUDIT_CONFIGURED_ROUTE_AMBIGUOUS"); assert.deepEqual(route, approved[0], "GOAL_AUDIT_CONFIGURED_ROUTE_CHANGED");
  assert.equal(gateway.models.length, 2, "GOAL_AUDIT_TWO_GATEWAY_MODELS_REQUIRED");
  const matches = gateway.models.map((model, index) => ({ model, index })).filter(entry => entry.model.model === receipt.model);
  assert.equal(matches.length, 1, "GOAL_AUDIT_PHYSICAL_ROUTE_AMBIGUOUS");
  const { model, index } = matches[0]; assert.match(model.id, /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "GOAL_AUDIT_CATALOG_ID_INVALID");
  assert.equal(model.model, route.physicalModel); assert.equal(model.id, route.model); assert.equal(model.id, call.handle.quote.model);
  assert.equal(model.responseModel ?? model.model, route.responseModel ?? route.physicalModel);
  const name = index === 0 ? "goalCheap" : "goalStrong", port = readyPorts[name];
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535, "GOAL_AUDIT_NAMED_PORT_INVALID");
  assert.equal(originalPorts[name], port, "GOAL_AUDIT_NAMED_PORT_CHANGED");
  assert.equal(route.relayUrl, `http://127.0.0.1:${port}/v1/chat`, "GOAL_AUDIT_ROUTE_ENDPOINT_CHANGED");
  assert.equal(call.handle.relayUrl, route.relayUrl, "GOAL_AUDIT_PAID_ENDPOINT_CHANGED");
  return join(runtime, `goal-${model.id}`);
}

export async function runMonadCollaborationGoalAcceptance(options: CollaborationAcceptanceOptions) {
  assert.ok(isAbsolute(options.runtime) && isAbsolute(options.output), "ABSOLUTE_RUNTIME_AND_OUTPUT_REQUIRED");
  const runtime = resolve(options.runtime), output = resolve(options.output);
  const bootstrap = await json(join(runtime, "..", "bootstrap.json"));
  assert.equal(bootstrap.chainId, "10143"); assert.equal(bootstrap.frontendOrigin, collaborationOrigin);
  assert.equal(bootstrap.externalProvider?.agentId, "1999", "EXTERNAL_PROVIDER_MUST_BE_PREPARED");
  assert.ok(!same(bootstrap.externalProvider.wallet, bootstrap.payTo));
  await mkdir(output, { recursive: true, mode: 0o700 }); await chmod(output, 0o700);
  const keyFile = join(output, "owner.key"), journalFile = join(output, "journal.json");
  let key = await readFile(keyFile, "utf8").catch(missing);
  if (!key) { assert.equal(options.mode, "prepare", "PREPARE_WITH_ORIGINAL_OWNER_FIRST"); const owner = Wallet.createRandom(); await writeFile(keyFile, owner.privateKey + "\n", { mode: 0o600, flag: "wx" }); key = owner.privateKey; }
  const owner = new Wallet(key.trim());
  let journal = await json<Journal>(journalFile).catch(missing);
  if (!journal) { assert.equal(options.mode, "prepare"); journal = { version: 1, origin: collaborationOrigin, chainId: "10143", runtime, owner: owner.address, startedAt: new Date().toISOString(), cases: {} }; }
  const state = journal; verifyCollaborationJournal(state, runtime, owner.address);
  const save = () => atomicJson(journalFile, state);
  let cookie = "";
  async function api(path: string, method = "GET", body?: unknown): Promise<any> {
    const response = await fetch(`${collaborationOrigin}/api/hosted${path}`, { method, redirect: "error", headers: { origin: collaborationOrigin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.endsWith("/finance") ? 90000 : 30000) });
    const result = await response.json();
    // Do not print upstream response text: it may contain private model content.
    assert.ok(response.ok, `ACCEPTANCE_HTTP_${response.status}:${method}:${path}:${typeof result?.error?.code === "string" ? result.error.code : typeof result?.error === "string" && /^[A-Z_0-9]+$/.test(result.error) ? result.error : "RESPONSE_REJECTED"}`);
    if (path === "/auth/login") { const saved = response.headers.get("set-cookie"); assert.ok(saved); assert.ok(saved.startsWith("agentfuel_hosted_session=")); cookie = saved.split(";")[0]; }
    return result;
  }
  const challenge = await api("/auth/challenge", "POST", { wallet: owner.address });
  assert.ok(challenge.message.startsWith(`AgentFuel hosted agent login\nOrigin: ${collaborationOrigin}\nWallet: ${owner.address}\nChain: 10143\nNonce: `));
  assert.ok(challenge.message.endsWith("This signature authenticates your platform account. It authorizes no blockchain transaction."));
  await api("/auth/login", "POST", { challengeId: challenge.id, signature: await owner.signMessage(challenge.message) });
  // Retain locally for optional authenticated browser QA; never include publicly.
  await writeFile(join(output, "browser-cookie.txt"), cookie + "\n", { mode: 0o600 });
  async function snapshot() { return await api("/agents") as { agents: HostedAgent[]; runs: HostedRun[]; capabilities?: any }; }
  async function wait(requestId: string, waitMs = options.waitMs ?? 1_200_000) {
    let last = "";
    for (const deadline = Date.now() + waitMs; Date.now() < deadline;) {
      const run = (await snapshot()).runs.find(value => value.requestId === requestId);
      const status = JSON.stringify({ requestId, status: run?.status, stage: run?.mission?.stage, paidCalls: run?.mission?.calls.length, reason: run?.reason });
      if (status !== last) { console.log(status); last = status; }
      if (run && !["Queued", "Running"].includes(run.status)) return run;
      await sleep(3000);
    }
    throw new Error(`ACCEPTANCE_WAIT_TIMEOUT_RECOVER_ORIGINAL_UUID:${requestId}`);
  }
  async function getGateway() {
    const gateway = await json(bootstrap.gatewayReadyFile);
    const response = await fetch(gateway.bridgeHealthUrl ?? "http://127.0.0.1:3427/health", { signal: AbortSignal.timeout(10000) });
    assert.ok(response.ok); const health: any = await response.json(); assert.equal(health.ready, true);
    const lines = (await readFile(join(dirname(bootstrap.gatewayReadyFile), "attempts.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert.equal(health.acceptedRequests, lines.filter(line => line.phase === "DispatchIntent").length);
    return { health, lines };
  }
  if (options.mode === "prepare-recheck") {
    assert.ok(options.caseName === undefined || options.caseName === "fallback-recheck", "PREPARE_RECHECK_CASE_REQUIRED");
    const original = state.cases.fallback; assert.ok(original?.agent, "RECHECK_ORIGINAL_AGENT_REQUIRED");
    const current = await snapshot(), agent = current.agents.find(value => value.id === original.agent!.id), originalRun = current.runs.find(value => value.requestId === original.goal.requestId), provision = current.runs.find(value => value.requestId === original.create.requestId);
    assert.ok(agent && originalRun && provision, "RECHECK_ORIGINAL_HISTORY_REQUIRED");
    const entry = prepareFallbackRecheckCase(state, agent, originalRun, provision); await save();
    console.log(JSON.stringify({ prepared: "fallback-recheck", agentId: entry.agent!.id, wallet: entry.agent!.wallet, owner: owner.address, retryOf: entry.retryOf, previousFailedChargedRaw: entry.previousFailed!.chargedRaw, originalProvisionRequestId: entry.create.requestId, goalRequestId: entry.goal.requestId, depositRequestId: entry.deposit.requestId, depositRaw: entry.deposit.amountRaw, maxGoalSpendRaw: "50000", combinedGoalSpendCeilingRaw: "100000", newAgents: 0, newModelRequests: 0, next: "Operator funds only 50000 test-USDC to the same wallet; run --case fallback-recheck uses its saved new deposit and goal UUIDs." }));
    return [];
  }
  if (options.mode === "audit-failed") assert.equal(options.caseName, "fallback", "AUDIT_FAILED_ORIGINAL_FALLBACK_ONLY");
  const names: CaseName[] = options.caseName ? [options.caseName] : ["external", "fallback"];
  const publicResults: unknown[] = [];
  for (const name of names) {
    const spec = collaborationCases[name]; let entry = state.cases[name];
    if (!entry) {
      if (name === "fallback-recheck") throw new Error("USE_PREPARE_RECHECK_NO_NEW_AGENT");
      assert.equal(options.mode, "prepare", "PREPARE_REQUIRED_NO_REPLACEMENT_UUID");
      entry = prepareCollaborationCase(state, name); await save();
    }
    if (options.mode === "prepare") {
      // A lost create response is replayed with its original creation UUID.
      entry.agent ??= await api("/agents", "POST", entry.create); await save();
      entry.provision = await wait(entry.create.requestId); await save();
      console.log(JSON.stringify({ prepared: name, owner: owner.address, agentId: entry.agent!.id, wallet: entry.agent!.wallet, provisionStatus: entry.provision.status, provisionReason: entry.provision.reason, modelId: spec.modelId, goalRequestId: entry.goal.requestId, depositRequestId: entry.deposit.requestId, depositRaw: spec.depositRaw, maxGoalSpendRaw: spec.budgetRaw, next: "Operator must fund this original Agent wallet; run then resumes its original provision/deposit/goal UUIDs." }));
      continue;
    }
    assert.ok(entry.agent, "PREPARE_ORIGINAL_AGENT_FIRST");
    const agent = entry.agent;
    if (options.mode === "run" || options.mode === "recover") {
      let current = await snapshot(); const currentAgent = current.agents.find(value => value.id === agent.id);
      assert.ok(currentAgent && same(currentAgent.wallet, agent.wallet) && same(currentAgent.owner, owner.address));
      assert.equal(currentAgent.modelId, spec.modelId); assert.equal(currentAgent.perRunBudgetRaw, spec.budgetRaw);
      if (name === "fallback-recheck") {
        const originalCase = state.cases.fallback!, failed = current.runs.find(value => value.requestId === entry.retryOf);
        assert.ok(failed); verifyRejectedFallback(failed); assert.deepEqual(failed.result, originalCase.result!.result, "RECHECK_ORIGINAL_RESULT_CHANGED");
      }
      let provision = current.runs.find(value => value.requestId === entry.create.requestId); assert.ok(provision);
      if (provision.status === "Paused") { await api(`/agents/${agent.id}/runs`, "POST", { action: "provision", requestId: entry.create.requestId }); provision = await wait(entry.create.requestId); }
      else if (["Queued", "Running"].includes(provision.status)) provision = await wait(entry.create.requestId);
      entry.provision = provision; await save(); assert.equal(provision.status, "Succeeded", `ORIGINAL_PROVISION_NOT_READY:${provision.reason ?? provision.status}`);
      current = await snapshot(); entry.agent = current.agents.find(value => value.id === agent.id)!; await save();
      let deposit = current.runs.find(value => value.requestId === entry.deposit.requestId);
      if (!deposit || deposit.status === "Paused") await api(`/agents/${agent.id}/runs`, "POST", entry.deposit);
      if (!deposit || ["Queued", "Running", "Paused"].includes(deposit.status)) deposit = await wait(entry.deposit.requestId);
      entry.depositResult = deposit; await save(); assert.equal(deposit.status, "Succeeded", `ORIGINAL_DEPOSIT_NOT_READY:${deposit.reason ?? deposit.status}`);
      current = await snapshot(); let original = current.runs.find(value => value.requestId === entry.goal.requestId);
      if (!original) {
        // Save financial and model boundaries before the first paid submission.
        entry.financeBefore ??= await api(`/agents/${agent.id}/finance`); assert.equal(entry.financeBefore!.status, "confirmed");
        if (name === "fallback-fresh") {
          const healthy = current.agents.find(value => value.id === agent.id); assert.ok(healthy && healthy.status === "Ready" && !healthy.activeRequestId, "FRESH_FALLBACK_AGENT_NOT_READY");
          assert.equal(healthy.spentRaw, "0", "FRESH_FALLBACK_AGENT_ALREADY_SPENT"); assert.equal(healthy.totalBudgetRaw, spec.budgetRaw, "FRESH_FALLBACK_CUMULATIVE_BUDGET_CHANGED"); assert.equal(healthy.allowCredit, false, "FRESH_FALLBACK_CASH_ONLY_REQUIRED");
          assert.equal((entry.financeBefore as Extract<HostedFinance, { status: "confirmed" }>).debtRaw, "0", "FRESH_FALLBACK_AGENT_HAS_DEBT");
        }
        const before = await getGateway(); entry.gatewayBefore ??= { offset: before.lines.length, acceptedRequests: before.health.acceptedRequests };
        entry.submittedAt ??= new Date().toISOString(); await save();
        await api(`/agents/${agent.id}/runs`, "POST", entry.goal);
      } else if (original.status === "Paused") {
        assert.equal(options.mode, "recover", `ORIGINAL_PAUSED_USE_RECOVER:${original.reason ?? "UNKNOWN"}`);
        await api(`/agents/${agent.id}/runs`, "POST", entry.goal);
      }
      original = await wait(entry.goal.requestId); entry.result = original;
      entry.financeAfter = await api(`/agents/${agent.id}/finance`); await save();
      verifyCollaborationMission(name, original);
      console.log(JSON.stringify({ completed: name, requestId: original.requestId, agentId: agent.id, chainAgentId: entry.agent!.binding?.agentId, status: original.status, chargedRaw: original.result!.chargedRaw, modelSequence: original.mission!.calls.map(call => call.model), independentReview: original.mission!.review?.passed }));
      continue;
    }

    const original = (await snapshot()).runs.find(value => value.requestId === entry.goal.requestId); assert.ok(original);
    const mission: GoalView = options.mode === "audit-failed" ? verifyRejectedFallback(original) : verifyCollaborationMission(name, original); entry.result = original;
    const savedMission = await json<GoalState>(join(runtime, "hosted", "agents", agent.id, "runs", entry.goal.requestId, "mission", "session.json"));
    const runtimeReady = await json(join(runtime, "ready.json")), runtimeJournal = await json(join(runtime, "runtime-journal", "session.json"));
    assert.equal(runtimeReady.hostedConfigFile, join(runtime, "hosted.json"));
    const daemonConfig = await json(runtimeReady.hostedConfigFile), gatewayConfig = await json(bootstrap.gatewayReadyFile);
    assert.equal(savedMission.input.goal, entry.goal.goal); assert.equal(savedMission.input.agentId, agent.id); assert.ok(same(savedMission.input.wallet, agent.wallet));
    assert.equal(savedMission.input.reservedRaw, spec.budgetRaw); assert.equal(savedMission.route.id, spec.modelId);
    assert.deepEqual(savedMission.view, mission);
    const revision = collaborationRevisionEvidence(mission, savedMission);
    let previousOutputPreserved = !name.startsWith("fallback");
    if (name.startsWith("fallback")) {
      const second = savedMission.calls.find(call => call.stage === "phase-1"); assert.ok(second);
      const assignment = JSON.parse(second.messages[1].content);
      assert.equal(assignment.previous[0].output, mission.phases[0].output); previousOutputPreserved = true;
      assert.ok(mission.calls.some(call => call.stage === "review" && call.model === "kimi-k2.6"));
      assert.ok(original.activities?.some(activity => activity.reason === "HOSTED_GOAL_MODEL_DOWNGRADED"), "MODEL_DOWNGRADE_ACTIVITY_REQUIRED");
    }
    const connection = await monadProvider(await readRpcUrlFile(options.rpcUrlFile ?? bootstrap.rpcUrlFile), options.rpcTransport ?? bootstrap.rpcTransport);
    try {
      const provider = connection.provider; assert.equal(BigInt(await provider.send("eth_chainId", [])), 10143n);
      const account = new Contract(bootstrap.contracts.account, ACCOUNT_ABI, provider);
      const identity = new Contract(bootstrap.identity, ["function getAgentWallet(uint256) view returns(address)"], provider);
      const canonicalWallet = await identity.getFunction("getAgentWallet").staticCall("1999"); assert.ok(same(canonicalWallet, bootstrap.externalProvider.wallet));
      const payments: unknown[] = [], usedAttempts = new Set<number>();
      const gateway = await getGateway();
      assert.ok(entry.gatewayBefore && Number.isSafeInteger(entry.gatewayBefore.offset), "ORIGINAL_GATEWAY_BASELINE_REQUIRED");
      const candidateResponses = gateway.lines.slice(entry.gatewayBefore.offset).filter(line => line.phase === "Response" && line.httpStatus === 200);
      for (const call of mission.calls) {
        assert.ok(call.txHash && call.paymentId && call.requestDigest);
        const privateCall = savedMission.calls.find(value => value.stage === call.stage); assert.ok(privateCall?.inference && privateCall.handle);
        const quote = privateCall.handle.quote, receipt = privateCall.inference.receipt;
        assert.equal(quote.paymentId, call.paymentId); assert.equal(quote.requestDigest, call.requestDigest); assert.equal(requestDigest(privateCall.handle.input), quote.requestDigest);
        assert.equal(receipt.txHash, call.txHash); assert.equal(receipt.agentId, entry.agent!.binding!.agentId); assert.equal(receipt.fromCash, call.chargedRaw); assert.equal(receipt.fromCredit, "0"); assert.equal(receipt.taskId, "0");
        assert.ok(same(quote.account, bootstrap.contracts.account)); assert.ok(same(quote.asset, bootstrap.asset.address));
        assert.ok(same(quote.payTo, call.external ? bootstrap.externalProvider.wallet : bootstrap.payTo));
        const payment = await account.getFunction("getPayment").staticCall(call.paymentId);
        assert.equal(String(payment.agentId), entry.agent!.binding!.agentId); assert.equal(payment.taskId, 0n); assert.equal(String(payment.fromCash), call.chargedRaw); assert.equal(payment.fromCredit, 0n); assert.equal(payment.refundedAmount, 0n);
        const chainReceipt = await provider.getTransactionReceipt(call.txHash); assert.ok(chainReceipt && chainReceipt.status === 1);
        assert.equal((await provider.getBlock(chainReceipt.blockNumber))?.hash, chainReceipt.blockHash); assert.ok(same(chainReceipt.from, agent.wallet));
        const paid = chainReceipt.logs.filter(log => same(log.address, bootstrap.contracts.account)).flatMap(log => { try { const event = accountInterface.parseLog(log); return event?.name === "ProviderPaid" ? [event] : []; } catch { return []; } });
        assert.equal(paid.length, 1); assert.equal(paid[0].args.paymentId, call.paymentId); assert.equal(String(paid[0].args.agentId), entry.agent!.binding!.agentId); assert.ok(same(paid[0].args.provider, quote.payTo));
        assert.equal(String(paid[0].args.fromCash), call.chargedRaw); assert.equal(paid[0].args.fromCredit, 0n);
        const relayDirectory = call.external ? join(runtime, "external-services", call.external.service.id)
          : goalRelayJournalDirectory(runtime, call.model, privateCall, gatewayConfig, daemonConfig.goals.models, runtimeReady.ports, runtimeJournal.ports);
        const relayRecord = await json<PaymentRecord>(join(relayDirectory, `${call.paymentId}.json`));
        assert.equal(relayRecord.state, "Delivered"); assert.deepEqual(relayRecord.quote, quote); assert.deepEqual(relayRecord.receipt, receipt); assert.deepEqual(relayRecord.result, privateCall.inference.result);
        assert.equal(requestDigest(relayRecord.request), quote.requestDigest); assert.deepEqual(relayRecord.request, privateCall.handle.input);
        assert.equal(relayRecord.upstreamAttempts?.length, 1); assert.equal(relayRecord.upstreamAttempts[0].state, "Delivered");
        if (call.external) {
          const hire = savedMission.externalHires?.[call.stage]; assert.ok(hire, "FROZEN_EXTERNAL_SELECTION_REQUIRED");
          const discovered = savedMission.externalServices?.find(service => service.service.id === call.external!.service.id); assert.ok(discovered, "ACTUAL_EXTERNAL_DISCOVERY_REQUIRED");
          assert.deepEqual(discovered, hire.service); assert.deepEqual(hire.service.service, call.external.service);
          const provenance = externalResultBinding(hire.service.trust, privateCall.messages);
          assert.equal(provenance.assignmentDigest, call.external.assignmentDigest); assert.equal(provenance.promptDigest, call.external.promptDigest);
          assert.deepEqual((privateCall.inference.result as Record<string, Json>).externalService, provenance);
        }
        const { externalService: _binding, ...modelResult } = privateCall.inference.result as Record<string, Json>;
        let match: any;
        for (const response of candidateResponses) {
          if (usedAttempts.has(response.attempt) || response.model !== call.model) continue;
          const raw = await readFile(join(dirname(bootstrap.gatewayReadyFile), "responses", `attempt-${response.attempt}.json`), "utf8");
          assert.equal(sha(raw), response.responseDigest);
          if (canonical(JSON.parse(raw)) !== canonical(modelResult)) continue;
          const dispatch = gateway.lines.find(line => line.phase === "DispatchIntent" && line.attempt === response.attempt); assert.ok(dispatch && dispatch.model === call.model);
          match = { attempt: response.attempt, model: response.model, requestDigest: dispatch.requestDigest, responseDigest: response.responseDigest, httpStatus: response.httpStatus, ...(response.providerRequestId ? { providerRequestId: response.providerRequestId } : {}), usage: response.usage };
          break;
        }
        assert.ok(match, `REAL_GATEWAY_RESPONSE_MAPPING_REQUIRED:${call.stage}`); usedAttempts.add(match.attempt);
        payments.push({ stage: call.stage, modelId: call.model, physicalModel: receipt.model, chargedRaw: call.chargedRaw, promptTokens: call.promptTokens, completionTokens: call.completionTokens, paymentId: call.paymentId, txHash: call.txHash, requestDigest: call.requestDigest, payTo: quote.payTo, account: quote.account, asset: quote.asset, fromCashRaw: String(payment.fromCash), fromCreditRaw: "0", blockNumber: chainReceipt.blockNumber, blockHash: chainReceipt.blockHash, status: chainReceipt.status, gateway: match, ...(call.external ? { external: call.external } : {}) });
      }
      const beforeNonce = await provider.getTransactionCount(agent.wallet, "latest"), beforePending = await provider.getTransactionCount(agent.wallet, "pending"), beforeGateway = await getGateway();
      assert.equal(beforeNonce, beforePending, "UNCONFIRMED_AGENT_TRANSACTION");
      await api(`/agents/${agent.id}/runs`, "POST", entry.goal);
      const replay = await wait(entry.goal.requestId); assert.deepEqual(replay.result, original.result); assert.deepEqual(replay.mission, original.mission);
      const afterGateway = await getGateway(); assert.equal(afterGateway.health.acceptedRequests, beforeGateway.health.acceptedRequests); assert.equal(afterGateway.lines.length, beforeGateway.lines.length);
      assert.equal(await provider.getTransactionCount(agent.wallet, "latest"), beforeNonce); assert.equal(await provider.getTransactionCount(agent.wallet, "pending"), beforePending);
      assert.equal(entry.financeBefore?.status, "confirmed"); assert.equal(entry.financeAfter?.status, "confirmed");
      const financeBefore = entry.financeBefore as Extract<HostedFinance, { status: "confirmed" }>, financeAfter = entry.financeAfter as Extract<HostedFinance, { status: "confirmed" }>;
      assert.equal(BigInt(financeBefore.cashRaw) - BigInt(financeAfter.cashRaw), BigInt(original.result!.chargedRaw)); assert.equal(financeAfter.debtRaw, "0");
      const summary = { schemaVersion: 1, observedAt: new Date().toISOString(), case: name, status: original.status, acceptancePassed: mission.review!.passed, ...(original.reason ? { reason: original.reason } : {}), ...(entry.retryOf ? { retryOf: entry.retryOf, previousFailed: entry.previousFailed, combinedGoalChargedRaw: (BigInt(entry.previousFailed!.chargedRaw) + BigInt(original.result!.chargedRaw)).toString() } : {}), origin: collaborationOrigin, chainId: "10143", modelSource: "Real Kimi K2.6/K3 through deployed Magpie gateway", requestId: original.requestId, agentId: agent.id, chainAgentId: entry.agent!.binding!.agentId, wallet: agent.wallet, goalDigest: sha(entry.goal.goal), selectedModel: spec.modelId, reservedRaw: spec.budgetRaw, chargedRaw: original.result!.chargedRaw, modelSequence: mission.calls.map(call => call.model), callStages: mission.calls.map(call => call.stage), revision, previousOutputPreserved, discovery: { serviceCount: savedMission.externalServices?.length ?? 0, registryDigests: [...new Set(savedMission.externalServices?.map(service => service.registryDigest) ?? [])], selectedServiceIds: mission.calls.flatMap(call => call.external ? [call.external.service.id] : []) }, phases: mission.phases.map(phase => ({ name: phase.name, taskType: phase.taskType, outputDigest: sha(phase.output!), outputCharacters: phase.output!.length, ...(phase.external ? { external: phase.external } : {}) })), answer: { sha256: sha(mission.answer!), characters: mission.answer!.length }, independentReview: { passed: mission.review!.passed, stage: mission.calls.at(-1)!.stage, checkCount: mission.review!.checks.length, external: false }, finance: { cashBeforeRaw: financeBefore.cashRaw, cashAfterRaw: financeAfter.cashRaw, debtAfterRaw: financeAfter.debtRaw }, externalIdentity: { ...bootstrap.externalProvider, walletVerifiedOnChain: true }, payments, replay: { sameRequestId: true, sameResult: true, noNewTransactions: true, noNewModelRequests: true, nonceBefore: beforeNonce, nonceAfter: beforeNonce, modelRequestsBefore: beforeGateway.health.acceptedRequests, modelRequestsAfter: afterGateway.health.acceptedRequests } };
      entry.audit = summary; await save();
      await atomicJson(join(output, options.mode === "audit-failed" ? "fallback-failed-public-summary.json" : `${name}-public-summary.json`), summary); publicResults.push(summary);
      console.log(JSON.stringify({ audited: name, requestId: original.requestId, chargedRaw: original.result!.chargedRaw, modelSequence: summary.modelSequence, canonicalPayments: payments.length, realModelResponses: usedAttempts.size, noNewTransactionsOnReplay: true, noNewModelRequestsOnReplay: true }));
    } finally { connection.close(); }
  }
  return publicResults;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const mode = value("--mode"), caseName = value("--case"), runtime = value("--runtime"), output = value("--out") ?? value("--output");
  if (value("--out") && value("--output")) assert.equal(resolve(value("--out")!), resolve(value("--output")!), "ACCEPTANCE_OUTPUT_ALIAS_CONFLICT");
  if (!runtime || !output || !["prepare", "prepare-recheck", "run", "recover", "audit", "audit-failed"].includes(mode ?? "") || caseName !== undefined && !["external", "fallback", "fallback-recheck", "fallback-fresh"].includes(caseName)) throw new Error("Usage: monad-collaboration-goal-acceptance.ts --runtime ABS_PRIVATE_RUNTIME --out|--output ABS_PRIVATE_ACCEPTANCE --mode prepare|prepare-recheck|run|recover|audit|audit-failed [--case external|fallback|fallback-recheck|fallback-fresh] [--rpc-url-file ABS_PRIVATE_RPC] [--rpc-transport direct|system-https-proxy]");
  runMonadCollaborationGoalAcceptance({ runtime: resolve(runtime), output: resolve(output), mode: mode as Mode, caseName: caseName as CaseName | undefined, rpcUrlFile: value("--rpc-url-file"), rpcTransport: value("--rpc-transport") as RpcTransport | undefined }).catch(error => {
    // Assert actual/expected fields can contain private model output. Log only
    // the first, deliberately constructed diagnostic line and never the error.
    const message = error instanceof Error ? error.message.split("\n")[0] : "UNKNOWN";
    console.error(/^[A-Z_0-9:./ -]{1,240}$/.test(message) ? message : "MONAD_COLLABORATION_ACCEPTANCE_FAILED_INSPECT_PRIVATE_JOURNAL"); process.exitCode = 1;
  });
}
