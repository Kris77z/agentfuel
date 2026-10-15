import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { collaborationCases, collaborationOrigin, goalRelayJournalDirectory, prepareFallbackRecheckCase, verifyCollaborationJournal, verifyCollaborationMission, verifyRejectedFallback, type Journal } from "../monad-collaboration-goal-acceptance.js";
import type { GoalView } from "../../services/hosted-agents/src/goal-types.js";
import type { HostedAgent, HostedRun } from "../../services/hosted-agents/src/types.js";
import type { GoalCall, GoalModelRoute } from "../../services/hosted-agents/src/goals/executor.js";

const wallet = "0x1111111111111111111111111111111111111111", provider = "0x2222222222222222222222222222222222222222";
const hex = (n: number) => "0x" + n.toString(16).padStart(64, "0");
function run(fallback = false): HostedRun {
  const service = { id: "external-writer-kimi-k2.6", name: "Writer", taskType: "writer", serviceId: "tabby/external/writer", modelId: "kimi-k2.6", priceRaw: "10000", provider,
    identity: { chainId: "10143", registry: wallet, agentId: "1999", wallet: provider }, reputation: { score: null, samples: 0, source: "registry" as const } };
  const stages = fallback ? ["plan", "phase-0", "phase-1", "review"] : ["plan", "phase-0", "review"];
  const calls = stages.map((stage, index) => {
    const external = stage.startsWith("phase-");
    return { stage, model: fallback && index === 0 ? "kimi-k3" : "kimi-k2.6", chargedRaw: fallback && index === 0 ? "20000" : "10000", promptTokens: 50, completionTokens: 50, paymentId: hex(index + 1), txHash: hex(index + 11), requestDigest: hex(index + 21), ...(external ? { serviceId: service.serviceId, promptDigest: "a".repeat(64), external: { service, paymentId: hex(index + 1), txHash: hex(index + 11), requestDigest: hex(index + 21), promptDigest: "a".repeat(64), assignmentDigest: "b".repeat(64) } } : {}) };
  });
  const mission: GoalView = { stage: "completed", phases: fallback ? [{ name: "Analyze", taskType: "analyst", goal: "Calculate", output: "46 orders, 460 revenue" }, { name: "Write", taskType: "writer", goal: "Write", output: "TABBY-SAME-GOAL-20261015: 46 orders, 460 revenue" }] : [{ name: "Write", taskType: "writer", goal: "Write", output: "Tabby update" }], calls, answer: fallback ? "TABBY-SAME-GOAL-20261015: 46 orders, 460 revenue" : "Tabby update", review: { passed: true, summary: "Meets constraints", checks: ["Data matches"] } };
  return { requestId: randomUUID(), agentId: randomUUID(), action: "goal", goal: fallback ? collaborationCases.fallback.goal : collaborationCases.external.goal, mission, status: "Succeeded", createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", reservedRaw: fallback ? "50000" : "60000", chargedRaw: fallback ? "50000" : "30000", recoverable: false, result: { phase: "Completed", terminal: true, success: true, chargedRaw: fallback ? "50000" : "30000", mission } };
}

test("acceptance journal rejects owner, goal, model and budget mutations before any paid call", () => {
  const spec = collaborationCases.fallback;
  const journal: any = { version: 1, origin: collaborationOrigin, chainId: "10143", runtime: "/private/original/runtime", owner: wallet, startedAt: "2026-10-15", cases: { fallback: { create: { requestId: randomUUID(), modelId: spec.modelId, perRunBudgetRaw: spec.budgetRaw }, deposit: { requestId: randomUUID(), action: "deposit", amountRaw: spec.depositRaw }, goal: { requestId: randomUUID(), action: "goal", goal: spec.goal } } } };
  verifyCollaborationJournal(journal, journal.runtime, wallet);
  for (const field of ["modelId", "perRunBudgetRaw"]) { const copy = structuredClone(journal); copy.cases.fallback.create[field] = "replacement"; assert.throws(() => verifyCollaborationJournal(copy, journal.runtime, wallet)); }
  const copy = structuredClone(journal); copy.cases.fallback.goal.goal = "Replacement goal"; assert.throws(() => verifyCollaborationJournal(copy, journal.runtime, wallet));
  assert.throws(() => verifyCollaborationJournal(journal, journal.runtime, provider));
  assert.throws(() => verifyCollaborationJournal(journal, "/another/runtime", wallet));
});

test("external acceptance cannot pass cosmetic cards or unreviewed output", () => {
  verifyCollaborationMission("external", run());
  const noHire = run(); for (const call of noHire.mission!.calls) delete call.external;
  assert.throws(() => verifyCollaborationMission("external", noHire), /REAL_EXTERNAL_HIRE_REQUIRED/);
  const noReview = run(); noReview.mission!.review!.passed = false;
  assert.throws(() => verifyCollaborationMission("external", noReview));
  const wrongChain = run(); wrongChain.mission!.calls[1].external!.service.identity!.chainId = "31337";
  assert.throws(() => verifyCollaborationMission("external", wrongChain));
});

test("fallback acceptance requires a paid strong plan followed by cheap execution and independent cheap review", () => {
  verifyCollaborationMission("fallback", run(true));
  const allCheap = run(true); allCheap.mission!.calls[0].model = "kimi-k2.6";
  assert.throws(() => verifyCollaborationMission("fallback", allCheap));
  const strongReview = run(true); strongReview.mission!.calls.at(-1)!.model = "kimi-k3";
  assert.throws(() => verifyCollaborationMission("fallback", strongReview), /SAME_GOAL_BUDGET_DOWNGRADE_REQUIRED/);
  const onePhase = run(true); onePhase.mission!.phases.pop();
  assert.throws(() => verifyCollaborationMission("fallback", onePhase), /TWO_SEQUENTIAL_CONTEXT_PHASES_REQUIRED/);
  const overBudget = run(true); overBudget.result!.chargedRaw = "60000";
  assert.throws(() => verifyCollaborationMission("fallback", overBudget));
});

test("audit binds catalog aliases to exact frozen Kimi route and named port before reading its relay journal", () => {
  const runtime = "/private/original/runtime", ports = { goalCheap: 42101, goalStrong: 42102 };
  for (const ids of [["cheap", "strong"], ["kimi-k2.6", "kimi-k3"]]) {
    const gateway = { models: [{ id: ids[0], model: "cheap/kimi-k2.6", responseModel: "kimi-k2.6" }, { id: ids[1], model: "strong/kimi-k3", responseModel: "kimi-k3" }] };
    const routes: GoalModelRoute[] = [{ id: "kimi-k2.6", relayUrl: "http://127.0.0.1:42101/v1/chat", provider, priceRaw: "10000", service: "tabby/mission", model: ids[0], physicalModel: "cheap/kimi-k2.6", responseModel: "kimi-k2.6" }, { id: "kimi-k3", relayUrl: "http://127.0.0.1:42102/v1/chat", provider, priceRaw: "20000", service: "tabby/mission", model: ids[1], physicalModel: "strong/kimi-k3", responseModel: "kimi-k3" }];
    for (const [index, route] of routes.entries()) {
      const call = { stage: "plan", route, inference: { receipt: { model: route.physicalModel } }, handle: { relayUrl: route.relayUrl, quote: { model: route.model } } } as unknown as GoalCall;
      assert.equal(goalRelayJournalDirectory(runtime, route.id, call, gateway, routes, ports, ports), `${runtime}/goal-${ids[index]}`);
      assert.throws(() => goalRelayJournalDirectory(runtime, "wrong-public-model", call, gateway, routes, ports, ports), /GOAL_AUDIT_PUBLIC_MODEL_CHANGED/);
      assert.throws(() => goalRelayJournalDirectory(runtime, route.id, call, gateway, routes, ports, { ...ports, [index ? "goalStrong" : "goalCheap"]: 1 }), /GOAL_AUDIT_NAMED_PORT_CHANGED/);
      const wrongEndpoint = structuredClone(call); wrongEndpoint.route!.relayUrl = "http://127.0.0.1:1/v1/chat";
      assert.throws(() => goalRelayJournalDirectory(runtime, route.id, wrongEndpoint, gateway, routes, ports, ports), /GOAL_AUDIT_CONFIGURED_ROUTE_CHANGED/);
      const ambiguous = structuredClone(gateway); ambiguous.models[1 - index].model = route.physicalModel;
      assert.throws(() => goalRelayJournalDirectory(runtime, route.id, call, ambiguous, routes, ports, ports), /GOAL_AUDIT_PHYSICAL_ROUTE_AMBIGUOUS/);
      const wrongCatalog = structuredClone(gateway); wrongCatalog.models[index].id = "../untrusted";
      assert.throws(() => goalRelayJournalDirectory(runtime, route.id, call, wrongCatalog, routes, ports, ports), /GOAL_AUDIT_CATALOG_ID_INVALID/);
    }
  }
});

test("failed paid fallback remains failed, and explicit recheck reuses its Agent/provision while freezing exactly one new goal and deposit", () => {
  const failed = run(true); failed.status = "Failed"; failed.reason = "HOSTED_GOAL_REVIEW_FAILED"; failed.result!.success = false; failed.result!.reason = failed.reason; failed.mission!.review!.passed = false;
  verifyRejectedFallback(failed); assert.throws(() => verifyCollaborationMission("fallback", failed));
  const originalAgent: HostedAgent = { id: failed.agentId, owner: wallet, wallet: provider, name: "Original fallback", modelId: "kimi-k3", strategy: "balanced", perRunBudgetRaw: "50000", totalBudgetRaw: "200000", allowCredit: false, createdAt: failed.createdAt, updatedAt: failed.updatedAt, status: "Ready", spentRaw: "0", reservedRaw: "0", binding: { chainId: "10143", agentId: "2364", wallet: provider } };
  const create = { requestId: randomUUID(), modelId: "kimi-k3", perRunBudgetRaw: "50000", totalBudgetRaw: "200000" };
  const provision: HostedRun = { ...run(), requestId: create.requestId, agentId: failed.agentId, action: "provision", mission: undefined };
  const journal: Journal = { version: 1, origin: collaborationOrigin, chainId: "10143", runtime: "/private/original/runtime", owner: wallet, startedAt: "2026-10-15", cases: { fallback: { create, agent: originalAgent, provision, goal: { requestId: failed.requestId, action: "goal", goal: collaborationCases.fallback.goal }, deposit: { requestId: randomUUID(), action: "deposit", amountRaw: "50000" }, result: structuredClone(failed) } } };
  const originalHistory = structuredClone(journal.cases.fallback), currentAgent = { ...originalAgent, spentRaw: "50000" };
  const entry = prepareFallbackRecheckCase(journal, currentAgent, failed, provision), firstIds = [entry.create.requestId, entry.deposit.requestId, entry.goal.requestId];
  assert.deepEqual(journal.cases.fallback, originalHistory); assert.equal(entry.agent!.id, originalAgent.id); assert.equal(entry.agent!.wallet, originalAgent.wallet);
  assert.equal(entry.create.requestId, create.requestId); assert.notEqual(entry.goal.requestId, failed.requestId); assert.notEqual(entry.deposit.requestId, originalHistory!.deposit.requestId);
  assert.equal(entry.retryOf, failed.requestId); assert.equal(entry.previousFailed!.chargedRaw, "50000"); assert.equal(entry.previousFailed!.paymentIds.length, 4);
  const second = prepareFallbackRecheckCase(journal, { ...currentAgent, activeRequestId: entry.goal.requestId }, failed, provision);
  assert.deepEqual([second.create.requestId, second.deposit.requestId, second.goal.requestId], firstIds); assert.equal(Object.keys(journal.cases).length, 2);
  assert.equal((BigInt(entry.previousFailed!.chargedRaw) + BigInt(run(true).result!.chargedRaw)).toString(), "100000");
  verifyCollaborationJournal(journal, journal.runtime, wallet);
  const tampered = structuredClone(journal); tampered.cases["fallback-recheck"]!.agent!.wallet = wallet;
  assert.throws(() => verifyCollaborationJournal(tampered, journal.runtime, wallet));
  const pristine = structuredClone(journal); delete pristine.cases["fallback-recheck"];
  assert.throws(() => prepareFallbackRecheckCase(pristine, { ...currentAgent, activeRequestId: randomUUID() }, failed, provision), /RECHECK_ORIGINAL_AGENT_BUSY/);
  const notFailed = structuredClone(failed); notFailed.status = "Running";
  assert.throws(() => prepareFallbackRecheckCase(pristine, currentAgent, notFailed, provision), /RECHECK_ORIGINAL_MUST_BE_TERMINAL_FAILED/);
  const passed = structuredClone(failed); passed.mission!.review!.passed = true;
  assert.throws(() => prepareFallbackRecheckCase(pristine, currentAgent, passed, provision));
});

test("recheck keeps the same strong-to-cheap paid sequence and enforces its smaller final artifact", () => {
  const recheck = run(true); recheck.goal = collaborationCases["fallback-recheck"].goal;
  const answer = "TABBY-SAME-GOAL-20261015\n订单合计46单；A收入170元，B收入290元，合计460元；B比A多12单。数据仅支持这些计算，不代表趋势或原因。以上结果已根据前一阶段计算整理，可供团队核对。";
  recheck.mission!.answer = answer; recheck.mission!.phases[1].output = answer;
  verifyCollaborationMission("fallback-recheck", recheck);
  recheck.mission!.answer = answer + "重复说明".repeat(20);
  assert.throws(() => verifyCollaborationMission("fallback-recheck", recheck), /RECHECK_FINAL_CHARACTER_LIMIT_REQUIRED/);
});
