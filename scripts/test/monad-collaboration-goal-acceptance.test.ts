import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { collaborationCases, collaborationOrigin, collaborationRevisionEvidence, goalRelayJournalDirectory, prepareCollaborationCase, prepareFallbackRecheckCase, verifyCollaborationJournal, verifyCollaborationMission, verifyRejectedFallback, type Journal } from "../monad-collaboration-goal-acceptance.js";
import type { GoalView } from "../../services/hosted-agents/src/goal-types.js";
import type { HostedAgent, HostedRun } from "../../services/hosted-agents/src/types.js";
import type { GoalCall, GoalModelRoute, GoalState } from "../../services/hosted-agents/src/goals/executor.js";

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

function revisedExternal() {
  const original = run(), mission = original.mission!;
  mission.calls.push(...["revision", "revision-review"].map((stage, index) => ({ ...mission.calls[2], stage, paymentId: hex(index + 4), txHash: hex(index + 14), requestDigest: hex(index + 24) })));
  mission.answer = "Revised Tabby update with all three requested capabilities.";
  original.chargedRaw = "50000"; original.result!.chargedRaw = "50000";
  const firstReview = { passed: false, summary: "Add the requested capability list", checks: ["Required format missing"] };
  const calls: GoalCall[] = mission.calls.map(call => ({ stage: call.stage, max_completion_tokens: 1024,
    messages: [{ role: "system", content: "Controlled acceptance fixture" }, { role: "user", content: JSON.stringify({ originalGoal: original.goal,
      artifact: call.stage === "revision-review" ? mission.answer : mission.phases[0].output, ...(call.stage === "revision" ? { review: firstReview } : {}) }) }],
    response: { text: call.stage === "review" ? JSON.stringify(firstReview) : call.stage === "revision-review" ? JSON.stringify(mission.review) : call.stage === "revision" ? ` ${mission.answer} ` : "unused",
      chargedRaw: call.chargedRaw, promptTokens: call.promptTokens, completionTokens: call.completionTokens } }));
  const saved: Pick<GoalState, "calls" | "input" | "research"> = { calls, input: { goal: original.goal!, owner: wallet, wallet, agentId: original.agentId,
    chainAgentId: "2368", chainId: "10143", strategy: "balanced", reservedRaw: "60000" } };
  return { original, saved };
}

test("external acceptance preserves one paid revision and independent re-review without truncating its five-call evidence", () => {
  const { original, saved } = revisedExternal(), frozen = structuredClone(original);
  const mission = verifyCollaborationMission("external", original), evidence = collaborationRevisionEvidence(mission, saved);
  assert.deepEqual(mission.calls.map(call => call.stage), ["plan", "phase-0", "review", "revision", "revision-review"]);
  assert.equal(mission.calls.filter(call => call.external).length, 1); assert.equal(mission.calls.reduce((sum, call) => sum + BigInt(call.chargedRaw), 0n), 50000n);
  assert.ok(evidence.performed); assert.equal(evidence.count, 1); assert.equal(evidence.firstReview?.passed, false); assert.equal(evidence.finalReview?.passed, true);
  assert.equal(evidence.original?.characters, mission.phases[0].output!.length); assert.equal(evidence.revised?.characters, mission.answer!.length);
  assert.notEqual(evidence.original?.sha256, evidence.revised?.sha256); assert.deepEqual(original, frozen, "audit must never rewrite the original outcome/output/UUID");
  const noRevision = run(); assert.deepEqual(collaborationRevisionEvidence(noRevision.mission!, { ...saved, calls: saved.calls.slice(0, 3) }), { performed: false });
});

test("revision acceptance rejects incomplete, reordered, duplicated, unreviewed and over-budget calls", () => {
  const changeCalls = (mutate: (calls: GoalView["calls"]) => void) => { const { original } = revisedExternal(); mutate(original.mission!.calls); return original; };
  for (const invalid of [
    changeCalls(calls => { calls.pop(); }),
    changeCalls(calls => { calls.splice(3, 1); }),
    changeCalls(calls => { [calls[3], calls[4]] = [calls[4], calls[3]]; }),
    changeCalls(calls => { calls.push(...structuredClone(calls.slice(3))); }),
    changeCalls(calls => { calls.push({ ...calls[3], stage: "unreviewed-extra" }); }),
  ]) assert.throws(() => verifyCollaborationMission("external", invalid), /COLLABORATION_CALL_SEQUENCE_CHANGED/);
  const duplicate = changeCalls(calls => { calls[3].paymentId = calls[2].paymentId; });
  assert.throws(() => verifyCollaborationMission("external", duplicate), /DUPLICATE_GOAL_PAYMENT/);
  const overBudget = revisedExternal().original; overBudget.mission!.calls[3].chargedRaw = "30000"; overBudget.result!.chargedRaw = "70000";
  assert.throws(() => verifyCollaborationMission("external", overBudget));
  const unreviewed = revisedExternal().original; unreviewed.mission!.review!.passed = false;
  assert.throws(() => verifyCollaborationMission("external", unreviewed));
  const externalReview = revisedExternal().original; Object.assign(externalReview.mission!.calls[4], { ...externalReview.mission!.calls[1], stage: "revision-review" });
  assert.throws(() => verifyCollaborationMission("external", externalReview), /INDEPENDENT_HOST_REVIEW_REQUIRED/);
  const fallback = run(true); fallback.mission!.calls.push(...revisedExternal().original.mission!.calls.slice(3));
  assert.throws(() => verifyCollaborationMission("fallback-fresh", fallback), /FALLBACK_ORIGINAL_FOUR_CALLS_REQUIRED|RECHECK_FINAL_CHARACTER_LIMIT_REQUIRED/);
});

