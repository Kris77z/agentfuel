import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Interface, type JsonRpcProvider } from "ethers";
import { createHand } from "../../services/arena/src/holdem/engine.js";
import { ESCROW_ABI, atomicJson } from "../../services/arena/src/protocol.js";
import type { HostedAgent, HostedFinance, HostedRun } from "../../services/hosted-agents/src/types.js";
import { collectTokenSupplementEvidence, tokenSupplementDispatch, tokenGameOutcome, verifyTokenSupplementJournal, type TokenSupplementJournal } from "../monad-token-supplement-acceptance.js";
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const owner = "0x1111111111111111111111111111111111111111", wallet = "0x2222222222222222222222222222222222222222";
const escrowAddress = "0x3333333333333333333333333333333333333333", verifier = "0x4444444444444444444444444444444444444444";
const gameId = "11111111-1111-4111-8111-111111111111", taskId = "22222222-2222-4222-8222-222222222222";
function fixtureState(runtime = "/private/runtime"): TokenSupplementJournal {
  const before = { status: "confirmed", cashRaw: "115500", debtRaw: "0", counts: { defaults: "0", mirrorDefaults: "0", successes: "1", repayments: "1" } } as HostedFinance;
  const agent = { id: "same-hosted-agent", owner, wallet, modelId: "kimi-k2.6", binding: { chainId: "10143", agentId: "3000", wallet },
    spentRaw: "130000", totalBudgetRaw: "130000", perRunBudgetRaw: "120000", allowCredit: true, strategy: "balanced" } as HostedAgent;
  return { version: 1, runtime, bootstrap: join(runtime, "bootstrap.json"), origin: "https://monad.tabbyai.xyz", source: join(runtime, "auto"), sourceDigest: "auto-digest", sourceEvidenceDigest: "auto-evidence-digest",
    owner, ownerKeyFile: join(runtime, "auto", "owner.key"), agent, startedAt: "now", taskId: "30", quotaBefore: { owner: 2, global: 90 }, before,
    game: { input: { action: "game", requestId: gameId, rewardKind: "llm-credits" } }, task: { input: { action: "reward-task", requestId: taskId }, before } };
}
function run(state: TokenSupplementJournal, which: "game" | "task", status: HostedRun["status"]): HostedRun {
  return { ...state[which].input, agentId: state.agent.id, status, createdAt: "now", updatedAt: "now", reservedRaw: "0", chargedRaw: "0", recoverable: status === "Paused" };
}

test("supplement keeps the same owner/key reference, one game UUID and the explicitly bound task", () => {
  const state = fixtureState(), options = { runtime: state.runtime, source: state.source, output: join(state.runtime, "token"), taskId: "30" };
  verifyTokenSupplementJournal(state, options);
  assert.throws(() => verifyTokenSupplementJournal({ ...state, ownerKeyFile: "/copied-owner.key" }, options), /BINDING_CHANGED/);
  assert.throws(() => verifyTokenSupplementJournal({ ...state, agent: { ...state.agent, owner: wallet } }, options), /IDENTITY_CHANGED/);
  assert.throws(() => verifyTokenSupplementJournal({ ...state, task: { input: { ...state.task.input, requestId: gameId } } }, options), /ORIGINAL_UUID_REQUIRED/);
  assert.throws(() => verifyTokenSupplementJournal(state, { ...options, taskId: "31" }), /TASK_BINDING_CHANGED/);
  assert.throws(() => verifyTokenSupplementJournal(state, { ...options, output: state.source }), /BINDING_CHANGED/);
  assert.throws(() => verifyTokenSupplementJournal({ ...state, quotaBefore: { owner: 3, global: 90 } }, options), /QUOTA_UNAVAILABLE/);
  assert.throws(() => verifyTokenSupplementJournal({ ...state, quotaBefore: { owner: 2, global: 100 } }, options), /QUOTA_UNAVAILABLE/);
});

test("lost and unknown games do not cause implicit redispatch or a replacement UUID", () => {
  const state = fixtureState(), won = run(state, "game", "Succeeded"), lost = { ...won, result: { phase: "Succeeded", success: true, terminal: true, chargedRaw: "0", creditsGranted: 0 } };
  assert.equal(tokenGameOutcome(lost), "TOKEN_GAME_LOST_NO_CREDITS");
  assert.equal(tokenSupplementDispatch(state.game, lost, true), "terminal");
  assert.equal(tokenSupplementDispatch(state.game, run(state, "game", "Running"), false), "wait");
  assert.throws(() => tokenSupplementDispatch(state.game, run(state, "game", "Paused"), false), /PAUSED_ORIGINAL_RECOVERY_REQUIRED/);
  assert.equal(tokenSupplementDispatch(state.game, run(state, "game", "Paused"), true), "post");
  assert.throws(() => tokenSupplementDispatch({ ...state.game, submittedAt: "saved-before-network" }, undefined, false), /UNCERTAIN_ORIGINAL_RECOVERY_REQUIRED/);
  assert.equal(tokenSupplementDispatch({ ...state.game, submittedAt: "saved-before-network" }, undefined, true), "post");
  assert.throws(() => tokenSupplementDispatch(state.game, { ...won, requestId: taskId }, true), /REQUEST_CHANGED/);
});

