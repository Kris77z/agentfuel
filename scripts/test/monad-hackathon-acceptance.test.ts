import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Interface, type JsonRpcProvider } from "ethers";
import { accountInterface, requestDigest } from "../../packages/sdk/src/protocol.js";
import { atomicJson, ESCROW_ABI } from "../../services/arena/src/protocol.js";
import { modelCatalogDigest } from "../../services/hosted-agents/src/metered-task.js";
import type { HostedAgent, HostedRun, HostedFinance } from "../../services/hosted-agents/src/types.js";
import type { MonadHostedBootstrap } from "../monad-hosted-runtime.js";
import { createHackathonJournal, verifyHackathonJournal, freezeHackathonGas, hackathonDispatch, verifyHackathonRun, recordHackathonOutcome, collectHackathonTaskEvidence } from "../monad-hackathon-acceptance.js";
import { createHash } from "node:crypto";

const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
function bootstrap(root = "/private/owned") {
  return { version: 1, chainId: "10143", frontendOrigin: "https://monad.tabbyai.xyz", rpcUrlFile: `${root}/rpc-url`, rpcTransport: "direct", maxFeePerGas: "250000000000",
    contracts: { account: address(3), adapter: address(4), manager: address(5), escrow: address(6) }, asset: { address: address(7), symbol: "USDC", decimals: 6 }, identity: address(9), payTo: address(2),
    gatewayReadyFile: `${root}/gateway/ready.json`, roleKeyFiles: { guardian: `${root}/guardian.key`, verifier: `${root}/verifier.key`, sponsor: `${root}/sponsor.key` },
    tasks: [{ taskId: "19", deadlineMs: 1, problemId: "sum-integers", creditLimit: "80000" }] } as unknown as MonadHostedBootstrap;
}
function scenario(root = "/private/owned", feeBps = 1500n) {
  const b = bootstrap(root), state = createHackathonJournal(`${root}/runtime`, `${root}/bootstrap.json`, b, 1800000000000);
  state.owner = address(1);
  state.tasks = [20, 21].map(id => ({ taskId: String(id), problemId: "sum-integers", creditLimit: "80000", deadlineMs: state.deadline * 1000, poster: address(2) }));
  const agent: HostedAgent = { ...state.create, id: "agent-original", owner: state.owner, wallet: address(10), binding: { chainId: "10143", agentId: "2366", wallet: address(10) },
    status: "Ready", spentRaw: "0", reservedRaw: "0", createdAt: "2026-10-17", updatedAt: "2026-10-17" };
  state.agent = agent;
  const block = (number: number) => ({ number, hash: hash(100 + number), timestamp: 1800000000 + number });
  const finance = (completed: number, cash: bigint, number: number): Extract<HostedFinance, { status: "confirmed" }> => ({ status: "confirmed", observedAt: "2026-10-17", chainId: "10143", agentId: "2366", wallet: agent.wallet,
    block: block(number), cashRaw: String(cash), debtRaw: "0", scannedTaskCount: 21, ownedTaskCount: completed,
    credit: { score: String(500 + 70 * completed), tier: completed === 2 ? "B" : "C", tierCapRaw: "200000", feeBps: String(feeBps), eligible: true, rejection: null },
    policy: { maxCashPerTxRaw: "120000", maxDebtPerTxRaw: "120000", maxDebtPerDayRaw: "240000", ownerFrozen: false },
    counts: { repayments: String(completed), defaults: "0", mirrorRepayments: String(completed), successes: String(completed), mirrorDefaults: "0" } });
  const initial = finance(0, 40000n, 10), principalOne = 80000n, feeOne = principalOne * feeBps / 10000n;
  const firstAfter = finance(1, 150000n - principalOne - feeOne, 13), principalTwo = 120000n - BigInt(firstAfter.cashRaw), feeTwo = principalTwo * feeBps / 10000n;
  const secondAfter = finance(2, 150000n - principalTwo - feeTwo, 16);
  const run = (index: 0 | 1, cash: string, principal: bigint, fee: bigint, number: number): HostedRun => ({ requestId: state.runs[index].input.requestId, agentId: agent.id, action: "metered-task", status: "Succeeded",
    createdAt: "2026-10-17", updatedAt: "2026-10-17", reservedRaw: "120000", chargedRaw: "120000", recoverable: false,
    result: { phase: "Succeeded", terminal: true, success: true, taskId: state.tasks[index].taskId, chargedRaw: "120000", refundedRaw: "0", fromCashRaw: cash, fromCreditRaw: String(principal),
      paymentId: hash(20 + index), paymentTxHash: hash(30 + index), settlement: { txHash: hash(40 + index), block: block(number), passed: true, loanStatus: "2", repaidRaw: String(principal + fee), slashedRaw: "0", residualRaw: String(150000n - principal - fee) } } });
  const first = run(0, initial.cashRaw, principalOne, feeOne, 12), second = run(1, firstAfter.cashRaw, principalTwo, feeTwo, 15);
  state.runs[0].before = initial; state.runs[0].after = firstAfter; state.runs[0].result = first;
  state.runs[1].before = firstAfter; state.runs[1].after = secondAfter; state.runs[1].result = second;
  return { b, state, agent, block, initial, firstAfter, secondAfter, first, second, feeOne };
}

