import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTaskCatalog, guardMonadCatalogAppendState, loadMonadHostedBootstrap, monadRuntimeBinding, monadTaskTemplateDeadline, validateMonadRuntimeHistory,
  type MonadHostedBootstrap, type RuntimeJournal } from "../monad-hosted-runtime.js";
import { MONAD_IDENTITY, MONAD_USDC } from "../demo-monad-config.js";
import { modelCatalogDigest } from "../../services/hosted-agents/src/metered-task.js";
import { HostedTaskExecutor } from "../../services/hosted-agents/src/task-executor.js";
import { createHostedTaskFixture } from "../../services/hosted-agents/test/task-fixture.js";
import { canonical, type Json } from "../../packages/sdk/src/protocol.js";

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "af-monad-runtime-catalog-")));
  const put = async (name: string, value: unknown) => { const file = join(directory, name); await writeFile(file, typeof value === "string" ? value : JSON.stringify(value), { mode: 0o600 }); return file; };
  const rpcUrlFile = await put("rpc.txt", "https://rpc.example.test"), vendorKeyFile = await put("vendor.key", "synthetic-vendor"), keyFile = await put("gateway.key", "synthetic-gateway");
  const gateway = { url: "http://127.0.0.1:3426/v1", endpoint: "http://127.0.0.1:3426/v1/chat/completions", keyFile,
    models: [{ id: "cheap", model: "cheap/kimi-k2.6", responseModel: "kimi-k2.6" }, { id: "strong", model: "strong/kimi-k3", responseModel: "kimi-k3" }] };
  const gatewayReadyFile = await put("gateway-ready.json", gateway), address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
  const bootstrap: MonadHostedBootstrap = {
    version: 1, chainId: "10143", contracts: { account: address(1), adapter: address(2), escrow: address(3), manager: address(4) }, deploymentBlock: 5,
    asset: { address: MONAD_USDC, symbol: "USDC", decimals: 6 }, identity: MONAD_IDENTITY, payTo: address(6), publicRpcUrl: "https://rpc.example.test", rpcUrlFile, rpcTransport: "direct",
    roleKeyFiles: Object.fromEntries(["guardian", "underwriter", "verifier", "refunder", "sponsor", "opponent"].map(role => [role, join(directory, `${role}.key`)])) as MonadHostedBootstrap["roleKeyFiles"],
    opponentBinding: { chainId: "10143", agentId: "1", wallet: address(7) }, dashboardAgents: [1, 2, 3].map(id => ({ id: String(id), name: `Agent ${id}` })),
    gatewayReadyFile, vendorKeyFile, tasks: [1, 2, 3, 4].map(id => ({ taskId: String(id), problemId: "sum-integers", deadlineMs: Date.now() + 60000, creditLimit: "80000" })), maxFeePerGas: "100000000000", frontendOrigin: "http://127.0.0.1:3024",
  };
  const path = await put("bootstrap.json", bootstrap);
  return { directory, put, gateway, bootstrap, path, close: () => rm(directory, { recursive: true, force: true }) };
}

for (const ids of [["cheap", "strong"], ["kimi-k2.6", "kimi-k3"], ["cheap", "kimi-k3"], ["kimi-k2.6", "strong"]]) {
  test(`bootstrap preserves ${ids.join("/")} logical IDs and the original paid catalog/domain digest`, async () => {
    const f = await fixture();
    try {
      const gateway = { ...f.gateway, models: f.gateway.models.map((model, index) => ({ ...model, id: ids[index] })) };
      await f.put("gateway-ready.json", gateway);
      const filesBefore = await Promise.all([f.path, f.bootstrap.gatewayReadyFile].map(file => readFile(file, "utf8")));
      // This is the persisted pre-goal catalog shape and ordering, including the original logical IDs.
      const expectedCatalog = gateway.models.map((model, index) => ({ id: model.id, model: model.model, responseModel: model.responseModel, route: gateway.endpoint,
        inputMicroCreditsPerToken: index ? "3" : "1", outputMicroCreditsPerToken: index ? "6" : "2", maxCompletionTokens: 1024 }));
      const loaded = await loadMonadHostedBootstrap(f.path);
      assert.deepEqual(loaded.catalog, expectedCatalog); assert.equal(modelCatalogDigest(loaded.catalog), modelCatalogDigest(expectedCatalog));
      assert.deepEqual(loaded.bootstrap, f.bootstrap); assert.deepEqual(loaded.gateway, gateway);
      const binding = (bootstrap: MonadHostedBootstrap, catalog: unknown) => {
        const { dashboardAgents: _ignored, ...executionBootstrap } = bootstrap;
        return createHash("sha256").update(JSON.stringify({ bootstrap: executionBootstrap, gateway: { url: gateway.url, endpoint: gateway.endpoint, keyFile: gateway.keyFile }, catalog })).digest("hex");
      };
      assert.equal(binding(loaded.bootstrap, loaded.catalog), binding(f.bootstrap, expectedCatalog));
      assert.deepEqual(await Promise.all([f.path, f.bootstrap.gatewayReadyFile].map(file => readFile(file, "utf8"))), filesBefore);
      if (ids[0] === "cheap") assert.notEqual(modelCatalogDigest(loaded.catalog), modelCatalogDigest(loaded.catalog.map((model, index) => ({ ...model, id: ["kimi-k2.6", "kimi-k3"][index] }))));
    } finally { await f.close(); }
  });
}