test("revision evidence binds the failed review, unchanged original artifact and independently reviewed final output", () => {
  for (const mutate of [
    (saved: ReturnType<typeof revisedExternal>["saved"]) => { const input = JSON.parse(saved.calls[3].messages[1].content); input.artifact = "Replacement original"; saved.calls[3].messages[1].content = JSON.stringify(input); },
    (saved: ReturnType<typeof revisedExternal>["saved"]) => { const input = JSON.parse(saved.calls[3].messages[1].content); input.review.passed = true; saved.calls[3].messages[1].content = JSON.stringify(input); },
    (saved: ReturnType<typeof revisedExternal>["saved"]) => { saved.calls[3].response!.text = "Replacement final output"; },
    (saved: ReturnType<typeof revisedExternal>["saved"]) => { const input = JSON.parse(saved.calls[4].messages[1].content); input.artifact = "Unreviewed final"; saved.calls[4].messages[1].content = JSON.stringify(input); },
    (saved: ReturnType<typeof revisedExternal>["saved"]) => { saved.calls[4].response!.text = JSON.stringify({ passed: false, summary: "Failed", checks: [] }); },
    (saved: ReturnType<typeof revisedExternal>["saved"]) => { saved.calls[2].response!.text = JSON.stringify({ passed: true, summary: "Already passed", checks: [] }); },
    (saved: ReturnType<typeof revisedExternal>["saved"]) => { saved.calls.push(structuredClone(saved.calls[3])); },
  ]) {
    const { original, saved } = revisedExternal(); mutate(saved);
    assert.throws(() => collaborationRevisionEvidence(original.mission!, saved));
  }
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

test("fresh fallback freezes the successful bounded prompt and one new set of IDs without a failed prerequisite or higher cumulative allowance", () => {
  const journal: Journal = { version: 1, origin: collaborationOrigin, chainId: "10143", runtime: "/private/original/runtime", owner: wallet, startedAt: "2026-10-17T00:00:00.000Z", cases: {} };
  const fresh = prepareCollaborationCase(journal, "fallback-fresh");
  assert.equal(fresh.goal.goal, collaborationCases["fallback-recheck"].goal); assert.equal(fresh.create.name, "Tabby Monad fallback-fresh 20261017");
  assert.equal(fresh.create.perRunBudgetRaw, "50000"); assert.equal(fresh.create.totalBudgetRaw, "50000"); assert.equal(fresh.create.allowCredit, false);
  assert.equal(fresh.retryOf, undefined); assert.equal(fresh.previousFailed, undefined); assert.equal(journal.cases.fallback, undefined);
  assert.equal(new Set([fresh.create.requestId, fresh.deposit.requestId, fresh.goal.requestId]).size, 3);
  const frozen = structuredClone(journal);
  assert.equal(prepareCollaborationCase(journal, "fallback-fresh"), fresh); assert.deepEqual(journal, frozen);
  const retained = prepareCollaborationCase(journal, "fallback"), failed = run(true);
  failed.status = "Failed"; failed.reason = "HOSTED_GOAL_REVIEW_FAILED"; failed.result!.success = false; failed.result!.reason = failed.reason; failed.mission!.review!.passed = false;
  retained.result = failed; const originalHistory = structuredClone(retained);
  prepareCollaborationCase(journal, "fallback-fresh"); assert.deepEqual(journal.cases.fallback, originalHistory);
  for (const field of ["perRunBudgetRaw", "totalBudgetRaw"]) { const changed = structuredClone(journal); changed.cases["fallback-fresh"]!.create[field] = "60000"; assert.throws(() => verifyCollaborationJournal(changed, journal.runtime, wallet)); }
  const inheritedFailure = structuredClone(journal); inheritedFailure.cases["fallback-fresh"]!.retryOf = retained.goal.requestId;
  assert.throws(() => verifyCollaborationJournal(inheritedFailure, journal.runtime, wallet), /FRESH_FALLBACK_IS_NOT_A_RECHECK/);
  const colliding = structuredClone(journal); colliding.cases["fallback-fresh"]!.goal.requestId = retained.goal.requestId;
  assert.throws(() => verifyCollaborationJournal(colliding, journal.runtime, wallet), /FRESH_FALLBACK_ORIGINAL_UUID_COLLISION/);
  const sameId = structuredClone(journal); sameId.cases["fallback-fresh"]!.deposit.requestId = fresh.goal.requestId;
  assert.throws(() => verifyCollaborationJournal(sameId, journal.runtime, wallet), /FRESH_FALLBACK_UUID_COLLISION/);
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

test("recheck and fresh fallback keep the same strong-to-cheap paid sequence and enforce the smaller final artifact", () => {
  const recheck = run(true); recheck.goal = collaborationCases["fallback-recheck"].goal;
  const answer = "TABBY-SAME-GOAL-20261015\n订单合计46单；A收入170元，B收入290元，合计460元；B比A多12单。数据仅支持这些计算，不代表趋势或原因。以上结果已根据前一阶段计算整理，可供团队核对。";
  recheck.mission!.answer = answer; recheck.mission!.phases[1].output = answer;
  verifyCollaborationMission("fallback-recheck", recheck);
  verifyCollaborationMission("fallback-fresh", recheck);
  recheck.mission!.answer = answer + "重复说明".repeat(20);
  recheck.mission!.phases[1].output = recheck.mission!.answer;
  assert.throws(() => verifyCollaborationMission("fallback-recheck", recheck), /RECHECK_FINAL_CHARACTER_LIMIT_REQUIRED/);
  assert.throws(() => verifyCollaborationMission("fallback-fresh", recheck), /RECHECK_FINAL_CHARACTER_LIMIT_REQUIRED/);
});
