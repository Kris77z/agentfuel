import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Interface, type JsonRpcProvider } from "ethers";
import { createHash } from "node:crypto";
import { atomicJson, ESCROW_ABI } from "../../services/arena/src/protocol.js";
import { collectAutonomyEvidence, readRecheckFreezeSnapshot, assertRecheckUnfreezePreservesHistory, assertFreshAutonomyOwner,
  assertFreshAutonomyBaseline, monadCollaborationAutonomyAcceptance, autonomyGasBinding } from "../monad-collaboration-autonomy-acceptance.js";
import { createHand } from "../../services/arena/src/holdem/engine.js";

test("autonomy public evidence requires canonical TaskSettled, independent Docker checks and removes private model/key/transaction payloads", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "tabby-autonomy-evidence-"));
  try {
    const agent = { id: "a", wallet: "0x1111111111111111111111111111111111111111", binding: { agentId: "2209" } };
    const parentId = "original-parent", taskId = "original-child", gameId = "original-game";
    const directory = join(runtime, "hosted", "agents", agent.id, "runs", parentId);
    const escrowAddress = "0x2222222222222222222222222222222222222222", verifier = "0x3333333333333333333333333333333333333333";
    const hash = "0x" + "a".repeat(64), blockHash = "0x" + "b".repeat(64), iface = new Interface(ESCROW_ABI);
    const event = iface.encodeEventLog(iface.getEvent("TaskSettled")!, [18, true, 34500, 0, 115500]);
    const receipt = { hash, blockNumber: 123, blockHash, status: 1, logs: [{ address: escrowAddress, topics: event.topics, data: event.data }] };
    let canonical = true, broadcasts = 0;
    const provider = { getTransactionReceipt: async () => receipt, getBlock: async () => ({ hash: canonical ? blockHash : "0x" + "c".repeat(64) }),
      call: async ({ data }: { data: string }) => data.slice(0, 10) === iface.getFunction("verifier")!.selector
        ? iface.encodeFunctionResult("verifier", [verifier]) : iface.encodeFunctionResult("getTask", [[verifier, 150000, 0, 2209, 2000000000, 0, 3]]),
      broadcastTransaction: async () => { broadcasts++; throw new Error("never"); } } as unknown as JsonRpcProvider;
    const taskDirectory = join(directory, "children", taskId), gameDirectory = join(directory, "children", gameId);
    await atomicJson(join(directory, "autonomy-host", "session.json"), { children: {
      [gameId]: { directory: gameDirectory, agent: { allowCredit: false }, run: { requestId: gameId, action: "game", rewardKind: "usdc", reservedRaw: "0" } },
      [taskId]: { directory: taskDirectory, run: { requestId: taskId, action: "metered-task" } },
    } });
    await atomicJson(join(gameDirectory, "session.json"), { result: { phase: "Succeeded", success: true, terminal: true, rewardRaw: "100000", privateKey: "SECRET_KEY" } });
    await atomicJson(join(gameDirectory, "reward-transactions.json"), { transfer: { txHash: hash, rawTransaction: "SIGNED_BYTES" } });
    await atomicJson(join(taskDirectory, "task-executor", "session.json"), { result: { taskId: "18", success: true, settlement: { passed: true, txHash: hash }, paymentTxHash: hash },
      snapshot: { privateKey: "SECRET_KEY", rpc: "PRIVATE_RPC" } });
    await atomicJson(join(taskDirectory, "task-executor", "workflow", "metered", "inference-ledger", "session.json"), {
      invocations: [{ id: "round:1", state: "Completed", modelId: "cheap", requestDigest: "request-digest", request: { secret: "SECRET_PROMPT" },
        result: { usage: { promptTokens: 10, completionTokens: 20 }, chargedCredits: "50", response: { content: "PRIVATE_MODEL_RESPONSE" } } }],
    });
    await atomicJson(join(runtime, "arena-http-journal.json"), { runs: [{ runId: "arena-original", taskId: "18", status: "settled", result: {
      verdict: { mode: "docker", passed: true, evidenceHash: "evidence-hash" }, tests: [{ case: 1, passed: true }], settlement: { txHash: hash },
    } }] });
    const input: Parameters<typeof collectAutonomyEvidence>[0] = { runtime, output: join(runtime, "report"), agent, provider,
      state: { version: 1, runtime, origin: "https://monad.tabbyai.xyz", bootstrap: "/private/bootstrap.json", owner: verifier, createdAt: "now", createId: "create", parentId,
        task: { taskId: "18", deadline: 2000000000, rewardRaw: "150000", problemId: "sum-integers", creditLimit: "80000", poster: verifier, escrow: escrowAddress } },
      parent: { requestId: parentId, action: "autonomous", status: "Succeeded", chargedRaw: "130000", result: { success: true, phase: "Stopped" } }, finance: { status: "confirmed", debtRaw: "0" } };
    const result = await collectAutonomyEvidence(input); assert.equal(result.automaticGameToSettledTaskAccepted, true);
    assert.equal(result.independentVerifier[0].settlement.event.repaidRaw, "34500");
    assert.equal(result.tasks[0].meteredInferences[0].usage.promptTokens, 10);
    const publicText = JSON.stringify(result);
    for (const forbidden of ["SECRET_KEY", "SIGNED_BYTES", "PRIVATE_RPC", "SECRET_PROMPT", "PRIVATE_MODEL_RESPONSE", "privateKey", "rawTransaction"]) assert.equal(publicText.includes(forbidden), false);
    assert.equal(broadcasts, 0);
    canonical = false; await assert.rejects(collectAutonomyEvidence(input), /AUTONOMY_RECEIPT_NOT_CANONICAL/);
    canonical = true;
    // A fresh run cannot reuse the weaker historical summary: require actual
    // per-call model/usage, zero seed/default and a successful terminal parent.
    const hand = createHand({ initialStack: 1000, smallBlind: 5, bigBlind: 10 }); hand.act(0, { type: "raise", to: 20 }); hand.act(1, { type: "fold" });
    await atomicJson(join(gameDirectory, "game", "session.json"), { version: 1, matchId: gameId, phase: "Complete", replay: hand.exportTrustedReplay(),
      turns: [0, 1].map(seat => ({ turn: seat, seat, outcome: "Applied", requestDigest: `digest-${seat}`, request: { model: "kimi-k2.6" }, response: {
        rawText: JSON.stringify({ model: "kimi-k2.6", usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, choices: [{ message: { content: "PRIVATE_GAME_REPLY" } }] }) } })) });
    await atomicJson(join(directory, "autonomy-loop", "session.json"), { phase: "Stopped", completedTasks: 1, completedGames: 1,
      steps: [{ decisionId: "paid-plan", decisionChargedRaw: "10000" }] });
    await atomicJson(join(directory, "planner", "paid-plan", "session.json"), { inference: {
      receipt: { txHash: hash, model: "kimi-k2.6" }, result: { model: "kimi-k2.6", usage: { promptTokens: 10, completionTokens: 20 }, response: "PRIVATE_PLANNER_REPLY" } } });
    await atomicJson(join(taskDirectory, "task-executor", "session.json"), { result: { terminal: true, taskId: "18", success: true,
      fromCashRaw: "90000", fromCreditRaw: "30000", settlement: { passed: true, txHash: hash } } });
    const physicalLedger = { invocations: [{ id: "round:1", state: "Completed", modelId: "cheap", result: {
      usage: { promptTokens: 10, completionTokens: 20 }, chargedCredits: "50", response: { model: "kimi-k2.6", content: "PRIVATE_MODEL_RESPONSE" } } }] };
    await atomicJson(join(taskDirectory, "task-executor", "workflow", "metered", "inference-ledger", "session.json"), physicalLedger);
    const protocol = { block: { number: 123, hash: blockHash }, guardian: verifier, managerFrozen: false, accountFrozen: false, defaultsRaw: "0",
      loan: { agentId: "0", principal: "0", fee: "0", loanDueAt: "0", status: "0" }, loanDigest: "digest" };
    const freshInput = { ...input, agent: { ...agent, spentRaw: "130000" }, finance: { ...input.finance, counts: { defaults: "0" } },
      state: { ...input.state, fresh: { version: 1 as const, ownerAdmission: { checkedAt: "now", ownerAgents: 0, sponsoredOwnerSlots: 0, sponsoredTotal: 5 }, protocolBefore: protocol },
        before: { finance: { cashRaw: "0", counts: { defaults: "0" } }, rewardTokens: 0 } } };
    const fresh = await collectAutonomyEvidence(freshInput);
    assert.equal(fresh.automaticGameToSettledTaskAccepted, true); assert.equal(fresh.fresh?.paidTaskUsageVerified, true);
    assert.equal(fresh.fullFreshAccepted, false, "Terminal business replay is required in addition to execution");
    for (const privateText of ["PRIVATE_GAME_REPLY", "PRIVATE_PLANNER_REPLY", "PRIVATE_MODEL_RESPONSE"]) assert.equal(JSON.stringify(fresh).includes(privateText), false);
    assert.equal((await collectAutonomyEvidence({ ...freshInput, state: { ...freshInput.state,
      replay: { before: {}, after: {}, parent: {}, verifiedAt: "now" } } })).fullFreshAccepted, true);
    assert.equal((await collectAutonomyEvidence({ ...freshInput, finance: { ...freshInput.finance, counts: { defaults: "1" } } })).automaticGameToSettledTaskAccepted, false);
    assert.equal((await collectAutonomyEvidence({ ...freshInput, parent: { ...input.parent, status: "Paused" } })).automaticGameToSettledTaskAccepted, false);
    assert.equal((await collectAutonomyEvidence({ ...freshInput, agent: { ...freshInput.agent, activeRequestId: "unfinished" } })).automaticGameToSettledTaskAccepted, false);
    await atomicJson(join(taskDirectory, "task-executor", "workflow", "metered", "inference-ledger", "session.json"), { invocations: [] });
    assert.equal((await collectAutonomyEvidence(freshInput)).automaticGameToSettledTaskAccepted, false, "Balance changes alone do not establish physical model use");
    await atomicJson(join(taskDirectory, "task-executor", "workflow", "metered", "inference-ledger", "session.json"), physicalLedger);
    await atomicJson(join(directory, "autonomy-loop", "session.json"), {});
    const originalDirectory = join(runtime, "original-failure");
    const original = { ...input.state, agentId: agent.id, parentId: "original-failed-parent", task: { ...input.state.task!, taskId: "17" }, after: { status: "Failed" } };
    await atomicJson(join(originalDirectory, "session.json"), original);
    await atomicJson(join(directory, "autonomy-host", "session.json"), { children: {
      [gameId]: { directory: gameDirectory, agent: { allowCredit: false }, run: { requestId: gameId, action: "game", rewardKind: "llm-credits", reservedRaw: "0" } },
      [taskId]: { directory: taskDirectory, run: { requestId: taskId, action: "reward-task" } },
    } });
    await atomicJson(join(gameDirectory, "session.json"), { result: { phase: "Succeeded", terminal: true, success: true, rewardRaw: "0", creditsGranted: 4096 } });
    await atomicJson(join(taskDirectory, "task-executor", "session.json"), { result: { terminal: true, success: true, taskId: "18",
      settlement: { passed: true, txHash: hash, loanStatus: "0", repaidRaw: "0", slashedRaw: "0", residualRaw: "150000" } } });
    await atomicJson(join(runtime, "credits", agent.id, "session.json"), { grants: [{ grantId: gameId, allocations: [4096, 0] }], redemptions: [{
      redemptionId: `${taskId}:round:0`, status: "Completed", model: "kimi-k2.6", chargedTokens: 30,
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, response: { rawText: JSON.stringify({ model: "kimi-k2.6", usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, choices: [{ message: { content: "PRIVATE_REPLY" } }] }) },
    }] });
    const recheckInput = { ...input, agent: { ...input.agent, spentRaw: "130000" }, finance: { ...input.finance, counts: { defaults: "1" } },
      state: { ...input.state, recheckOf: { directory: originalDirectory, parentId: original.parentId, taskId: "17", agentId: agent.id, owner: original.owner,
        sourceSessionDigest: createHash("sha256").update(JSON.stringify(original)).digest("hex") },
        seed: { amountRaw: "10000" as const, depositId: "deposit-original", financeBefore: { counts: { defaults: "1" } } } } };
    const recheck = await collectAutonomyEvidence(recheckInput);
    assert.equal(recheck.automaticGameToSettledTaskAccepted, true); assert.equal(recheck.recheck?.originalDefaultPreserved, true);
    assert.equal(recheck.recheck?.actualRewardTokensUsed, 30); assert.equal(recheck.recheck?.physicalUsageVerified, true);
    assert.equal(recheck.recheck?.originalFailurePreserved, true); assert.equal(JSON.stringify(recheck).includes("PRIVATE_REPLY"), false);
    assert.equal((await collectAutonomyEvidence({ ...recheckInput, finance: { status: "confirmed", debtRaw: "0", counts: { defaults: "0" } } })).automaticGameToSettledTaskAccepted, false, "Historical default cannot be erased to pass recheck");
    assert.equal((await collectAutonomyEvidence({ ...recheckInput, agent: { ...recheckInput.agent, activeRequestId: "pending-child" } })).automaticGameToSettledTaskAccepted, false);
    assert.equal((await collectAutonomyEvidence({ ...recheckInput, parent: { ...recheckInput.parent, status: "Failed" } })).automaticGameToSettledTaskAccepted, false);
    await atomicJson(join(originalDirectory, "session.json"), { ...original, after: { status: "Succeeded" } });
    await assert.rejects(collectAutonomyEvidence(recheckInput), /AUTONOMY_ORIGINAL_FAILURE_EVIDENCE_CHANGED/);
    await atomicJson(join(runtime, "arena-http-journal.json"), { runs: [] });
    await assert.rejects(collectAutonomyEvidence(input), /AUTONOMY_INDEPENDENT_DOCKER_VERDICT_REQUIRED/);
  } finally { await rm(runtime, { recursive: true, force: true }); }
});