test("token task acceptance requires original physical calls, identity grant, actual income and independent canonical Docker settlement", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "tabby-token-supplement-"));
  try {
    const state = fixtureState(runtime), base = join(runtime, "hosted", "agents", state.agent.id, "runs");
    const hand = createHand({ initialStack: 1000, smallBlind: 5, bigBlind: 10 }); hand.act(0, { type: "raise", to: 20 }); hand.act(1, { type: "fold" });
    const replay = hand.exportTrustedReplay(), hash = "0x" + "a".repeat(64), blockHash = "0x" + "b".repeat(64);
    await atomicJson(join(base, gameId, "game", "session.json"), { version: 1, phase: "Complete", matchId: `hosted-${gameId}`, replay,
      turns: [0, 1].map(seat => ({ turn: seat, seat, outcome: "Applied", requestDigest: `private-request-digest-${seat}`, request: { model: "kimi-k2.6", max_completion_tokens: 512,
        messages: [{ content: "PRIVATE_HOLE_CARDS" }] }, response: { rawText: JSON.stringify({ model: "kimi-k2.6", usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          choices: [{ message: { content: "PRIVATE_GAME_REPLY" } }] }) } })) });
    const grant = { grantId: gameId, matchId: `hosted-${gameId}`, replayDigest: sha(replay), model: "kimi-k2.6", players: [{ agentId: "3000", wallet }, { agentId: "1999", wallet: owner }], winners: [0], allocations: [4096, 0] };
    const redemption = { redemptionId: `${taskId}:round:0`, identity: { agentId: "3000", wallet }, model: "kimi-k2.6", status: "Completed", chargedTokens: 30,
      requestDigest: "task-request-digest", usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, request: { content: "PRIVATE_PROMPT" },
      response: { rawText: JSON.stringify({ model: "kimi-k2.6", usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, choices: [{ message: { content: "PRIVATE_TASK_REPLY" } }] }) } };
    const ledgerFile = join(runtime, "credits", state.agent.id, "session.json");
    await atomicJson(ledgerFile, { grants: [grant], redemptions: [redemption] });
    await atomicJson(state.bootstrap, { contracts: { manager: verifier } });
    await atomicJson(join(base, taskId, "task-executor", "session.json"), { snapshot: { request: taskId, action: "reward-task", agent: state.agent.id,
      workflow: { funding: "reward-tokens", allowCredit: false, escrowAddress } }, privateKey: "SECRET_KEY" });
    await atomicJson(join(base, taskId, "task-executor", "workflow", "session.json"), { decision: { selected: { taskId: "30" } }, candidate: "PRIVATE_CODE" });
    const arenaFile = join(runtime, "arena-http-journal.json"), arena = { runs: [{ taskId: "30", status: "settled", result: { settlement: { txHash: hash },
      verdict: { mode: "docker", passed: true, evidenceHash: "independent-evidence-digest" }, tests: [{ case: 1, passed: true }, { case: 2, passed: true }] } }] };
    await atomicJson(arenaFile, arena);
    state.game.result = { ...run(state, "game", "Succeeded"), result: { phase: "Succeeded", terminal: true, success: true, chargedRaw: "0", matchId: `hosted-${gameId}`, creditsGranted: 4096, rewardRaw: "0" } };
    state.task.result = { ...run(state, "task", "Succeeded"), result: { phase: "Succeeded", terminal: true, success: true, chargedRaw: "0", taskId: "30", creditsUsed: 30,
      settlement: { txHash: hash, block: { number: 100, hash: blockHash, timestamp: 1 }, passed: true, loanStatus: "0", repaidRaw: "0", slashedRaw: "0", residualRaw: "150000" } } };
    state.task.after = { ...state.before, cashRaw: "265500", counts: { ...(state.before as any).counts, successes: "2" } } as HostedFinance;
    const iface = new Interface(ESCROW_ABI), manager = new Interface(["function getLoan(uint256) view returns(tuple(uint256 agentId,uint256 principal,uint256 fee,uint256 loanDueAt,uint8 status))"]);
    const event = iface.encodeEventLog(iface.getEvent("TaskSettled")!, [30, true, 0, 0, 150000]); let canonical = true, broadcasts = 0;
    const provider = { getTransactionReceipt: async () => ({ status: 1, to: escrowAddress, hash, blockNumber: 100, blockHash,
      logs: [{ address: escrowAddress, topics: event.topics, data: event.data }] }), getBlock: async () => ({ hash: canonical ? blockHash : "other-block" }),
      call: async ({ data }: { data: string }) => data.startsWith(manager.getFunction("getLoan")!.selector) ? manager.encodeFunctionResult("getLoan", [[0, 0, 0, 0, 0]])
        : data.startsWith(iface.getFunction("verifier")!.selector) ? iface.encodeFunctionResult("verifier", [verifier])
        : iface.encodeFunctionResult("getTask", [[owner, 150000, 0, 3000, 2000000000, 0, 3]]),
      broadcastTransaction: async () => { broadcasts++; throw new Error("never"); } } as unknown as JsonRpcProvider;
    const report = await collectTokenSupplementEvidence(state, provider, state.task.after);
    assert.equal(report.accepted, true); assert.equal(report.fullAccepted, false); assert.equal(report.redemptions[0].chargedTokens, 30);
    for (const secret of ["PRIVATE_HOLE_CARDS", "PRIVATE_GAME_REPLY", "PRIVATE_PROMPT", "PRIVATE_TASK_REPLY", "SECRET_KEY", "PRIVATE_CODE", '"deck"', '"rawText"']) assert.equal(JSON.stringify(report).includes(secret), false);
    assert.equal(broadcasts, 0);
    const replayed = await collectTokenSupplementEvidence({ ...state, replay: { before: {}, after: {}, verifiedAt: "now" } }, provider, state.task.after);
    assert.equal(replayed.fullAccepted, true);
    canonical = false; await assert.rejects(collectTokenSupplementEvidence(state, provider, state.task.after), /CANONICAL_SETTLEMENT_REQUIRED/); canonical = true;
    const realAfter = state.task.after; state.task.after = { ...realAfter, cashRaw: "265499" } as HostedFinance;
    await assert.rejects(collectTokenSupplementEvidence(state, provider, realAfter), /ACTUAL_INCOME_REQUIRED/); state.task.after = realAfter;
    await atomicJson(ledgerFile, { grants: [grant], redemptions: [{ ...redemption, chargedTokens: 31 }] });
    await assert.rejects(collectTokenSupplementEvidence(state, provider, realAfter), /PHYSICAL_TASK_USAGE_REQUIRED/);
    await atomicJson(ledgerFile, { grants: [grant], redemptions: [redemption] });
    await atomicJson(arenaFile, { runs: [{ ...arena.runs[0], result: { ...arena.runs[0].result, tests: [{ case: 1, passed: false }] } }] });
    await assert.rejects(collectTokenSupplementEvidence(state, provider, realAfter), /INDEPENDENT_DOCKER_REQUIRED/);
  } finally { await rm(runtime, { recursive: true, force: true }); }
});