test("aliases do not permit a different physical/response model, unknown ID or swapped tier binding", async () => {
  const f = await fixture();
  try {
    for (const models of [
      [{ ...f.gateway.models[0], id: "unknown" }, f.gateway.models[1]],
      [{ ...f.gateway.models[0], model: "cheap/other" }, f.gateway.models[1]],
      [f.gateway.models[0], { ...f.gateway.models[1], responseModel: "other" }],
      [{ ...f.gateway.models[0], id: "strong" }, { ...f.gateway.models[1], id: "cheap" }],
    ]) {
      await f.put("gateway-ready.json", { ...f.gateway, models });
      await assert.rejects(loadMonadHostedBootstrap(f.path), /MONAD_GATEWAY_MODELS_INVALID/);
    }
  } finally { await f.close(); }
});

test("appended task deadlines refresh only new templates without changing the historical runtime binding", async () => {
  const f = await fixture();
  try {
    const { catalog } = await loadMonadHostedBootstrap(f.path), now = Date.now();
    const original = { ...f.bootstrap, tasks: f.bootstrap.tasks.map(task => ({ ...task, deadlineMs: now - 86400000 })) };
    const binding = monadRuntimeBinding(original, f.gateway, catalog);
    const journal: RuntimeJournal = { version: 1, binding, startedAt: new Date(now - 172800000).toISOString(), templateDeadlineMs: now - 86400000,
      ipcDirectory: join(f.directory, "ipc"), operatorToken: "synthetic-token", ports: {}, originalBootstrap: original, originalCatalog: original.tasks };
    const previous = JSON.stringify(journal);
    assert.equal(monadTaskTemplateDeadline(journal, original.tasks), journal.templateDeadlineMs, "a restart alone cannot renew expired tasks");
    const appended = [{ ...original.tasks[0], taskId: "5", deadlineMs: now + 86400000 }];
    const current = { ...original, tasks: appendTaskCatalog(original.tasks, appended) }, afterBinding = monadRuntimeBinding(current, f.gateway, catalog);
    assert.equal(monadTaskTemplateDeadline(journal, current.tasks), appended[0].deadlineMs);
    assert.equal(JSON.stringify(journal), previous);
    assert.equal(monadRuntimeBinding(original, f.gateway, catalog), binding);
    const applied: RuntimeJournal = { ...journal, effectiveBinding: afterBinding, migrations: [{ id: createHash("sha256").update(JSON.stringify(appended)).digest("hex"),
      status: "Applied", createdAt: new Date(now).toISOString(), appliedAt: new Date(now).toISOString(), beforeBinding: binding, afterBinding,
      before: original, after: current, appended }] };
    validateMonadRuntimeHistory(applied, current, f.gateway, catalog);
    const appliedBefore = JSON.stringify(applied);
    assert.equal(monadTaskTemplateDeadline(applied, current.tasks), appended[0].deadlineMs);
    assert.equal(JSON.stringify(applied), appliedBefore);
    assert.equal(applied.templateDeadlineMs, now - 86400000);
    assert.equal(applied.binding, binding);
  } finally { await f.close(); }
});