test("task-only preparation freezes two future requests without creating an owner, and preserves its deadline across catalog appends", () => {
  const b = bootstrap(), old = structuredClone(b), now = 1800000000000;
  const state = createHackathonJournal("/private/owned/runtime", "/private/owned/bootstrap.json", b, now);
  assert.equal(state.owner, undefined); assert.equal(state.agent, undefined); assert.deepEqual(state.tasks, []);
  assert.equal(state.deadline, now / 1000 + 72 * 3600); assert.equal(state.runs.length, 2);
  assert.equal(new Set([state.create.requestId, state.deposit.requestId, ...state.runs.map(entry => entry.input.requestId)]).size, 4);
  const saved = structuredClone(state), appended: MonadHostedBootstrap = { ...b, tasks: [...b.tasks, { taskId: "20", problemId: "sum-integers", creditLimit: "80000", deadlineMs: state.deadline * 1000 }] };
  verifyHackathonJournal(state, state.runtime, state.bootstrap, appended); assert.deepEqual(state, saved); assert.deepEqual(b, old);
  assert.throws(() => createHackathonJournal("relative", state.bootstrap, b, now), /DOMAIN_REQUIRED/);
});

test("recovery rejects replaced UUID, budget, cash, deadline, runtime and economic domain rather than refreshing authorization", () => {
  const { b, state } = scenario(); verifyHackathonJournal(state, state.runtime, state.bootstrap, b);
  for (const mutate of [(copy: typeof state) => { copy.runs[0].input.requestId = copy.runs[1].input.requestId; },
    (copy: typeof state) => { copy.create.totalBudgetRaw = "999999" as "240000"; },
    (copy: typeof state) => { copy.deposit.amountRaw = "50000" as "40000"; }, (copy: typeof state) => { copy.deadline += 86400; },
    (copy: typeof state) => { copy.tasks[0].deadlineMs += 86400000; }, (copy: typeof state) => { copy.create.allowCredit = false as true; }]) {
    const changed = structuredClone(state); mutate(changed); assert.throws(() => verifyHackathonJournal(changed, state.runtime, state.bootstrap, b));
  }
  assert.throws(() => verifyHackathonJournal(state, "/another/runtime", state.bootstrap, b), /BINDING_CHANGED/);
  assert.throws(() => verifyHackathonJournal(state, state.runtime, state.bootstrap, { ...b, payTo: address(99) }), /BINDING_CHANGED/);
});

test("explicit gas funding freezes before signing without changing prepared task IDs, deadlines, budgets or request plan", () => {
  const { state, b } = scenario(), original = structuredClone(state), amount = "300000000000000000";
  assert.equal(freezeHackathonGas(state, amount), amount);
  const frozen = structuredClone(state.gasFunding);
  verifyHackathonJournal(state, state.runtime, state.bootstrap, b);
  assert.equal(freezeHackathonGas(state), amount, "omission on recovery retains the chosen amount rather than defaulting to 0.6");
  assert.equal(freezeHackathonGas(state, amount, amount), amount); assert.deepEqual(state.gasFunding, frozen);
  const { gasFunding: _gas, ...rest } = state; assert.deepEqual(rest, original);
  assert.throws(() => freezeHackathonGas(state, "400000000000000000"), /GAS_SNAPSHOT_CHANGED/);
  const changedWallet = structuredClone(state); changedWallet.agent!.wallet = address(99);
  assert.throws(() => freezeHackathonGas(changedWallet), /GAS_SNAPSHOT_CHANGED/);
  const changedAmount = structuredClone(state); changedAmount.gasFunding!.amountWei = "200000000000000000";
  assert.throws(() => verifyHackathonJournal(changedAmount, state.runtime, state.bootstrap, b), /GAS_SNAPSHOT_CHANGED/);
});