test("an unfinished automatic game cannot be reported as a completed funding/task loop", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "tabby-autonomy-pause-"));
  try {
    const result = await collectAutonomyEvidence({ runtime, output: runtime,
      state: { version: 1, runtime, origin: "https://monad.tabbyai.xyz", bootstrap: "/private/bootstrap.json", owner: "owner", createdAt: "now", createId: "create", parentId: "saved-parent" },
      agent: { id: "actor", wallet: "wallet", binding: { agentId: "2209" } },
      parent: { requestId: "saved-parent", status: "Paused", reason: "AUTONOMY_CHILD_UNKNOWN", recoverable: true },
      provider: {} as JsonRpcProvider, finance: { status: "confirmed", debtRaw: "0" } });
    assert.equal(result.automaticGameToSettledTaskAccepted, false); assert.equal(result.terminalFailureOrPausePreserved, true);
    assert.equal(result.parent?.requestId, "saved-parent"); assert.equal(result.parent?.reason, "AUTONOMY_CHILD_UNKNOWN");
  } finally { await rm(runtime, { recursive: true, force: true }); }
});

test("guardian unfreeze audit pins both freeze flags and keeps the default/terminal original loan intact", async () => {
  const managerAddress = "0x4444444444444444444444444444444444444444", accountAddress = "0x5555555555555555555555555555555555555555";
  const guardian = "0x3333333333333333333333333333333333333333", blockHash = "0x" + "d".repeat(64);
  const abi = new Interface(["function guardian() view returns(address)", "function protocolFrozen(uint256) view returns(bool)",
    "function defaultCount(uint256) view returns(uint256)", "function getLoan(uint256) view returns(tuple(uint256 agentId,uint256 principal,uint256 fee,uint256 loanDueAt,uint8 status))"]);
  const calls: any[] = []; let frozen = true, canonical = true;
  const provider = { getBlock: async () => ({ number: 77, hash: canonical ? blockHash : "0x" + "e".repeat(64) }),
    call: async (request: any) => {
      calls.push(request); assert.equal(request.blockTag, 77);
      const parsed = abi.parseTransaction({ data: request.data })!;
      if (parsed.name === "guardian") return abi.encodeFunctionResult(parsed.name, [guardian]);
      if (parsed.name === "protocolFrozen") return abi.encodeFunctionResult(parsed.name, [frozen]);
      if (parsed.name === "defaultCount") return abi.encodeFunctionResult(parsed.name, [1]);
      assert.equal(String(parsed.args[0]), "18"); return abi.encodeFunctionResult("getLoan", [[2364, 0, 0, 1900000000, 3]]);
    } } as unknown as JsonRpcProvider;
  const before = await readRecheckFreezeSnapshot(provider, managerAddress, accountAddress, "2364", "18");
  frozen = false;
  const after = await readRecheckFreezeSnapshot(provider, managerAddress, accountAddress, "2364", "18");
  assertRecheckUnfreezePreservesHistory(before, after);
  assert.equal(before.loan.status, "3"); assert.equal(after.defaultsRaw, "1"); assert.equal(before.loanDigest, after.loanDigest);
  assert.equal(calls.filter(call => call.to.toLowerCase() === managerAddress.toLowerCase()).length, 8);
  assert.equal(calls.filter(call => call.to.toLowerCase() === accountAddress.toLowerCase()).length, 2);
  assert.throws(() => assertRecheckUnfreezePreservesHistory(before, { ...after, defaultsRaw: "0" }), /UNFREEZE_HISTORY_CHANGED/);
  const mutatedLoan = { ...after.loan, status: "2" };
  assert.throws(() => assertRecheckUnfreezePreservesHistory(before, { ...after, loan: mutatedLoan,
    loanDigest: createHash("sha256").update(JSON.stringify(mutatedLoan)).digest("hex") }), /UNFREEZE_HISTORY_CHANGED/);
  assert.throws(() => assertRecheckUnfreezePreservesHistory(before, { ...after, accountFrozen: true }), /UNFREEZE_NOT_CONFIRMED/);
  let reads = 0;
  const changedBlock = { ...provider, getBlock: async () => ({ number: 77, hash: ++reads === 1 ? blockHash : "0x" + "e".repeat(64) }) } as unknown as JsonRpcProvider;
  await assert.rejects(readRecheckFreezeSnapshot(changedBlock, managerAddress, accountAddress, "2364", "18"), /FREEZE_BLOCK_CHANGED/);
});

