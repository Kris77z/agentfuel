import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Wallet, Transaction, keccak256 } from "ethers";
import { fundMonadCollaborationGoals, validateSignedGoalFunding } from "../monad-collaboration-fund-goals.js";
import { collaborationCases, collaborationOrigin, prepareCollaborationCase, type Journal } from "../monad-collaboration-goal-acceptance.js";
import { fixture, key, startAnvil, stopAnvil } from "../../services/underwriter/test/fixture.js";
import { SessionStore } from "../../packages/pi-loop/src/session.js";

test("funding rejects a changed signed recipient, amount or fee before replay", async () => {
  const signer = new Wallet(key(1)), to = new Wallet(key(5)).address;
  const plan = { id: "test", case: "external" as const, asset: "MON" as const, to, amount: "350000000000000000", target: to, data: "0x", value: "350000000000000000" };
  const rawTransaction = await signer.signTransaction({ to, value: BigInt(plan.value), data: "0x", nonce: 2, chainId: 10143n, gasLimit: 21000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n });
  const entry = { from: signer.address, rawTransaction, txHash: keccak256(rawTransaction) };
  validateSignedGoalFunding(entry, plan, signer.address, 10143n, 100n);
  assert.throws(() => validateSignedGoalFunding(entry, { ...plan, target: signer.address }, signer.address, 10143n, 100n), /FUND_GOALS_SIGNED_RECIPIENT_CHANGED/);
  assert.throws(() => validateSignedGoalFunding(entry, { ...plan, value: "1" }, signer.address, 10143n, 100n));
  assert.throws(() => validateSignedGoalFunding(entry, plan, signer.address, 10143n, 99n), /FUND_GOALS_SIGNED_FEE_CHANGED/);
});

