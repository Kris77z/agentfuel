import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Contract, Wallet, getAddress, type JsonRpcProvider } from "ethers";
import { SessionStore } from "../packages/pi-loop/src/session.js";
import { publicLiveHand, HOLDEM_LIVE_LIMITS, type LiveHandSession } from "../services/arena/src/holdem/live.js";
import { ESCROW_ABI, atomicJson } from "../services/arena/src/protocol.js";
import type { HostedAgent, HostedRun, HostedFinance } from "../services/hosted-agents/src/types.js";
import { monadProvider, readRpcUrlFile } from "./demo-rpc.js";
import { reportDemoFailure } from "./demo-common.js";

type ObjectValue = Record<string, any>;
export type TokenSupplementMode = "prepare" | "game" | "task" | "recover-game" | "recover-task" | "evidence" | "replay";
interface Entry { input: { action: "game" | "reward-task"; requestId: string; rewardKind?: "llm-credits" }; submittedAt?: string; result?: HostedRun; before?: HostedFinance; after?: HostedFinance }
export interface TokenSupplementJournal {
  version: 1; runtime: string; bootstrap: string; origin: "https://monad.tabbyai.xyz"; source: string; sourceDigest: string; sourceEvidenceDigest: string;
  owner: string; ownerKeyFile: string; agent: HostedAgent; startedAt: string; taskId?: string;
  game: Entry; task: Entry; quotaBefore: { owner: number; global: number }; before: HostedFinance;
  replay?: { before: ObjectValue; after?: ObjectValue; verifiedAt?: string };
}
export interface TokenSupplementOptions { runtime: string; source: string; output: string; mode: TokenSupplementMode; taskId?: string; recover?: boolean }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function check(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
async function json<T = ObjectValue>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")); }
async function optional<T = ObjectValue>(file: string): Promise<T | undefined> {
  try { return await json<T>(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return undefined; }
}
const publicRun = (run?: HostedRun): ObjectValue | undefined => run && JSON.parse(JSON.stringify({ requestId: run.requestId, agentId: run.agentId, action: run.action, rewardKind: run.rewardKind,
  status: run.status, reason: run.reason, chargedRaw: run.chargedRaw, result: run.result }));
export function verifyTokenSupplementJournal(state: TokenSupplementJournal, options: Pick<TokenSupplementOptions, "runtime" | "source" | "output" | "taskId">) {
  check(state.version === 1 && state.origin === "https://monad.tabbyai.xyz" && state.runtime === resolve(options.runtime)
    && state.source === resolve(options.source) && resolve(options.output) !== state.source && state.ownerKeyFile === join(state.source, "owner.key"), "TOKEN_SUPPLEMENT_BINDING_CHANGED");
  check(state.agent.binding?.chainId === "10143" && getAddress(state.agent.owner) === getAddress(state.owner) && state.agent.modelId === "kimi-k2.6", "TOKEN_SUPPLEMENT_IDENTITY_CHANGED");
  check(state.game.input.action === "game" && state.game.input.rewardKind === "llm-credits" && state.task.input.action === "reward-task"
    && state.task.input.rewardKind === undefined && state.game.input.requestId !== state.task.input.requestId
    && [state.game.input.requestId, state.task.input.requestId].every(id => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)), "TOKEN_SUPPLEMENT_ORIGINAL_UUID_REQUIRED");
  check(Number.isSafeInteger(state.quotaBefore.owner) && state.quotaBefore.owner >= 0 && state.quotaBefore.owner < 3
    && Number.isSafeInteger(state.quotaBefore.global) && state.quotaBefore.global >= 0 && state.quotaBefore.global < 100, "TOKEN_SUPPLEMENT_QUOTA_UNAVAILABLE");
  if (options.taskId) check(/^[1-9][0-9]*$/.test(options.taskId) && (!state.taskId || state.taskId === options.taskId), "TOKEN_SUPPLEMENT_TASK_BINDING_CHANGED");
}
/** Recovery is explicit and uses the persisted UUID. A completed lost hand is
 * terminal, never a reason to create or dispatch another hand. */
export function tokenSupplementDispatch(entry: Entry, current: HostedRun | undefined, recover: boolean): "post" | "wait" | "terminal" {
  if (current) {
    check(current.requestId === entry.input.requestId && current.action === entry.input.action && current.rewardKind === entry.input.rewardKind, "TOKEN_SUPPLEMENT_REQUEST_CHANGED");
    if (["Succeeded", "Failed"].includes(current.status)) return "terminal";
    if (current.status === "Paused") { check(recover, "TOKEN_SUPPLEMENT_PAUSED_ORIGINAL_RECOVERY_REQUIRED"); return "post"; }
    return "wait";
  }
  check(!entry.result, "TOKEN_SUPPLEMENT_SAVED_RUN_MISSING");
  check(!entry.submittedAt || recover, "TOKEN_SUPPLEMENT_UNCERTAIN_ORIGINAL_RECOVERY_REQUIRED"); return "post";
}
export function tokenGameOutcome(run?: HostedRun) {
  if (!run) return "TOKEN_GAME_NOT_STARTED";
  if (run.status !== "Succeeded") return run.status === "Failed" ? "TOKEN_GAME_FAILED" : "TOKEN_GAME_UNCONFIRMED_OR_PAUSED";
  return (run.result?.creditsGranted ?? 0) > 0 ? "TOKEN_GAME_CREDITS_EARNED" : "TOKEN_GAME_LOST_NO_CREDITS";
}
function recordedResponse(rawText: string) {
  let response: ObjectValue; try { response = JSON.parse(rawText); } catch { return { responseDigest: digest(rawText), invalidJson: true }; }
  const usage = response.usage;
  return { model: typeof response.model === "string" ? response.model : undefined, responseDigest: digest(response),
    usage: usage && { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens } };
}
export async function collectTokenSupplementEvidence(state: TokenSupplementJournal, provider: JsonRpcProvider, finance: HostedFinance) {
  const base = join(state.runtime, "hosted", "agents", state.agent.id, "runs");
  const hand = await optional<LiveHandSession>(join(base, state.game.input.requestId, "game", "session.json"));
  const game = state.game.result, task = state.task.result, outcome = tokenGameOutcome(game);
  const ledger = await optional(join(state.runtime, "credits", state.agent.id, "session.json"));
  const grant = ledger?.grants?.find((entry: ObjectValue) => entry.grantId === state.game.input.requestId);
  const physicalGame = hand?.turns.map(turn => ({ turn: turn.turn, seat: turn.seat, outcome: turn.outcome, requestedModel: turn.request.model,
    requestDigest: turn.requestDigest, response: turn.response && recordedResponse(turn.response.rawText) }));
  let verifiedGame = false;
  const publicHand = hand && publicLiveHand(hand);
  if (game?.status === "Succeeded") {
    check(publicHand?.phase === "Complete" && grant?.model === "kimi-k2.6" && grant.matchId === game.result?.matchId
      && grant.replayDigest === digest(hand!.replay) && getAddress(grant.players[0].wallet) === getAddress(state.agent.wallet)
      && grant.players[0].agentId === state.agent.binding!.agentId && grant.allocations[0] === game.result?.creditsGranted
      && JSON.stringify(grant.winners) === JSON.stringify([...publicHand.result!.winners].sort()), "TOKEN_SUPPLEMENT_GRANT_PROOF_REQUIRED");
    check(grant.allocations[0] === (grant.winners.includes(0) ? 4096 / grant.winners.length : 0), "TOKEN_SUPPLEMENT_GRANT_AMOUNT_CHANGED");
    check(physicalGame!.length > 0 && physicalGame!.length <= HOLDEM_LIVE_LIMITS.maxCalls && physicalGame!.every(attempt => attempt.outcome === "Applied"
      && attempt.requestedModel === "kimi-k2.6" && attempt.response?.model === "kimi-k2.6" && (attempt.response.usage?.total_tokens ?? 0) > 0), "TOKEN_SUPPLEMENT_REAL_GAME_USAGE_REQUIRED");
    check(hand!.turns.every(turn => turn.request.max_completion_tokens === 512), "TOKEN_SUPPLEMENT_GAME_LIMIT_CHANGED");
    verifiedGame = true;
  }
  const redemptions = (ledger?.redemptions ?? []).filter((entry: ObjectValue) => entry.redemptionId.startsWith(`${state.task.input.requestId}:round:`));
  const publicRedemptions = redemptions.map((entry: ObjectValue) => ({ redemptionId: entry.redemptionId, status: entry.status, model: entry.model,
    requestDigest: entry.requestDigest, chargedTokens: entry.chargedTokens, usage: entry.usage && { prompt_tokens: entry.usage.prompt_tokens,
      completion_tokens: entry.usage.completion_tokens, total_tokens: entry.usage.total_tokens }, response: entry.response && recordedResponse(entry.response.rawText), error: entry.error }));
  const executor = await optional(join(base, state.task.input.requestId, "task-executor", "session.json"));
  const workflow = await optional(join(base, state.task.input.requestId, "task-executor", "workflow", "session.json"));
  const independent = await optional(join(state.runtime, "arena-http-journal.json"));
  let settlement: ObjectValue | undefined;
  if (task?.status === "Succeeded") {
    const value = task.result!, before = state.task.before, after = state.task.after;
    check(verifiedGame && (game!.result!.creditsGranted ?? 0) > 0 && state.taskId && value.taskId === state.taskId && value.success && value.terminal
      && task.chargedRaw === "0" && value.chargedRaw === "0" && (value.creditsUsed ?? 0) > 0 && !value.paymentId && !value.paymentTxHash
      && BigInt(value.fromCreditRaw ?? "0") === 0n && BigInt(value.fromCashRaw ?? "0") === 0n && value.settlement?.passed
      && value.settlement.loanStatus === "0" && value.settlement.repaidRaw === "0" && value.settlement.slashedRaw === "0" && value.settlement.residualRaw === "150000", "TOKEN_SUPPLEMENT_TASK_RESULT_REQUIRED");
    check(executor?.snapshot.request === state.task.input.requestId && executor.snapshot.action === "reward-task" && executor.snapshot.agent === state.agent.id
      && executor.snapshot.workflow.funding === "reward-tokens" && executor.snapshot.workflow.allowCredit === false && workflow?.decision?.selected?.taskId === state.taskId,
      "TOKEN_SUPPLEMENT_FROZEN_TOKEN_ROUTE_REQUIRED");
    check(redemptions.length > 0 && redemptions.length <= 2 && publicRedemptions.every((entry: ObjectValue) => entry.status === "Completed"
      && entry.model === "kimi-k2.6" && entry.response?.model === "kimi-k2.6" && entry.chargedTokens > 0
      && entry.usage?.total_tokens === entry.chargedTokens && entry.response.usage?.total_tokens === entry.chargedTokens)
      && publicRedemptions.reduce((sum: number, entry: ObjectValue) => sum + entry.chargedTokens, 0) === value.creditsUsed, "TOKEN_SUPPLEMENT_PHYSICAL_TASK_USAGE_REQUIRED");
    check(redemptions.every((entry: ObjectValue) => entry.identity.agentId === state.agent.binding!.agentId
      && getAddress(entry.identity.wallet) === getAddress(state.agent.wallet)), "TOKEN_SUPPLEMENT_REDEMPTION_IDENTITY_CHANGED");
    check(before?.status === "confirmed" && after?.status === "confirmed" && finance.status === "confirmed" && [before, after, finance].every(item => item.debtRaw === "0"
      && item.counts.defaults === "0" && item.counts.mirrorDefaults === "0") && BigInt(after.cashRaw) - BigInt(before.cashRaw) === 150000n
      && BigInt(after.counts.successes) === BigInt(before.counts.successes) + 1n && after.counts.repayments === before.counts.repayments,
      "TOKEN_SUPPLEMENT_ACTUAL_INCOME_REQUIRED");
    const escrow = new Contract(executor.snapshot.workflow.escrowAddress, ESCROW_ABI, provider), hash = value.settlement.txHash;
    const receipt = await provider.getTransactionReceipt(hash); check(receipt?.status === 1 && receipt.to && getAddress(receipt.to) === getAddress(String(escrow.target))
      && (await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash, "TOKEN_SUPPLEMENT_CANONICAL_SETTLEMENT_REQUIRED");
    const events = receipt.logs.filter(log => getAddress(log.address) === getAddress(String(escrow.target))).flatMap(log => {
      try { const parsed = escrow.interface.parseLog(log); return parsed?.name === "TaskSettled" ? [parsed] : []; } catch { return []; }
    });
    check(events.length === 1 && String(events[0].args.taskId) === state.taskId && events[0].args.passed && events[0].args.repaid === 0n
      && events[0].args.slashed === 0n && events[0].args.agentResidual === 150000n, "TOKEN_SUPPLEMENT_SETTLEMENT_EVENT_CHANGED");
    const manager = new Contract((await json(state.bootstrap)).contracts.manager, ["function getLoan(uint256) view returns(tuple(uint256 agentId,uint256 principal,uint256 fee,uint256 loanDueAt,uint8 status))"], provider);
    const [chain, loan] = await Promise.all([escrow.getTask(state.taskId), manager.getLoan(state.taskId)]);
    check(chain.status === 3n && String(chain.agentId) === state.agent.binding!.agentId && chain.escrowBalance === 0n && loan.status === 0n
      && loan.principal + loan.fee === 0n, "TOKEN_SUPPLEMENT_CHAIN_TASK_CHANGED");
    const arena = independent?.runs?.find((entry: ObjectValue) => entry.taskId === state.taskId && entry.status === "settled" && entry.result?.settlement?.txHash === hash);
    check(arena?.result?.verdict?.mode === "docker" && arena.result.verdict.passed && arena.result.tests.length > 0
      && arena.result.tests.every((entry: ObjectValue) => entry.passed === true), "TOKEN_SUPPLEMENT_INDEPENDENT_DOCKER_REQUIRED");
    settlement = { txHash: hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, canonical: true, verifier: await escrow.verifier(),
      evidenceHash: arena.result.verdict.evidenceHash, tests: arena.result.tests.map((entry: ObjectValue) => ({ case: entry.case, passed: entry.passed })),
      loanStatus: "0", repaidRaw: "0", slashedRaw: "0", residualRaw: "150000" };
  }
  const accepted = Boolean(settlement);
  return { version: 1, checkedAt: new Date().toISOString(), origin: state.origin, chainId: "10143", hostedAgentId: state.agent.id,
    agentId: state.agent.binding!.agentId, owner: state.owner, wallet: state.agent.wallet, expectedTaskId: state.taskId,
    sourceSessionDigest: state.sourceDigest, sourceEvidenceDigest: state.sourceEvidenceDigest, outcome, accepted,
    fullAccepted: accepted && Boolean(state.replay?.verifiedAt), limits: { maxGames: 1, maxGameCalls: 20, maxTaskCalls: 2, maxCompletionTokens: 512,
      newAgentAllowed: false, usdcSeedRaw: "0", newInferencePaymentsRaw: "0", newBorrowingRaw: "0", winnerGuaranteed: false },
    game: publicRun(game), publicHand, physicalGame, grant: grant && { grantId: grant.grantId, matchId: grant.matchId, model: grant.model,
      replayDigest: grant.replayDigest, winners: grant.winners, allocations: grant.allocations }, task: publicRun(task), redemptions: publicRedemptions,
    settlement, financeBefore: state.before, financeBeforeTask: state.task.before, financeAfterTask: state.task.after, finance,
    replay: state.replay, originalUuidsPreserved: true, noModelResponseText: true };
}

export async function monadTokenSupplementAcceptance(options: TokenSupplementOptions) {
  const runtime = resolve(options.runtime), source = resolve(options.source), output = resolve(options.output);
  check(output !== source && /^[1-9][0-9]*$/.test(options.taskId ?? "1"), "TOKEN_SUPPLEMENT_EXPLICIT_DIRECTORY_REQUIRED");
  const original = await json(join(source, "session.json")), sourceEvidence = await json(join(source, "evidence.json"));
  check(original.runtime === runtime && original.origin === "https://monad.tabbyai.xyz" && original.fresh && !original.seed && !original.recheckOf
    && original.after?.status === "Succeeded" && sourceEvidence.fullFreshAccepted === true && sourceEvidence.hostedAgentId === original.agentId
    && sourceEvidence.parentRequestId === original.parentId, "TOKEN_SUPPLEMENT_SEALED_FRESH_AUTO_REQUIRED");
  const bootstrap = await json(original.bootstrap), ready = await json(join(runtime, "ready.json"));
  check(bootstrap.chainId === "10143" && bootstrap.frontendOrigin === original.origin && ready.frontendOrigin === original.origin, "TOKEN_SUPPLEMENT_DOMAIN_REQUIRED");
  const hosted = await json(ready.hostedConfigFile), taskConfig = await json(hosted.executor.taskConfigFile), ownerKeyFile = join(source, "owner.key");
  const owner = new Wallet((await readFile(ownerKeyFile, "utf8")).trim()); check(owner.address === original.owner, "TOKEN_SUPPLEMENT_OWNER_CHANGED");
  const connection = await monadProvider(await readRpcUrlFile(bootstrap.rpcUrlFile), bootstrap.rpcTransport);
  const store = new SessionStore<TokenSupplementJournal>(output); let held = false, cookie = "";
  try {
    const provider = connection.provider; check(BigInt(await provider.send("eth_chainId", [])) === 10143n, "TOKEN_SUPPLEMENT_NETWORK_CHANGED");
    const api = async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${original.origin}/api/hosted${path}`, { method, redirect: "error", signal: AbortSignal.timeout(60000),
        headers: { origin: original.origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const value = await response.json() as ObjectValue;
      check(response.ok, /^HOSTED_[A-Z0-9_]+$/.test(value.error) ? value.error : `TOKEN_SUPPLEMENT_HTTP_${response.status}`);
      if (path === "/auth/login") { cookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""; check(cookie, "TOKEN_SUPPLEMENT_COOKIE_REQUIRED"); } return value;
    };
    const challenge = await api("/auth/challenge", "POST", { wallet: owner.address });
    check(challenge.message.startsWith(`AgentFuel hosted agent login\nOrigin: ${original.origin}\nWallet: ${owner.address}\nChain: 10143\nNonce: `)
      && challenge.message.endsWith("This signature authenticates your platform account. It authorizes no blockchain transaction."), "TOKEN_SUPPLEMENT_AUTH_DOMAIN_CHANGED");
    await api("/auth/login", "POST", { challengeId: challenge.id, signature: await owner.signMessage(challenge.message) });
    const get = async () => { const snapshot = await api("/agents"), agent = snapshot.agents.find((entry: HostedAgent) => entry.id === original.agentId) as HostedAgent;
      check(agent?.binding && agent.owner === owner.address && agent.modelId === "kimi-k2.6", "TOKEN_SUPPLEMENT_ORIGINAL_AGENT_REQUIRED"); return { snapshot, agent }; };
    const finance = async () => await api(`/agents/${original.agentId}/finance`) as HostedFinance;
    await store.start(options.recover || options.mode.startsWith("recover-")); held = true;
    let state = await store.read(); const initial = await get();
    check(initial.agent.binding!.agentId === sourceEvidence.agentId && getAddress(initial.agent.wallet) === getAddress(sourceEvidence.wallet), "TOKEN_SUPPLEMENT_SOURCE_IDENTITY_CHANGED");
    if (!state) {
      check(options.mode === "prepare", "TOKEN_SUPPLEMENT_ORIGINAL_PREPARATION_REQUIRED");
      check(!initial.agent.activeRequestId && initial.agent.status === "Ready", "TOKEN_SUPPLEMENT_AGENT_BUSY");
      check(!initial.snapshot.runs.some((run: HostedRun) => run.agentId === initial.agent.id && run.action === "game" && run.rewardKind === "llm-credits"),
        "TOKEN_SUPPLEMENT_EXISTING_TOKEN_GAME_USE_ORIGINAL_DIRECTORY");
      const database = await json(join(runtime, "hosted", "database", "session.json")), before = await finance();
      check(before.status === "confirmed" && before.debtRaw === "0" && before.counts.defaults === "0", "TOKEN_SUPPLEMENT_HEALTHY_IDENTITY_REQUIRED");
      const ledger = await optional(join(runtime, "credits", initial.agent.id, "session.json"));
      check(!ledger || !ledger.grants?.length && !ledger.redemptions?.length, "TOKEN_SUPPLEMENT_ZERO_TOKEN_BASELINE_REQUIRED");
      state = { version: 1, runtime, bootstrap: resolve(original.bootstrap), origin: original.origin, source, sourceDigest: digest(original), sourceEvidenceDigest: digest(sourceEvidence),
        owner: owner.address, ownerKeyFile, agent: initial.agent, startedAt: new Date().toISOString(), taskId: options.taskId,
        game: { input: { action: "game", rewardKind: "llm-credits", requestId: randomUUID() } }, task: { input: { action: "reward-task", requestId: randomUUID() } },
        quotaBefore: { owner: database.sponsoredOwners?.[owner.address] ?? 0, global: database.sponsoredTotal }, before };
      verifyTokenSupplementJournal(state, options); await store.write(state);
    }
    const saved = state; verifyTokenSupplementJournal(saved, options);
    check(saved.sourceDigest === digest(original) && saved.sourceEvidenceDigest === digest(sourceEvidence), "TOKEN_SUPPLEMENT_SOURCE_EVIDENCE_CHANGED");
    assert.deepEqual(initial.agent.binding, saved.agent.binding, "TOKEN_SUPPLEMENT_ORIGINAL_IDENTITY_CHANGED");
    for (const key of ["name", "modelId", "strategy", "perRunBudgetRaw", "totalBudgetRaw", "allowCredit", "spentRaw"] as const)
      assert.equal(initial.agent[key], saved.agent[key], "TOKEN_SUPPLEMENT_SETTINGS_OR_SPENT_CHANGED");
    const save = () => store.write(saved);
    if (options.taskId && !saved.taskId) { check(!saved.task.submittedAt, "TOKEN_SUPPLEMENT_TASK_ALREADY_DISPATCHED"); saved.taskId = options.taskId; await save(); }
    const wait = async (id: string) => {
      const until = Date.now() + 1260000;
      while (Date.now() < until) { const { snapshot } = await get(), run = snapshot.runs.find((entry: HostedRun) => entry.requestId === id) as HostedRun | undefined;
        if (run && !["Queued", "Running"].includes(run.status)) return run; await new Promise(done => setTimeout(done, 3000)); }
      throw new Error("TOKEN_SUPPLEMENT_WAIT_TIMEOUT_INSPECT_ORIGINAL_UUID");
    };
    const dispatch = async (entry: Entry, recover: boolean) => {
      const { snapshot, agent } = await get(), current = snapshot.runs.find((run: HostedRun) => run.requestId === entry.input.requestId) as HostedRun | undefined;
      const action = tokenSupplementDispatch(entry, current, recover);
      if (action === "post") {
        check(!agent.activeRequestId || agent.activeRequestId === entry.input.requestId, "TOKEN_SUPPLEMENT_ORIGINAL_AGENT_BUSY");
        entry.submittedAt ??= new Date().toISOString(); await save(); await api(`/agents/${agent.id}/runs`, "POST", entry.input);
      }
      const run = action === "terminal" ? current! : await wait(entry.input.requestId);
      if (entry.result && ["Succeeded", "Failed"].includes(entry.result.status)) assert.deepEqual(publicRun(run), publicRun(entry.result), "TOKEN_SUPPLEMENT_TERMINAL_CHANGED");
      else { entry.result = run; if (run.status === "Succeeded" || run.status === "Failed") entry.after = await finance(); await save(); }
      return run;
    };
    if (["game", "recover-game"].includes(options.mode)) {
      if (!saved.game.submittedAt) { const database = await json(join(runtime, "hosted", "database", "session.json"));
        check((database.sponsoredOwners?.[saved.owner] ?? 0) === saved.quotaBefore.owner && database.sponsoredTotal < 100, "TOKEN_SUPPLEMENT_QUOTA_CHANGED"); }
      await dispatch(saved.game, options.mode === "recover-game");
    }
    if (["task", "recover-task"].includes(options.mode) && tokenGameOutcome(saved.game.result) === "TOKEN_GAME_CREDITS_EARNED") {
      check(saved.taskId, "TOKEN_SUPPLEMENT_EXPLICIT_TASK_ID_REQUIRED");
      if (!saved.task.submittedAt) {
        const template = taskConfig.models.find((model: ObjectValue) => model.id === saved.agent.modelId)?.templates[saved.agent.strategy];
        check(template && template.deadlineMs > Date.now() + 300000, "TOKEN_SUPPLEMENT_TEMPLATE_EXPIRED");
        check(template.providers.every((entry: ObjectValue) => entry.routes.every((route: ObjectValue) => route.solve.maxRounds <= 2
          && route.solve.maxToolCalls <= 4)), "TOKEN_SUPPLEMENT_SOLVER_LIMIT_CHANGED");
        const arenaConfig = await json(join(runtime, "arena.json")), arenaResponse = await fetch(`${taskConfig.arenaUrl}/problems`, { signal: AbortSignal.timeout(20000) });
        check(arenaResponse.ok, "TOKEN_SUPPLEMENT_ARENA_UNAVAILABLE"); const arena = await arenaResponse.json() as ObjectValue;
        const definition = template.tasks.find((entry: ObjectValue) => String(entry.taskId) === saved.taskId);
        check(definition?.problemId === "sum-integers" && arenaConfig.tasks[saved.taskId]?.problemId === definition.problemId
          && arena.tasks?.[saved.taskId]?.problemId === definition.problemId, "TOKEN_SUPPLEMENT_CATALOG_NOT_APPENDED");
        const escrow = new Contract(bootstrap.contracts.escrow, ESCROW_ABI, provider), candidates: string[] = [];
        for (const entry of template.tasks) { const task = await escrow.getTask(entry.taskId);
          if ((task.status === 1n && task.agentId === 0n || task.status === 2n && String(task.agentId) === saved.agent.binding!.agentId)
            && Number(task.deadline) * 1000 > Date.now()) candidates.push(String(entry.taskId)); }
        check(candidates.length === 1 && candidates[0] === saved.taskId, "TOKEN_SUPPLEMENT_OTHER_OPEN_TASKS");
        const task = await escrow.getTask(saved.taskId);
        check(task.reward === 150000n && task.escrowBalance === 150000n && Number(task.deadline) * 1000 > Date.now() + 300000, "TOKEN_SUPPLEMENT_FRESH_REWARD_TASK_REQUIRED");
        saved.task.before = await finance(); await save();
      }
      await dispatch(saved.task, options.mode === "recover-task");
    }
    if (options.mode === "replay") {
      check(["Succeeded", "Failed"].includes(saved.game.result?.status ?? "")
        && (!saved.task.submittedAt || ["Succeeded", "Failed"].includes(saved.task.result?.status ?? "")), "TOKEN_SUPPLEMENT_TERMINAL_REPLAY_REQUIRED");
      const counters = async () => {
        const { agent, snapshot } = await get(); check(!agent.activeRequestId, "TOKEN_SUPPLEMENT_REPLAY_ACTIVE_REQUEST");
        const database = await json(join(runtime, "hosted", "database", "session.json")), ledger = await optional(join(runtime, "credits", agent.id, "session.json"));
        const health = await fetch("http://127.0.0.1:3427/health", { signal: AbortSignal.timeout(10000) }); check(health.ok, "TOKEN_SUPPLEMENT_GATEWAY_HEALTH_REQUIRED");
        const gateway = await health.json() as ObjectValue; check(Number.isSafeInteger(gateway.acceptedRequests), "TOKEN_SUPPLEMENT_GATEWAY_COUNTER_REQUIRED");
        const nonces: ObjectValue = {};
        for (const role of ["guardian", "underwriter", "verifier", "sponsor", "opponent"]) { const wallet = new Wallet((await readFile(bootstrap.roleKeyFiles[role], "utf8")).trim()); nonces[role] = await provider.getTransactionCount(wallet.address, "latest"); }
        nonces.agent = await provider.getTransactionCount(agent.wallet, "latest");
        const hand = await optional<LiveHandSession>(join(runtime, "hosted", "agents", agent.id, "runs", saved.game.input.requestId, "game", "session.json"));
        const executor = await optional(join(runtime, "hosted", "agents", agent.id, "runs", saved.task.input.requestId, "task-executor", "session.json"));
        const currentFinance = await finance();
        return JSON.parse(JSON.stringify({ nonces, acceptedRequests: gateway.acceptedRequests, ownerQuota: database.sponsoredOwners?.[saved.owner], globalQuota: database.sponsoredTotal,
          grantCount: ledger?.grants?.length ?? 0, redemptionCount: ledger?.redemptions?.length ?? 0, gameAttempts: hand?.turns.length ?? 0,
          ledgerDigest: ledger && digest(ledger), handDigest: hand && digest(hand), taskExecutorDigest: executor && digest(executor),
          finance: currentFinance.status === "confirmed" ? { cashRaw: currentFinance.cashRaw, debtRaw: currentFinance.debtRaw, counts: currentFinance.counts } : { status: currentFinance.status },
          originalAutoParent: publicRun(snapshot.runs.find((run: HostedRun) => run.requestId === original.parentId)),
          game: publicRun(snapshot.runs.find((run: HostedRun) => run.requestId === saved.game.input.requestId)),
          task: publicRun(snapshot.runs.find((run: HostedRun) => run.requestId === saved.task.input.requestId)) })) as ObjectValue;
      };
      saved.replay ??= { before: await counters() }; await save();
      for (const entry of [saved.game, ...(saved.task.submittedAt ? [saved.task] : [])]) await api(`/agents/${saved.agent.id}/runs`, "POST", entry.input);
      saved.replay.after = await counters(); assert.deepEqual(saved.replay.after, saved.replay.before, "TOKEN_SUPPLEMENT_REPLAY_CREATED_EFFECTS");
      saved.replay.verifiedAt = new Date().toISOString(); await save();
    }
    const finalAgent = (await get()).agent;
    for (const key of ["name", "modelId", "strategy", "perRunBudgetRaw", "totalBudgetRaw", "allowCredit", "spentRaw"] as const)
      assert.equal(finalAgent[key], saved.agent[key], "TOKEN_SUPPLEMENT_SETTINGS_OR_SPENT_CHANGED");
    const report = await collectTokenSupplementEvidence(saved, provider, await finance());
    await atomicJson(join(output, "evidence.json"), report); return report;
  } finally { if (held) await store.close(); connection.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), arg = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  const runtime = arg("--runtime"), source = arg("--source"), output = arg("--out"), mode = arg("--mode");
  if (!runtime || !source || !output || !["prepare", "game", "task", "recover-game", "recover-task", "evidence", "replay"].includes(mode ?? "")) {
    console.error("Usage: monad-token-supplement-acceptance.ts --runtime ABS_RUNTIME --source SEALED_AUTO_DIRECTORY --out ABS_NEW_DIRECTORY --mode prepare|game|task|recover-game|recover-task|evidence|replay [--task-id EXPECTED_TASK_ID] [--recover]"); process.exitCode = 1;
  } else monadTokenSupplementAcceptance({ runtime, source, output, mode: mode as TokenSupplementMode, taskId: arg("--task-id"), recover: args.includes("--recover") })
    .then(report => console.log(JSON.stringify(report))).catch(error => { reportDemoFailure(error); process.exitCode = 1; });
}