test("a real completed lost token hand is an honest non-accepted summary, not an exception or a new game", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "tabby-token-lost-"));
  try {
    const state = fixtureState(runtime), hand = createHand({ initialStack: 1000, smallBlind: 5, bigBlind: 10 }); hand.act(0, { type: "fold" });
    const replay = hand.exportTrustedReplay();
    state.game.result = { ...run(state, "game", "Succeeded"), result: { phase: "Succeeded", terminal: true, success: true, chargedRaw: "0", creditsGranted: 0, matchId: `hosted-${gameId}` } };
    await atomicJson(join(runtime, "hosted", "agents", state.agent.id, "runs", gameId, "game", "session.json"), { phase: "Complete", matchId: `hosted-${gameId}`, replay,
      turns: [{ turn: 0, seat: 0, outcome: "Applied", requestDigest: "digest", request: { model: "kimi-k2.6", max_completion_tokens: 512 }, response: {
        rawText: JSON.stringify({ model: "kimi-k2.6", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }) } }] });
    await atomicJson(join(runtime, "credits", state.agent.id, "session.json"), { grants: [{ grantId: gameId, model: "kimi-k2.6", matchId: `hosted-${gameId}`, replayDigest: sha(replay),
      players: [{ agentId: "3000", wallet }, { agentId: "1999", wallet: owner }], winners: [1], allocations: [0, 4096] }], redemptions: [] });
    const report = await collectTokenSupplementEvidence(state, {} as JsonRpcProvider, state.before);
    assert.equal(report.outcome, "TOKEN_GAME_LOST_NO_CREDITS"); assert.equal(report.accepted, false); assert.equal(report.fullAccepted, false);
    assert.equal(report.game?.requestId, gameId); assert.equal(report.task, undefined); assert.equal(report.limits.maxGames, 1);
  } finally { await rm(runtime, { recursive: true, force: true }); }
});