test("gas override keeps the original ceiling, rejects noncanonical amounts and cannot replace an existing signed intent", () => {
  const { state } = scenario(); assert.equal(freezeHackathonGas(state), "600000000000000000");
  for (const invalid of ["0", "-1", "+1", "01", "0.3", "3e17", " 300000000000000000", "300000000000000000 ", "600000000000000001", "9".repeat(79), ""]) {
    assert.throws(() => freezeHackathonGas(scenario().state, invalid), /GAS_AMOUNT_INVALID/);
  }
  const existing = scenario().state, pristine = structuredClone(existing);
  assert.throws(() => freezeHackathonGas(existing, "300000000000000000", "600000000000000000"), /ORIGINAL_GAS_INTENT_CHANGED/);
  assert.deepEqual(existing, pristine, "a conflicting existing intent is rejected before a new snapshot is persisted");
  assert.equal(freezeHackathonGas(existing, undefined, "600000000000000000"), "600000000000000000");
});

test("an uncertain or paused original can only be explicitly resumed; terminal failure and success never buy a replacement", () => {
  const { state, first } = scenario(), entry = structuredClone(state.runs[0]); delete entry.result; delete entry.after;
  assert.equal(hackathonDispatch(entry, undefined, false), "post"); entry.submittedAt = "persisted-before-post";
  assert.throws(() => hackathonDispatch(entry, undefined, false), /UNCERTAIN_DISPATCH_USE_ORIGINAL_RECOVER/);
  assert.equal(hackathonDispatch(entry, undefined, true), "post");
  const paused = { ...first, status: "Paused" as const, reason: "GATEWAY_OUTCOME_UNKNOWN" };
  assert.throws(() => hackathonDispatch(entry, paused, false), /PAUSED_USE_ORIGINAL_RECOVER/);
  assert.equal(hackathonDispatch(entry, paused, true), "post");
  for (const status of ["Succeeded", "Failed"] as const) assert.equal(hackathonDispatch(entry, { ...first, status }, true), "terminal");
  assert.equal(hackathonDispatch(entry, { ...first, status: "Running" }, false), "wait");
  assert.throws(() => hackathonDispatch(entry, { ...first, requestId: "replacement" }, true), /REQUEST_CHANGED/);
});

test("revisiting task one after task two keeps its original paid result and financial boundary", () => {
  const { state, first, firstAfter, secondAfter } = scenario(), original = structuredClone(state.runs[0]);
  recordHackathonOutcome(state.runs[0], first, secondAfter); assert.deepEqual(state.runs[0], original);
  const changed = structuredClone(first); changed.result!.paymentTxHash = hash(99);
  assert.throws(() => recordHackathonOutcome(state.runs[0], changed, firstAfter), /ORIGINAL_TERMINAL_RESULT_CHANGED/);
  const noAfter = structuredClone(original); delete noAfter.after; recordHackathonOutcome(noAfter, first, firstAfter); assert.deepEqual(noAfter.after, firstAfter);
  const pending = structuredClone(original); pending.result!.status = "Paused"; pending.after = { ...firstAfter, debtRaw: "92000" };
  recordHackathonOutcome(pending, first); assert.equal(pending.after, undefined);
  recordHackathonOutcome(pending, first, firstAfter); assert.deepEqual(pending.after, firstAfter);
});

test("a terminal result can upgrade unavailable finance once, while the first confirmed boundary stays frozen", () => {
  const { state, first, firstAfter, secondAfter } = scenario(), entry = structuredClone(state.runs[0]);
  entry.after = { status: "unavailable", observedAt: "2026-10-17T00:00:00Z", reason: "HOSTED_FINANCE_TIMEOUT" };
  const originalInput = structuredClone(entry.input), originalResult = structuredClone(entry.result);
  recordHackathonOutcome(entry, first, firstAfter);
  assert.deepEqual(entry.after, firstAfter); assert.deepEqual(entry.input, originalInput); assert.deepEqual(entry.result, originalResult);
  recordHackathonOutcome(entry, first, secondAfter); assert.deepEqual(entry.after, firstAfter);
  recordHackathonOutcome(entry, first, { status: "unavailable", observedAt: "2026-10-17T00:10:00Z", reason: "HOSTED_FINANCE_TIMEOUT" });
  assert.deepEqual(entry.after, firstAfter); assert.deepEqual(entry.result, originalResult);
});

