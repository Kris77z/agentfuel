import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Interface, type JsonRpcProvider } from "ethers";
import { createHash } from "node:crypto";
import { atomicJson, ESCROW_ABI } from "../../services/arena/src/protocol.js";
import { collectAutonomyEvidence, readRecheckFreezeSnapshot, assertRecheckUnfreezePreservesHistory } from "../monad-collaboration-autonomy-acceptance.js";

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