test("fresh templates run after the original host deadline while paid Unknown recovery retains its expired deadline and payment", { timeout: 90000 }, async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "af-monad-template-deadline-"))), fx = await createHostedTaskFixture(directory);
  const wallClock = Date.now;
  try {
    const actor = await fx.actor(31), provision = await fx.executor.execute(actor.input("provision"));
    actor.agent.binding = provision.binding;
    const originalDeadline = Date.now() - 86400000, config = structuredClone(fx.config);
    for (const model of config.models) for (const workflow of Object.values(model.templates)) {
      workflow.deadlineMs = monadTaskTemplateDeadline({ templateDeadlineMs: originalDeadline }, workflow.tasks);
      assert.ok(workflow.deadlineMs > Date.now());
    }
    const executor = new HostedTaskExecutor(config, { provider: fx.fx.f.provider }), request = actor.input("task");
    fx.fx.queue("unknown");
    const unknown = await executor.execute(request);
    assert.equal(unknown.phase, "Paused", JSON.stringify(unknown));
    assert.equal(unknown.reason, "SOLVE_DISPATCH_UNKNOWN");
    assert.equal(unknown.chargedRaw, "120000");
    assert.equal(fx.fx.calls.length, 1);
    const sessionFile = join(request.directory, "task-executor", "session.json");
    const before = JSON.parse(await readFile(sessionFile, "utf8"));
    const workflowFile = join(request.directory, "task-executor", "workflow", "session.json");
    const workflowBefore = JSON.parse(await readFile(workflowFile, "utf8"));
    assert.ok(before.result.paymentId); assert.ok(before.result.paymentTxHash);
    const nonce = await fx.fx.f.provider.getTransactionCount(actor.wallet.address);
    const renewed = structuredClone(config);
    for (const model of renewed.models) for (const workflow of Object.values(model.templates)) workflow.deadlineMs += 86400000;
    // An operator appends a newer task after this paid request's own deadline.
    // Resuming that request must retain the original payment and expired window.
    Date.now = () => before.snapshot.workflow.deadlineMs + 1000;
    const recovered = await new HostedTaskExecutor(renewed, { provider: fx.fx.f.provider }).execute({ ...request, recover: true });
    assert.equal(recovered.phase, "Paused", JSON.stringify(recovered));
    assert.equal(recovered.reason, "SOLVE_DISPATCH_UNKNOWN", "an elapsed window cannot turn a paid Unknown into a new dispatch");
    assert.equal(recovered.chargedRaw, "120000");
    const after = JSON.parse(await readFile(sessionFile, "utf8"));
    assert.deepEqual(after.snapshot, before.snapshot);
    assert.deepEqual(after.transactions, before.transactions);
    assert.equal(after.binding, before.binding);
    assert.equal(after.snapshot.workflow.deadlineMs, before.snapshot.workflow.deadlineMs);
    assert.equal(after.result.paymentId, before.result.paymentId);
    assert.equal(after.result.paymentTxHash, before.result.paymentTxHash);
    const workflowAfter = JSON.parse(await readFile(workflowFile, "utf8"));
    assert.deepEqual(workflowAfter.config, workflowBefore.config);
    assert.deepEqual(workflowAfter.handle, workflowBefore.handle);
    assert.deepEqual(workflowAfter.childConfig, workflowBefore.childConfig);
    assert.equal(fx.fx.calls.length, 1);
    assert.equal(await fx.fx.f.provider.getTransactionCount(actor.wallet.address), nonce);
  } finally { Date.now = wallClock; await fx.close(); await rm(directory, { recursive: true, force: true }); }
});

async function pausedCatalogFixture(count = 1) {
  const f = await fixture(), runtime = join(f.directory, "runtime");
  const put = async (file: string, value: unknown) => {
    await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  };
  const database: any = { version: 1, agents: [], runs: [], sessions: [{ digest: "original-session" }], fundingRoutes: { original: "original-route" } };
  const states: { file: string; value: any }[] = [];
  for (let index = 0; index < count; index++) {
    const requestId = randomUUID(), agentId = randomUUID(), wallet = `0x${String(index + 1).repeat(40)}`, owner = `0x${"a".repeat(40)}`;
    const result = { phase: "Paused", terminal: false, success: false, chargedRaw: "0", reason: "HOSTED_WALLET_GAS_REQUIRED" };
    const agent = { id: agentId, wallet, owner, name: `Original ${index}`, status: "Pending", spentRaw: "0", reservedRaw: "0", activeRequestId: requestId };
    database.agents.push(agent);
    database.runs.push({ requestId, agentId, action: "provision", status: "Paused", reservedRaw: "0", chargedRaw: "0", recoverable: true, reason: result.reason, result });
    const snapshot = { agent: agentId, owner, wallet, request: requestId, action: "provision", reservedRaw: "0", config: { rpcTransport: "direct" }, workflow: { chainId: "10143" } };
    states.push({ file: join(runtime, "hosted", "agents", agentId, "runs", requestId, "task-executor", "session.json"),
      value: { version: 1, binding: createHash("sha256").update(canonical(snapshot as Json)).digest("hex"), snapshot, transactions: {}, result } });
  }
  database.runs.push({ requestId: randomUUID(), status: "Succeeded", recoverable: false, chargedRaw: "10000", result: { terminal: true } });
  const databaseFile = join(runtime, "hosted", "database", "session.json");
  const save = async () => { await put(databaseFile, database); for (const state of states) await put(state.file, state.value); };
  await save();
  return { ...f, runtime, database, databaseFile, states, put, save };
}