test("two real credit-funded settlements must repay, earn income and advance true/mirror reputation without fixed Tier or fee expectations", () => {
  for (const fee of [300n, 800n, 1500n]) {
    const f = scenario("/private/owned", fee);
    verifyHackathonRun(f.state, 0, f.first, f.initial, f.firstAfter); verifyHackathonRun(f.state, 1, f.second, f.firstAfter, f.secondAfter);
  }
  const f = scenario();
  for (const mutate of [(run: HostedRun) => { run.status = "Failed"; }, (run: HostedRun) => { run.result!.settlement!.passed = false; },
    (run: HostedRun) => { run.result!.fromCreditRaw = "0"; }, (run: HostedRun) => { run.result!.settlement!.loanStatus = "3"; },
    (run: HostedRun) => { run.result!.taskId = "19"; }]) { const bad = structuredClone(f.first); mutate(bad); assert.throws(() => verifyHackathonRun(f.state, 0, bad, f.initial, f.firstAfter)); }
  for (const change of [{ debtRaw: "1" }, { counts: { ...f.firstAfter.counts, defaults: "1" } }, { counts: { ...f.firstAfter.counts, repayments: "0" } },
    { counts: { ...f.firstAfter.counts, mirrorRepayments: "0" } }, { cashRaw: "999999" }, { credit: { ...f.firstAfter.credit, score: "500" } }]) {
    assert.throws(() => verifyHackathonRun(f.state, 0, f.first, f.initial, { ...f.firstAfter, ...change }));
  }
  assert.throws(() => verifyHackathonRun(f.state, 0, f.first, { ...f.initial, credit: { ...f.initial.credit, eligible: false } }, f.firstAfter), /REAL_CREDIT_ADMISSION_REQUIRED/);
  const changedPrior = structuredClone(f.state); changedPrior.runs[0].after = { ...f.firstAfter, cashRaw: "58001" };
  assert.throws(() => verifyHackathonRun(changedPrior, 1, f.second, f.firstAfter, f.secondAfter), /NEXT_TASK_MUST_USE_PRIOR_INCOME/);
});