test("fresh automatic competition admits one unused owner with two genuine sponsorship slots and no seeded/repaired history", async () => {
  assertFreshAutonomyOwner({ ownerAgents: 0, sponsoredOwnerSlots: 0, sponsoredTotal: 98 });
  assert.throws(() => assertFreshAutonomyOwner({ ownerAgents: 1, sponsoredOwnerSlots: 0, sponsoredTotal: 98 }), /UNUSED_OWNER_REQUIRED/);
  assert.throws(() => assertFreshAutonomyOwner({ ownerAgents: 0, sponsoredOwnerSlots: 1, sponsoredTotal: 98 }), /UNUSED_OWNER_REQUIRED/);
  assert.throws(() => assertFreshAutonomyOwner({ ownerAgents: 0, sponsoredOwnerSlots: 0, sponsoredTotal: 99 }), /GLOBAL_QUOTA_INSUFFICIENT/);
  const input = { agent: { spentRaw: "0", reservedRaw: "0", totalBudgetRaw: "130000", perRunBudgetRaw: "120000", allowCredit: true, modelId: "kimi-k2.6", strategy: "balanced" },
    finance: { status: "confirmed", cashRaw: "0", debtRaw: "0", counts: { defaults: "0" } }, sponsoredOwnerSlots: 0, sponsoredTotal: 98,
    protocol: { block: { number: 1, hash: "block" }, guardian: "guardian", managerFrozen: false, accountFrozen: false, defaultsRaw: "0",
      loan: { agentId: "0", principal: "0", fee: "0", loanDueAt: "0", status: "0" }, loanDigest: "digest" },
    openTaskIds: ["20"], taskId: "20", seedPresent: false, recheckPresent: false };
  assertFreshAutonomyBaseline(input);
  for (const change of [{ seedPresent: true }, { recheckPresent: true }]) assert.throws(() => assertFreshAutonomyBaseline({ ...input, ...change }), /SEED_OR_REMEDY_FORBIDDEN/);
  assert.throws(() => assertFreshAutonomyBaseline({ ...input, agent: { ...input.agent, spentRaw: "1" } }), /SETTINGS_CHANGED/);
  assert.throws(() => assertFreshAutonomyBaseline({ ...input, finance: { ...input.finance, cashRaw: "10000" } }), /HEALTHY_IDENTITY_REQUIRED/);
  assert.throws(() => assertFreshAutonomyBaseline({ ...input, protocol: { ...input.protocol, accountFrozen: true } }), /HEALTHY_IDENTITY_REQUIRED/);
  assert.throws(() => assertFreshAutonomyBaseline({ ...input, finance: { ...input.finance, counts: { defaults: "1" } } }), /HEALTHY_IDENTITY_REQUIRED/);
  for (const openTaskIds of [[], ["19"], ["19", "20"]]) assert.throws(() => assertFreshAutonomyBaseline({ ...input, openTaskIds }), /OTHER_OPEN_TASKS/);
  // Invalid mode combinations stop before opening RPC, creating a key or sending anything.
  await assert.rejects(monadCollaborationAutonomyAcceptance("prepare-task", { runtime: "/not-opened", fresh: true }), /EXPLICIT_DIRECTORY_REQUIRED/);
  await assert.rejects(monadCollaborationAutonomyAcceptance("prepare-task", { runtime: "/not-opened", output: "/not-opened/fresh", fresh: true, recheckOf: "/old" }), /EXPLICIT_DIRECTORY_REQUIRED/);
});