test("catalog append admits only unsigned zero-charge provision pauses and preserves all original request and wallet bytes", async () => {
  const f = await pausedCatalogFixture(5);
  try {
    const walletFile = join(f.directory, "original-wallet.key"); await f.put(walletFile, "synthetic-wallet-contents");
    const files = [f.databaseFile, ...f.states.map(state => state.file), walletFile];
    const before = await Promise.all(files.map(file => readFile(file, "utf8")));
    const guard = await guardMonadCatalogAppendState(f.runtime);
    assert.equal(guard.pausedProvisions, 5);
    const appended = appendTaskCatalog(f.bootstrap.tasks, [{ ...f.bootstrap.tasks[0], taskId: "5", deadlineMs: Date.now() + 86400000 }]);
    await guard.checkUnchanged();
    await writeFile(f.path, JSON.stringify({ ...f.bootstrap, tasks: appended }), { mode: 0o600 });
    await guard.checkUnchanged();
    assert.deepEqual(await Promise.all(files.map(file => readFile(file, "utf8"))), before);
    assert.equal(f.database.runs.filter((run: any) => run.status === "Paused").length, 5);
  } finally { await f.close(); }
});

test("catalog append rejects paid/Unknown, signed, active and mismatched paused work", async () => {
  for (const scenario of ["Queued", "Running", "task", "charge", "result-charge", "signed", "unknown", "extra-handle", "proxy", "binding", "wallet", "registered", "spent", "reserved", "active-request", "transactions-type"]) {
    const f = await pausedCatalogFixture();
    try {
      const run = f.database.runs[0], agent = f.database.agents[0], state = f.states[0].value;
      if (["Queued", "Running"].includes(scenario)) run.status = scenario;
      else if (scenario === "task") run.action = "task";
      else if (scenario === "charge") run.chargedRaw = "1";
      else if (scenario === "result-charge") state.result.chargedRaw = "1";
      else if (scenario === "signed") state.transactions = { register: { raw: "original-signed-transaction" } };
      else if (scenario === "unknown") run.reason = "HOSTED_TRANSACTION_UNCERTAIN";
      else if (scenario === "extra-handle") state.handle = { paymentId: "original-payment" };
      else if (scenario === "proxy") state.snapshot.config.rpcTransport = "system-https-proxy";
      else if (scenario === "wallet") state.snapshot.wallet = `0x${"b".repeat(40)}`;
      else if (scenario === "registered") agent.binding = { chainId: "10143", agentId: "42", wallet: agent.wallet };
      else if (scenario === "spent") agent.spentRaw = "1";
      else if (scenario === "reserved") run.reservedRaw = "1";
      else if (scenario === "active-request") agent.activeRequestId = randomUUID();
      else if (scenario === "transactions-type") state.transactions = 0;
      state.binding = scenario === "binding" ? "altered-binding" : createHash("sha256").update(canonical(state.snapshot as Json)).digest("hex");
      await f.save();
      const before = await Promise.all([f.databaseFile, f.states[0].file].map(file => readFile(file, "utf8")));
      await assert.rejects(guardMonadCatalogAppendState(f.runtime), /MONAD_(TERMINAL_RUNS|PAUSED_PROVISION)_REQUIRED/, scenario);
      assert.deepEqual(await Promise.all([f.databaseFile, f.states[0].file].map(file => readFile(file, "utf8"))), before);
    } finally { await f.close(); }
  }
});

test("catalog append source guards reject later database or paused-snapshot byte changes", async () => {
  for (const source of ["database", "snapshot"]) {
    const f = await pausedCatalogFixture();
    try {
      const guard = await guardMonadCatalogAppendState(f.runtime), file = source === "database" ? f.databaseFile : f.states[0].file;
      const before = await readFile(file, "utf8"); await writeFile(file, before + " ", { mode: 0o600 });
      await assert.rejects(guard.checkUnchanged(), /MONAD_CATALOG_SOURCE_CHANGED/);
    } finally { await f.close(); }
  }
});