async function evidenceFixture() {
  const root = await mkdtemp(join(tmpdir(), "af-hackathon-audit-")), f = scenario(root), { b, state, first, block } = f;
  const directory = join(state.runtime, "hosted", "agents", state.agent!.id, "runs", first.requestId, "task-executor");
  const catalog = [{ id: "cheap", model: "cheap/kimi-k2.6", responseModel: "kimi-k2.6", route: "http://127.0.0.1:3426/v1/chat/completions", inputMicroCreditsPerToken: "1", outputMicroCreditsPerToken: "2", maxCompletionTokens: 1024 },
    { id: "strong", model: "strong/kimi-k3", responseModel: "kimi-k3", route: "http://127.0.0.1:3426/v1/chat/completions", inputMicroCreditsPerToken: "3", outputMicroCreditsPerToken: "6", maxCompletionTokens: 1024 }];
  const response = { id: "provider-real-response", model: "kimi-k2.6", choices: [{ message: { content: "PRIVATE_MODEL_RESPONSE" } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
  const request = { model: "cheap/kimi-k2.6", messages: [{ role: "user", content: "PRIVATE_USER_PROMPT" }], max_completion_tokens: 1024 };
  const canonical = (value: any): string => value && typeof value === "object" ? Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
  const sha = (value: any) => createHash("sha256").update(canonical(value)).digest("hex");
  const input: any = { agentId: "2366", taskId: "20", service: "infercredit/allowance", model: "inference-allowance-v1", messages: [], allowance: { creditsRaw: "200000", modelCatalogDigest: modelCatalogDigest(catalog) } };
  const purchase = { config: { catalog }, handle: { input, submission: { txHash: first.result!.paymentTxHash }, quote: { chainId: "10143", taskId: "20", agentId: "2366", price: "120000",
    account: b.contracts.account, asset: b.asset.address, payTo: b.payTo, service: "infercredit/allowance", paymentId: first.result!.paymentId, requestDigest: requestDigest(input) } },
    inference: { result: { kind: "inference-allowance", paymentId: first.result!.paymentId, taskId: "20", agentId: "2366", creditsRaw: "200000", modelCatalogDigest: modelCatalogDigest(catalog) } } };
  await atomicJson(join(directory, "session.json"), { snapshot: { request: first.requestId, agent: state.agent!.id, action: "metered-task", wallet: state.agent!.wallet, owner: state.owner,
    settings: state.create, rawTransaction: "PRIVATE_SIGNED_TRANSACTION", keyFile: "/PRIVATE_KEY_FILE" }, result: first.result });
  await atomicJson(join(directory, "workflow", "session.json"), { child: { candidate: "PRIVATE_CANDIDATE_SOURCE" } });
  await atomicJson(join(directory, "workflow", "metered", "allowance-purchase", "session.json"), purchase);
  const ledger = { binding: { agentId: "2366", taskId: "20", wallet: state.agent!.wallet }, catalog,
    grants: [{ credits: "200000", source: { kind: "chain-payment", paymentId: first.result!.paymentId, txHash: first.result!.paymentTxHash } }], invocations: [{ id: "round:0", modelId: "cheap", state: "Completed", requestDigest: sha(request), request,
      reservedCredits: "1000", response: { status: 200, body: response }, result: { response, usage: { promptTokens: 10, completionTokens: 20 }, chargedCredits: "50" } }] };
  const ledgerPath = join(directory, "workflow", "metered", "inference-ledger", "session.json"); await atomicJson(ledgerPath, ledger);
  const arena = { runs: [{ taskId: "20", runId: "independent-original", status: "settled", result: { verdict: { mode: "docker", passed: true, evidenceHash: hash(80) },
    tests: [{ case: 1, passed: true }, { case: 2, passed: true }], settlement: { txHash: first.result!.settlement!.txHash } } }] };
  const arenaPath = join(state.runtime, "arena-http-journal.json"); await atomicJson(arenaPath, arena);
  const raw = JSON.stringify(response);
  await atomicJson(join(dirnameForTest(b.gatewayReadyFile), "responses", "attempt-1.json"), response);
  // atomicJson appends a newline, which is part of the persisted raw digest.
  const lines = [{ attempt: 1, phase: "DispatchIntent", model: "kimi-k2.6", requestDigest: "physical-request-digest" },
    { attempt: 1, phase: "Response", model: "kimi-k2.6", httpStatus: 200, responseDigest: createHash("sha256").update(raw + "\n").digest("hex"), usage: response.usage }];
  state.runs[0].gatewayBefore = { offset: 0, acceptedRequests: 0 };
  const manager = new Interface(["function getLoan(uint256) view returns(tuple(uint256 agentId,uint256 principal,uint256 fee,uint256 loanDueAt,uint8 status))", "function repaymentCount(uint256) view returns(uint256)", "function defaultCount(uint256) view returns(uint256)",
    "event LoanOpened(uint256 indexed taskId,uint256 indexed agentId,uint256 amount,uint8 tier)", "event LoanRepaid(uint256 indexed taskId,uint256 principal,uint256 fee)"]);
  const escrow = new Interface(ESCROW_ABI);
  const event = (iface: Interface, name: string, args: any[], at: string) => ({ address: at, ...iface.encodeEventLog(iface.getEvent(name)!, args) });
  const paidLogs = [event(accountInterface, "ProviderPaid", [2366, b.payTo, first.result!.paymentId, 40000, 80000], b.contracts.account), event(manager, "LoanOpened", [20, 2366, 80000, 3], b.contracts.manager)];
  const settledLogs = [event(escrow, "TaskSettled", [20, true, 92000, 0, 58000], b.contracts.escrow), event(manager, "LoanRepaid", [20, 80000, 12000], b.contracts.manager)];
  let canonicalBlocks = true, writes = 0;
  const provider = { send: async (method: string) => { assert.equal(method, "eth_chainId"); return "0x279f"; },
    getBlock: async (number: number) => ({ ...block(number), hash: canonicalBlocks ? block(number).hash : hash(999) }),
    getTransactionReceipt: async (tx: string) => ({ hash: tx, status: 1, to: tx === first.result!.paymentTxHash ? b.contracts.account : b.contracts.escrow,
      from: tx === first.result!.paymentTxHash ? state.agent!.wallet : address(8), blockNumber: tx === first.result!.paymentTxHash ? 11 : 12,
      blockHash: block(tx === first.result!.paymentTxHash ? 11 : 12).hash, logs: tx === first.result!.paymentTxHash ? paidLogs : settledLogs }),
    getTransaction: async () => ({ value: 0n, data: accountInterface.encodeFunctionData("payProvider", [2366, b.payTo, 120000, first.result!.paymentId,
      { agentId: 2366, taskId: 20, principalCap: 80000, feeBps: 1500, riskTier: 3, identityVersion: 1, authDeadline: state.deadline, loanDueAt: state.deadline, nonce: 1, evidenceHash: hash(1) }, "0x"]) }),
    call: async ({ to, data, blockTag }: { to: string; data: string; blockTag: number }) => {
      if (to.toLowerCase() === b.contracts.account.toLowerCase()) { const method = accountInterface.parseTransaction({ data })!.name;
        return accountInterface.encodeFunctionResult(method, method === "getPayment" ? [[2366, 20, 40000, 80000, 0]] : [blockTag === 10 ? 40000 : 58000]); }
      if (to.toLowerCase() === b.contracts.manager.toLowerCase()) { const method = manager.parseTransaction({ data })!.name;
        return manager.encodeFunctionResult(method, method === "getLoan" ? [[2366, 0, 0, state.deadline, 2]] : [method === "repaymentCount" && blockTag !== 10 ? 1 : 0]); }
      const method = escrow.parseTransaction({ data })!.name;
      return escrow.encodeFunctionResult(method, method === "verifier" ? [address(8)] : [[address(2), 150000, 0, 2366, state.deadline, 0, 3]]);
    }, broadcastTransaction: async () => { writes++; throw new Error("audit cannot write"); },
  } as unknown as JsonRpcProvider;
  return { ...f, provider, lines, ledger, ledgerPath, arena, arenaPath, root, get writes() { return writes; }, reorg: () => { canonicalBlocks = false; },
    close: () => rm(root, { recursive: true, force: true }) };
}
function dirnameForTest(file: string) { return file.slice(0, file.lastIndexOf("/")); }

test("evidence requires canonical credit/repayment, actual physical model provenance and independent Docker, without leaking private artifacts or dispatching", async () => {
  const f = await evidenceFixture();
  try {
    const report = await collectHackathonTaskEvidence(f.state, 0, f.b, f.provider, f.lines);
    assert.equal(report.acceptancePassed, true); assert.equal(report.payment.fromCreditRaw, "80000"); assert.equal(report.payment.feeRaw, "12000");
    assert.equal(report.modelCalls[0].gateway.attempt, 1); assert.equal(report.consumedCreditsRaw, "50"); assert.equal(report.independent.testCount, 2); assert.equal(f.writes, 0);
    for (const secret of ["PRIVATE_USER_PROMPT", "PRIVATE_MODEL_RESPONSE", "PRIVATE_CANDIDATE_SOURCE", "PRIVATE_SIGNED_TRANSACTION", "PRIVATE_KEY_FILE"]) assert.equal(JSON.stringify(report).includes(secret), false);
    f.arena.runs[0].result.verdict.mode = "manual"; await atomicJson(f.arenaPath, f.arena);
    await assert.rejects(collectHackathonTaskEvidence(f.state, 0, f.b, f.provider, f.lines), /INDEPENDENT_DOCKER_TESTS_REQUIRED/);
    f.arena.runs[0].result.verdict.mode = "docker"; await atomicJson(f.arenaPath, f.arena);
    const wrongPhysical = structuredClone(f.lines); wrongPhysical[1].responseDigest = hash(999);
    await assert.rejects(collectHackathonTaskEvidence(f.state, 0, f.b, f.provider, wrongPhysical), /GATEWAY_RESPONSE_DIGEST_CHANGED/);
    f.ledger.invocations[0].state = "Unknown"; await atomicJson(f.ledgerPath, f.ledger);
    await assert.rejects(collectHackathonTaskEvidence(f.state, 0, f.b, f.provider, f.lines), /UNKNOWN_MODEL_NOT_ACCEPTED/);
    f.ledger.invocations[0].state = "Completed"; await atomicJson(f.ledgerPath, f.ledger); f.reorg();
    await assert.rejects(collectHackathonTaskEvidence(f.state, 0, f.b, f.provider, f.lines), /CANONICAL_RECEIPT_REQUIRED/); assert.equal(f.writes, 0);
  } finally { await f.close(); }
});