test("fresh native gas amount is bounded and remains bound across restarts and original signed legacy journals", () => {
  assert.deepEqual(autonomyGasBinding({ fresh: true }), { amountWei: "600000000000000000", journalId: "fund-agent-gas" });
  assert.equal(autonomyGasBinding({ fresh: true, requestedWei: "1" }).amountWei, "1");
  assert.equal(autonomyGasBinding({ fresh: true, requestedWei: "600000000000000000" }).amountWei, "600000000000000000");
  for (const requestedWei of ["0", "-1", "01", "1.5", "1e17", " 1", "600000000000000001", "999999999999999999999999999999"])
    assert.throws(() => autonomyGasBinding({ fresh: true, requestedWei }), /GAS_WEI_OUT_OF_RANGE/);
  assert.throws(() => autonomyGasBinding({ fresh: false, requestedWei: "100000000000000000" }), /GAS_WEI_FRESH_ONLY/);
  const saved = JSON.parse(JSON.stringify(autonomyGasBinding({ fresh: true, requestedWei: "100000000000000000" })));
  assert.deepEqual(autonomyGasBinding({ fresh: true, saved }), saved, "Omitting the flag on recovery keeps the saved custom amount");
  assert.throws(() => autonomyGasBinding({ fresh: true, saved, requestedWei: "200000000000000000" }), /GAS_BINDING_CHANGED/);
  const intents = { "fund-agent-gas": { from: "source", to: "agent", value: saved.amountWei } };
  assert.deepEqual(autonomyGasBinding({ fresh: true, saved, intents, currentSigned: true }), saved);
  assert.throws(() => autonomyGasBinding({ fresh: true, saved, intents: { "fund-agent-gas": { value: "1" } }, currentSigned: true }), /GAS_BINDING_CHANGED/);
  assert.throws(() => autonomyGasBinding({ fresh: true, saved, currentSigned: true }), /ORIGINAL_INTENT_REQUIRED/);
  const legacyIntents = { "fund-agent-gas-0.6": { value: "600000000000000000" } };
  const legacy = autonomyGasBinding({ fresh: true, intents: legacyIntents, legacySigned: true });
  assert.deepEqual(legacy, { amountWei: "600000000000000000", journalId: "fund-agent-gas-0.6" });
  assert.throws(() => autonomyGasBinding({ fresh: true, intents: legacyIntents, legacySigned: true, requestedWei: "1" }), /GAS_BINDING_CHANGED/);
  assert.deepEqual(autonomyGasBinding({ fresh: false, intents: legacyIntents, legacySigned: true }), legacy, "Historical non-fresh transfer keeps its old operation ID");
  assert.throws(() => autonomyGasBinding({ fresh: true, intents: { ...legacyIntents, ...intents } }), /GAS_JOURNAL_CONFLICT/);
});