test("legacy and fresh goal wallets are funded once with isolated intents, canonical same-signature recovery and no transfer to old fallback", { timeout: 120000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tabby-fund-goals-"))), anvil = await startAnvil();
  const f = await fixture(anvil.rpc, join(root, "credit"), 6), runtime = join(root, "runtime"), output = join(runtime, "collaboration-goals-20261015");
  await mkdir(join(runtime, "hosted", "database"), { recursive: true, mode: 0o700 }); await mkdir(output, { mode: 0o700 });
  const write = async (file: string, data: unknown) => writeFile(file, typeof data === "string" ? data : JSON.stringify(data), { mode: 0o600 });
  const guardian = new Wallet(key(1)), owner = new Wallet(key(9)), guardianFile = join(root, "guardian.key"); await write(guardianFile, key(1)); await write(join(output, "owner.key"), key(9));
  const cases: any = {}, agents: any[] = [], creations: any[] = [];
  for (const [index, name] of (["external", "fallback"] as const).entries()) {
    const spec = collaborationCases[name], agent = { id: randomUUID(), owner: owner.address, wallet: new Wallet(key(index + 5)).address, modelId: spec.modelId }, create = { requestId: randomUUID(), modelId: spec.modelId, perRunBudgetRaw: spec.budgetRaw };
    agents.push(agent); creations.push({ owner: owner.address, requestId: create.requestId, agentId: agent.id });
    cases[name] = { create, agent, deposit: { requestId: randomUUID(), action: "deposit", amountRaw: spec.depositRaw }, goal: { requestId: randomUUID(), action: "goal", goal: spec.goal } };
  }
  await write(join(output, "journal.json"), { version: 1, origin: collaborationOrigin, chainId: "10143", runtime, owner: owner.address, startedAt: "2026-10-15", cases });
  const databaseFile = join(runtime, "hosted", "database", "session.json"); await write(databaseFile, { agents, creations });
  const bootstrapFile = join(root, "bootstrap.json"); await write(bootstrapFile, { chainId: "31337", frontendOrigin: collaborationOrigin, maxFeePerGas: "100000000000", payTo: guardian.address, asset: { address: await f.token!.getAddress(), decimals: 6 }, contracts: { manager: await f.manager.getAddress() }, roleKeyFiles: { guardian: guardianFile } });
  const deps = { provider: f.provider, allowLocalChain: true }, options = { runtime, output };
  try {
    const original = await readFile(join(output, "journal.json"), "utf8"), before = await f.provider.getTransactionCount(guardian.address);
    const inspected = await fundMonadCollaborationGoals(options, deps); assert.equal(inspected.readOnly, true);
    await assert.rejects(stat(join(output, "funding")), { code: "ENOENT" }); assert.equal(await f.provider.getTransactionCount(guardian.address), before);
    const operator = new SessionStore<{ directory: string }>(join(runtime, "wallets/operator", guardian.address.toLowerCase()));
    await operator.start(); await operator.write({ directory: join(root, "original-unresolved-guardian-intent") }); await operator.close();
    await assert.rejects(fundMonadCollaborationGoals({ ...options, mode: "apply" }, deps), /HOSTED_GUARDIAN_RECOVERY_REQUIRED/);
    await operator.start(); await operator.write({ directory: join(output, "funding") }); await operator.close();
    await f.provider.send("anvil_setBalance", [guardian.address, "0x" + 690000000000000000n.toString(16)]);
    await assert.rejects(fundMonadCollaborationGoals({ ...options, mode: "apply" }, deps), /FUND_GOALS_SOURCE_MON_INSUFFICIENT/);
    assert.equal(await f.provider.getTransactionCount(guardian.address), before);
    await assert.rejects(stat(join(output, "funding", "transactions.json")), { code: "ENOENT" });
    await f.provider.send("anvil_setBalance", [guardian.address, "0x3635c9adc5dea00000"]);
    const broadcast = f.provider.broadcastTransaction.bind(f.provider);
    f.provider.broadcastTransaction = async () => { throw new Error("controlled lost acknowledgement before broadcast"); };
    await assert.rejects(fundMonadCollaborationGoals({ ...options, mode: "apply" }, deps), /RECORDED_TRANSACTION_UNCONFIRMED_USE_SAME_OUTPUT/);
    f.provider.broadcastTransaction = broadcast;
    const transactionFile = join(output, "funding", "transactions.json"), signedBefore = JSON.parse(await readFile(transactionFile, "utf8"));
    assert.equal(Object.keys(signedBefore).length, 1); assert.equal(Transaction.from(Object.values<any>(signedBefore)[0].rawTransaction).nonce, before);
    const funded = await fundMonadCollaborationGoals({ ...options, mode: "recover" }, deps);
    assert.equal(funded.applied, true); assert.equal(funded.receipts!.length, 4); assert.equal(await f.provider.getTransactionCount(guardian.address), before + 4);
    for (const [name, raw] of [["external", "60000"], ["fallback", "50000"]] as const) {
      assert.equal(await f.provider.getBalance(cases[name].agent.wallet), 350000000000000000n);
      assert.equal(await f.token!.getFunction("balanceOf").staticCall(cases[name].agent.wallet), BigInt(raw));
    }
    const signedAfter = JSON.parse(await readFile(transactionFile, "utf8")); assert.deepEqual(signedAfter[Object.keys(signedBefore)[0]], Object.values(signedBefore)[0]);
    const replay = await fundMonadCollaborationGoals({ ...options, mode: "recover" }, deps); assert.equal(replay.chainWrites, 0); assert.deepEqual(replay.receipts, funded.receipts);
    assert.equal(await f.provider.getTransactionCount(guardian.address), before + 4); assert.equal(await readFile(join(output, "journal.json"), "utf8"), original);
    const originalSigned = await readFile(transactionFile, "utf8"); await rm(transactionFile);
    await assert.rejects(fundMonadCollaborationGoals({ ...options, mode: "recover" }, deps), /FUND_GOALS_ORIGINAL_SIGNED_JOURNAL_MISSING/);
    assert.equal(await f.provider.getTransactionCount(guardian.address), before + 4); await write(transactionFile, originalSigned);
    assert.equal((await fundMonadCollaborationGoals({ ...options, mode: "recover" }, deps)).chainWrites, 0);
    // A separately prepared recheck uses the existing fallback identity and
    // buys no new native funding. Its journal cannot replay the original four.
    const updatedJournal = JSON.parse(await readFile(join(output, "journal.json"), "utf8")), prior = updatedJournal.cases.fallback;
    const proofHash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
    const calls = ["plan", "phase-0", "phase-1", "review"].map((stage, index) => ({ stage, model: index ? "kimi-k2.6" : "kimi-k3", chargedRaw: index ? "10000" : "20000", promptTokens: 10, completionTokens: 10, paymentId: proofHash(index + 1), txHash: proofHash(index + 11) }));
    const mission = { stage: "completed", phases: [{ name: "Analyze", taskType: "analyst", goal: "Calculate", output: "46 orders" }, { name: "Write", taskType: "writer", goal: "Write", output: "Original long artifact" }], calls, answer: "Original long artifact", review: { passed: false, summary: "Length exceeded", checks: ["Length exceeded"] } };
    prior.result = { requestId: prior.goal.requestId, agentId: prior.agent.id, action: "goal", goal: prior.goal.goal, status: "Failed", reason: "HOSTED_GOAL_REVIEW_FAILED", mission, result: { terminal: true, success: false, chargedRaw: "50000", reason: "HOSTED_GOAL_REVIEW_FAILED", mission } };
    updatedJournal.cases["fallback-recheck"] = { create: structuredClone(prior.create), agent: structuredClone(prior.agent), deposit: { requestId: randomUUID(), action: "deposit", amountRaw: "50000" }, goal: { requestId: randomUUID(), action: "goal", goal: collaborationCases["fallback-recheck"].goal }, retryOf: prior.goal.requestId, previousFailed: { requestId: prior.goal.requestId, reason: "HOSTED_GOAL_REVIEW_FAILED", chargedRaw: "50000", paymentIds: calls.map(call => call.paymentId), txHashes: calls.map(call => call.txHash) } };
    await write(join(output, "journal.json"), updatedJournal);
    const databaseBeforeRecheck = await readFile(databaseFile, "utf8"), nativeBeforeRecheck = await f.provider.getBalance(prior.agent.wallet), initialFundingState = await readFile(join(output, "funding/session.json"), "utf8");
    const recheckOptions = { ...options, caseName: "fallback-recheck" as const };
    const recheckInspect = await fundMonadCollaborationGoals(recheckOptions, deps); assert.equal(recheckInspect.plans!.length, 1); assert.equal(recheckInspect.plans![0].asset, "test-USDC");
    const recheck = await fundMonadCollaborationGoals({ ...recheckOptions, mode: "apply" }, deps); assert.equal(recheck.chainWrites, 1); assert.equal(recheck.receipts!.length, 1); assert.equal(recheck.receipts![0].amount, "50000");
    assert.equal(await f.provider.getTransactionCount(guardian.address), before + 5); assert.equal(await f.provider.getBalance(prior.agent.wallet), nativeBeforeRecheck);
    assert.equal(await f.token!.getFunction("balanceOf").staticCall(prior.agent.wallet), 100000n);
    const recheckAgain = await fundMonadCollaborationGoals({ ...recheckOptions, mode: "recover" }, deps); assert.equal(recheckAgain.chainWrites, 0); assert.deepEqual(recheckAgain.receipts, recheck.receipts);
    assert.equal(await f.provider.getTransactionCount(guardian.address), before + 5); assert.equal(await readFile(databaseFile, "utf8"), databaseBeforeRecheck);
    assert.equal(await readFile(transactionFile, "utf8"), originalSigned); assert.equal(await readFile(join(output, "funding/session.json"), "utf8"), initialFundingState);
    assert.equal(Object.keys(JSON.parse(await readFile(join(output, "funding-fallback-recheck/transactions.json"), "utf8"))).length, 1);
    // A fresh batch has its own owner, two new wallets and explicitly approved
    // native/cash amounts. It must never fund the retained failed fallback.
    const freshOutput = join(runtime, "collaboration-goals-20261017"), freshOwner = new Wallet(key(10)); await mkdir(freshOutput, { mode: 0o700 });
    await write(join(freshOutput, "owner.key"), key(10));
    const freshJournal: Journal = { version: 1, origin: collaborationOrigin, chainId: "10143", runtime, owner: freshOwner.address, startedAt: "2026-10-17T00:00:00.000Z", cases: {} };
    for (const [index, name] of (["external", "fallback-fresh"] as const).entries()) {
      const entry = prepareCollaborationCase(freshJournal, name), agent = { id: randomUUID(), owner: freshOwner.address, wallet: new Wallet(key(index + 7)).address, modelId: collaborationCases[name].modelId };
      entry.agent = agent as any; agents.push(agent); creations.push({ owner: freshOwner.address, requestId: entry.create.requestId, agentId: agent.id });
    }
    const freshJournalFile = join(freshOutput, "journal.json"); await write(freshJournalFile, freshJournal); await write(databaseFile, { agents, creations });
    const freshOptions = { runtime, output: freshOutput, caseName: "fallback-fresh" as const, nativeAmountWei: "20000000000000000", externalUsdcRaw: "60000", fallbackUsdcRaw: "50000" };
    const freshNonce = await f.provider.getTransactionCount(guardian.address), freshDatabase = await readFile(databaseFile, "utf8"), freshJournalBytes = await readFile(freshJournalFile, "utf8");
    const oldBalances = await Promise.all([f.provider.getBalance(prior.agent.wallet), f.token!.getFunction("balanceOf").staticCall(prior.agent.wallet)]);
    await assert.rejects(fundMonadCollaborationGoals({ runtime, output: freshOutput, caseName: "fallback-fresh" }, deps), /FUND_GOALS_FRESH_EXPLICIT_AMOUNTS_REQUIRED/);
    await assert.rejects(fundMonadCollaborationGoals({ runtime, output: freshOutput }, deps), /FUND_GOALS_FRESH_REQUIRES_EXPLICIT_CASE/);
    await assert.rejects(fundMonadCollaborationGoals({ ...freshOptions, fallbackUsdcRaw: "60000" }, deps), /FUND_GOALS_FALLBACK_CASH_CHANGED/);
    const mixed = structuredClone(freshJournal); mixed.cases.fallback = structuredClone(updatedJournal.cases.fallback); mixed.cases.fallback!.agent!.owner = freshOwner.address; await write(freshJournalFile, mixed);
    await assert.rejects(fundMonadCollaborationGoals(freshOptions, deps), /FUND_GOALS_FRESH_DIRECTORY_MUST_EXCLUDE_OLD_CASES/); await write(freshJournalFile, freshJournalBytes);
    assert.equal(await f.provider.getTransactionCount(guardian.address), freshNonce);
    const freshInspect = await fundMonadCollaborationGoals(freshOptions, deps);
    assert.deepEqual(freshInspect.plans!.map(plan => [plan.case, plan.asset, plan.amount]), [["external", "MON", freshOptions.nativeAmountWei], ["external", "test-USDC", "60000"], ["fallback-fresh", "MON", freshOptions.nativeAmountWei], ["fallback-fresh", "test-USDC", "50000"]]);
    await assert.rejects(stat(join(freshOutput, "funding-fresh")), { code: "ENOENT" });
    f.provider.broadcastTransaction = async () => { throw new Error("controlled fresh acknowledgement lost before broadcast"); };
    await assert.rejects(fundMonadCollaborationGoals({ ...freshOptions, mode: "apply" }, deps), /RECORDED_TRANSACTION_UNCONFIRMED_USE_SAME_OUTPUT/); f.provider.broadcastTransaction = broadcast;
    const freshSignedFile = join(freshOutput, "funding-fresh/transactions.json"), freshSignedBefore = JSON.parse(await readFile(freshSignedFile, "utf8")); assert.equal(Object.keys(freshSignedBefore).length, 1);
    const freshFunded = await fundMonadCollaborationGoals({ ...freshOptions, mode: "recover" }, deps); assert.equal(freshFunded.chainWrites, 3); assert.equal(freshFunded.receipts!.length, 4);
    const freshSignedAfter = JSON.parse(await readFile(freshSignedFile, "utf8")); assert.deepEqual(freshSignedAfter[Object.keys(freshSignedBefore)[0]], Object.values(freshSignedBefore)[0]);
    for (const name of ["external", "fallback-fresh"] as const) {
      assert.equal(await f.provider.getBalance(freshJournal.cases[name]!.agent!.wallet), BigInt(freshOptions.nativeAmountWei));
      assert.equal(await f.token!.getFunction("balanceOf").staticCall(freshJournal.cases[name]!.agent!.wallet), BigInt(collaborationCases[name].depositRaw));
    }
    const freshReplay = await fundMonadCollaborationGoals({ ...freshOptions, mode: "recover" }, deps); assert.equal(freshReplay.chainWrites, 0); assert.deepEqual(freshReplay.receipts, freshFunded.receipts);
    await assert.rejects(fundMonadCollaborationGoals({ ...freshOptions, mode: "recover", nativeAmountWei: "30000000000000000" }, deps), /FUND_GOALS_FROZEN_INTENT_CHANGED/);
    assert.equal(await f.provider.getTransactionCount(guardian.address), freshNonce + 4);
    assert.deepEqual(await Promise.all([f.provider.getBalance(prior.agent.wallet), f.token!.getFunction("balanceOf").staticCall(prior.agent.wallet)]), oldBalances);
    assert.equal(await readFile(databaseFile, "utf8"), freshDatabase); assert.equal(await readFile(freshJournalFile, "utf8"), freshJournalBytes);
    assert.equal(await readFile(transactionFile, "utf8"), originalSigned); assert.equal(await readFile(join(output, "funding/session.json"), "utf8"), initialFundingState);
    const changed = JSON.parse(await readFile(databaseFile, "utf8")); changed.agents[0].wallet = new Wallet(key(8)).address; await write(databaseFile, changed);
    await assert.rejects(fundMonadCollaborationGoals(options, deps), /FUND_GOALS_ORIGINAL_AGENT_BINDING_CHANGED/);
  } finally { await f.close(); await stopAnvil(anvil.child); await rm(root, { recursive: true, force: true }); }
});
