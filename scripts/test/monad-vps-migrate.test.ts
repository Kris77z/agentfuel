import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonical, type Json } from "../../packages/sdk/src/protocol.js";
import { SessionStore } from "../../packages/pi-loop/src/session.js";
import { HostedService } from "../../services/hosted-agents/src/service.js";
import { monadFrontendOriginAllowed, monadGameUpstreamTransport, monadPublicOrigin, monadRuntimeBinding,
  validateMonadPublicMigration, validateMonadRuntimeHistory } from "../monad-hosted-runtime.js";
import { applyMonadVpsMigration, migratedMonadAuthentication, planMonadVpsMigration } from "../monad-vps-migrate.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown) => digest(JSON.stringify(value));
const origin = "https://monad.tabbyai.xyz";
// Fixtures never probe the user's actual gateway/frontend ports. The CLI always uses its real loopback preflight.
const offlinePorts = { portProbe: async () => false };
async function fixture(transport: "direct" | "system-https-proxy" = "system-https-proxy") {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "monad-vps-migration-"))), runtime = join(directory, "runtime");
  const put = async (file: string, value: unknown) => { await mkdir(join(file, ".."), { recursive: true, mode: 0o700 }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); };
  const gatewayFile = join(directory, "gateway.json"), gateway = { url: "http://127.0.0.1:3426/v1", endpoint: "http://127.0.0.1:3426/v1/chat/completions", keyFile: join(directory, "absent-gateway.key"),
    models: [{ id: "cheap", model: "cheap/kimi-k2.6", responseModel: "kimi-k2.6" }, { id: "strong", model: "strong/kimi-k3", responseModel: "kimi-k3" }] };
  await put(gatewayFile, gateway);
  const catalog = gateway.models.map((model, index) => ({ ...model, route: gateway.endpoint, inputMicroCreditsPerToken: index ? "3" : "1", outputMicroCreditsPerToken: index ? "6" : "2", maxCompletionTokens: 1024 }));
  const tasks = [1, 2, 3, 4].map(taskId => ({ taskId: String(taskId), problemId: "sum-integers", creditLimit: "80000", deadlineMs: 1234567890000 }));
  const original: any = { version: 1, chainId: "10143", frontendOrigin: "http://127.0.0.1:3024", rpcTransport: transport,
    gatewayReadyFile: gatewayFile, rpcUrlFile: join(directory, "absent-rpc-url"), vendorKeyFile: join(directory, "absent-vendor.key"),
    roleKeyFiles: { guardian: join(directory, "absent-guardian.key") }, tasks, contracts: { account: "original-account" }, dashboardAgents: [{ id: "1", name: "Agent 1" }] };
  const binding = monadRuntimeBinding(original, gateway, catalog), migrations: any[] = [];
  let current = structuredClone(original), effectiveBinding = binding;
  for (const taskId of [5, 6]) {
    const appended = [{ ...tasks[0], taskId: String(taskId) }], after = { ...current, tasks: [...current.tasks, ...appended] }, afterBinding = monadRuntimeBinding(after, gateway, catalog);
    migrations.push({ id: hash(appended), status: "Applied", createdAt: "2026-10-12T00:00:00Z", appliedAt: "2026-10-12T00:01:00Z",
      beforeBinding: effectiveBinding, afterBinding, before: current, after, appended });
    current = after; effectiveBinding = afterBinding;
  }
  const bootstrapFile = join(directory, "bootstrap.json"); await put(bootstrapFile, current);
  const owner = "0x" + "1".repeat(40), wallet = "0x" + "2".repeat(40), agentId = randomUUID(), requestId = randomUUID(), timestamp = "2026-10-12T00:00:00Z";
  const agent: any = { id: agentId, owner, wallet, name: "Historical", modelId: "kimi-k2.6", strategy: "balanced", perRunBudgetRaw: "120000", totalBudgetRaw: "1000000", allowCredit: true,
    status: "Ready", spentRaw: "10000", reservedRaw: "0", createdAt: timestamp, updatedAt: timestamp, binding: { chainId: "10143", agentId: "42", wallet } };
  const database: any = { version: 1, configBinding: hash({ origin: original.frontendOrigin, chainId: "10143" }), challenges: [{ message: 'escaped ], \\" }' }], sessions: [{ digest: "old-session" }],
    agents: [agent], runs: [{ requestId, agentId, action: "task", status: "Succeeded", createdAt: timestamp, updatedAt: timestamp, reservedRaw: "120000", chargedRaw: "10000", recoverable: false,
      result: { phase: "Succeeded", terminal: true, success: true, chargedRaw: "10000", txHash: "original-paid-tx" } }], creations: [], sponsoredOwners: {}, sponsoredTotal: 0,
    fundingRoutes: { historical: { childId: "original-child", modelId: "cheap" } } };
  const databaseFile = join(runtime, "hosted", "database", "session.json"); await put(databaseFile, database);
  const hostedFile = join(runtime, "hosted.json"); await put(hostedFile, { version: 1, port: 8792, hosted: { chainId: "10143", origin: original.frontendOrigin, directory: join(runtime, "hosted") }, executor: { taskConfigFile: "original-task-config", gameConfigFile: "original-game-config" } });
  const runtimeFile = join(runtime, "runtime-journal", "session.json"), journal: any = { version: 1, binding, effectiveBinding, originalBootstrap: original, originalCatalog: tasks, migrations,
    startedAt: timestamp, templateDeadlineMs: 1234567890000, ipcDirectory: join(directory, "ipc"), operatorToken: "synthetic-fixture-token", ports: {} };
  await put(runtimeFile, journal);
  const financialFile = join(runtime, "fixed", "paid.json"), financialRaw = '{ "rawTransaction":"0xoriginal", "dispatch":"Unknown", "route":"original-route" }\n';
  await mkdir(join(financialFile, ".."), { recursive: true, mode: 0o700 }); await writeFile(financialFile, financialRaw, { mode: 0o600 });
  const audit = join(runtime, "vps-origin-migration", "session.json");
  const pause = async (count = 1) => {
    const records: { path: string; state: any; raw: string }[] = [];
    for (let index = 0; index < count; index++) {
      const pausedId = randomUUID(), pausedAgentId = randomUUID(), pausedWallet = "0x" + String(index + 3).repeat(40);
      const pausedAgent = { ...agent, id: pausedAgentId, wallet: pausedWallet, status: "Pending", spentRaw: "0", activeRequestId: pausedId }; delete pausedAgent.binding;
      database.agents.push(pausedAgent);
      const result = { phase: "Paused", terminal: false, success: false, chargedRaw: "0", reason: "HOSTED_WALLET_GAS_REQUIRED" };
      database.runs.push({ requestId: pausedId, agentId: pausedAgentId, action: "provision", status: "Paused", createdAt: timestamp, updatedAt: timestamp, reservedRaw: "0", chargedRaw: "0", recoverable: true, result });
      const snapshot = { agent: pausedAgentId, owner, wallet: pausedWallet, request: pausedId, action: "provision", reservedRaw: "0", config: { rpcTransport: "direct" }, workflow: { chainId: "10143" } };
      const state = { version: 1, snapshot, binding: digest(canonical(snapshot as Json)), transactions: {}, result };
      const path = join(runtime, "hosted", "agents", pausedAgentId, "runs", pausedId, "task-executor", "session.json"); await put(path, state);
      records.push({ path, state, raw: await readFile(path, "utf8") });
    }
    await put(databaseFile, database); return records;
  };
  return { directory, runtime, put, gateway, catalog, gatewayFile, original, current, bootstrapFile, database, databaseFile, hostedFile, journal, runtimeFile, financialFile, financialRaw, audit, owner, pause,
    close: () => rm(directory, { recursive: true, force: true }) };
}

test("public Origin is explicitly pinned; local Monad origin and macOS game transport remain compatible", () => {
  assert.equal(monadPublicOrigin(origin), origin); assert.equal(monadFrontendOriginAllowed(origin, origin), true);
  assert.equal(monadFrontendOriginAllowed(origin, ""), false); assert.equal(monadFrontendOriginAllowed("https://tempo.tabbyai.xyz", origin), false);
  assert.equal(monadFrontendOriginAllowed("http://127.0.0.1:3024", ""), true); assert.equal(monadFrontendOriginAllowed("http://127.0.0.1:3028", ""), false);
  assert.equal(monadGameUpstreamTransport("linux"), "direct"); assert.equal(monadGameUpstreamTransport("darwin"), "system-https-proxy");
  for (const value of ["http://monad.tabbyai.xyz", origin + "/", origin + "/path", origin + "?x=1", "https://user@monad.tabbyai.xyz", "https://127.0.0.1", "https://localhost"]) assert.throws(() => monadPublicOrigin(value), /MONAD_PUBLIC_ORIGIN_INVALID/);
});

test("migration CLI rejects an unpinned destination before reading any runtime files", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/monad-vps-migrate.ts", "--check", "/absent-runtime", "/absent-bootstrap", "https://tempo.tabbyai.xyz"],
    { cwd: process.cwd(), env: { MONAD_PUBLIC_ORIGIN: origin }, encoding: "utf8" });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr.trim(), "MONAD_PUBLIC_ORIGIN_NOT_PINNED");
});

test("read-only planning needs no key/RPC files and preserves the original catalog append chain", async t => {
  const f = await fixture(); t.after(f.close);
  const before = await Promise.all([f.bootstrapFile, f.hostedFile, f.databaseFile, f.runtimeFile].map(file => readFile(file, "utf8")));
  const plan = await planMonadVpsMigration(f.runtime, f.bootstrapFile, origin);
  assert.equal(plan.status, "Prepared"); assert.equal(plan.previousRpcTransport, "system-https-proxy"); assert.equal(plan.rpcTransport, "direct");
  assert.equal(plan.previousBinding, f.journal.effectiveBinding); assert.notEqual(plan.previousBinding, f.journal.binding);
  assert.deepEqual(await Promise.all([f.bootstrapFile, f.hostedFile, f.databaseFile, f.runtimeFile].map(file => readFile(file, "utf8"))), before);
  await assert.rejects(access(f.audit), { code: "ENOENT" });
});

test("offline migration audits Origin and RPC together while preserving business and original snapshot bytes", async t => {
  const f = await fixture(); t.after(f.close);
  const beforeDatabase = await readFile(f.databaseFile, "utf8"), beforeRuntime = await readFile(f.runtimeFile, "utf8");
  const result = await applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, offlinePorts); assert.equal(result.cached, false);
  const afterRaw = await readFile(f.databaseFile, "utf8"), after = JSON.parse(afterRaw), bootstrap = JSON.parse(await readFile(f.bootstrapFile, "utf8")), runtime = JSON.parse(await readFile(f.runtimeFile, "utf8"));
  assert.equal(afterRaw.slice(afterRaw.indexOf('  "agents"')), beforeDatabase.slice(beforeDatabase.indexOf('  "agents"')));
  assert.deepEqual(after, { ...f.database, configBinding: hash({ origin, chainId: "10143" }), sessions: [], challenges: [] });
  assert.equal(bootstrap.frontendOrigin, origin); assert.equal(bootstrap.rpcTransport, "direct");
  assert.equal(runtime.binding, f.journal.binding); assert.deepEqual(runtime.originalBootstrap, f.original); assert.deepEqual(runtime.migrations, f.journal.migrations);
  assert.ok((await readFile(f.runtimeFile, "utf8")).includes(beforeRuntime.slice(beforeRuntime.indexOf('  "originalBootstrap"'), beforeRuntime.lastIndexOf("}"))));
  assert.equal(await readFile(f.financialFile, "utf8"), f.financialRaw);
  validateMonadRuntimeHistory(runtime, bootstrap, f.gateway, f.catalog); await validateMonadPublicMigration(f.runtime, runtime, bootstrap, f.gateway, f.catalog);
  assert.equal((await applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, offlinePorts)).cached, true);
  await assert.rejects(planMonadVpsMigration(f.runtime, f.bootstrapFile, "https://different.example"), /ORIGINAL_VPS_MIGRATION_REQUIRED/);
});

test("one immutable intent resumes partial four-file writes and runtime rejects a Prepared audit", async t => {
  const f = await fixture(); t.after(f.close);
  const plan = await planMonadVpsMigration(f.runtime, f.bootstrapFile, origin); await f.put(f.audit, plan);
  for (const index of [0, 1, 3]) await writeFile(plan.changes[index].path, plan.changes[index].after, { mode: 0o600 });
  const migratedBootstrap = JSON.parse(plan.changes[0].after), migratedRuntime = JSON.parse(plan.changes[3].after);
  await assert.rejects(validateMonadPublicMigration(f.runtime, migratedRuntime, migratedBootstrap, f.gateway, f.catalog), /MIGRATION_INCOMPLETE/);
  assert.equal((await planMonadVpsMigration(f.runtime, f.bootstrapFile, origin)).id, plan.id);
  await applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, offlinePorts);
  assert.equal(JSON.parse(await readFile(f.audit, "utf8")).id, plan.id);
  for (const change of plan.changes) assert.equal(await readFile(change.path, "utf8"), change.after);
});

test("an applied public transition remains the boundary before later append-only catalog migrations", async t => {
  const f = await fixture(); t.after(f.close); await applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, offlinePorts);
  const before = JSON.parse(await readFile(f.bootstrapFile, "utf8")), runtime = JSON.parse(await readFile(f.runtimeFile, "utf8"));
  const appended = [{ ...before.tasks[0], taskId: "7" }], after = { ...before, tasks: [...before.tasks, ...appended] }, beforeBinding = monadRuntimeBinding(before, f.gateway, f.catalog), afterBinding = monadRuntimeBinding(after, f.gateway, f.catalog);
  runtime.migrations.push({ id: hash(appended), status: "Applied", createdAt: "2026-10-14T00:00:00Z", beforeBinding, afterBinding, before, after, appended });
  runtime.effectiveBinding = afterBinding;
  validateMonadRuntimeHistory(runtime, after, f.gateway, f.catalog); await validateMonadPublicMigration(f.runtime, runtime, after, f.gateway, f.catalog);
  const withoutAudit = { ...runtime }; delete withoutAudit.publicOriginMigration;
  await assert.rejects(validateMonadPublicMigration(f.runtime, withoutAudit, after, f.gateway, f.catalog), /MIGRATION_REQUIRED/);
});

test("changed source, changed gateway, and altered target intent are rejected without applying", async t => {
  for (const scenario of ["database", "gateway", "intent"]) {
    const f = await fixture(); t.after(f.close);
    const plan = await planMonadVpsMigration(f.runtime, f.bootstrapFile, origin); await f.put(f.audit, plan);
    if (scenario === "database") await f.put(f.databaseFile, { ...f.database, runs: [] });
    else if (scenario === "gateway") await f.put(f.gatewayFile, { ...f.gateway, models: [] });
    else { plan.changes[0].after += " "; plan.changes[0].afterHash = digest(plan.changes[0].after); await f.put(f.audit, plan); }
    await assert.rejects(planMonadVpsMigration(f.runtime, f.bootstrapFile, origin), scenario === "intent" ? /AUDIT_INVALID/ : /SOURCE_CHANGED/);
    assert.equal(JSON.parse(await readFile(f.bootstrapFile, "utf8")).frontendOrigin, "http://127.0.0.1:3024");
  }
});

test("migration rejects cross-chain state and broken original/applied catalog migration bindings", async t => {
  for (const scenario of ["chain", "original", "order", "intent"]) {
    const f = await fixture(); t.after(f.close);
    if (scenario === "chain") await f.put(f.bootstrapFile, { ...f.current, chainId: "42431" });
    else {
      const changed = structuredClone(f.journal);
      if (scenario === "original") changed.originalCatalog = [];
      else if (scenario === "order") changed.migrations.reverse();
      else changed.migrations[1].status = "Intent";
      await f.put(f.runtimeFile, changed);
    }
    await assert.rejects(planMonadVpsMigration(f.runtime, f.bootstrapFile, origin), /STATE_INVALID|ORIGINAL_CATALOG_INVALID|MIGRATION_SNAPSHOT_INVALID/);
  }
});

test("migration refuses listening services, live writer locks, and the independent settler PID", async t => {
  const f = await fixture(); t.after(f.close);
  await assert.rejects(applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, { portProbe: async port => port === 8792 }), /STOP_REQUIRED/);
  const writer = new SessionStore(join(f.runtime, "runtime-journal")); await writer.start();
  try { await assert.rejects(applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, offlinePorts), /SESSION_BUSY/); }
  finally { await writer.close(); }
  await mkdir(f.journal.ipcDirectory, { mode: 0o700 }); await writeFile(join(f.journal.ipcDirectory, "settler.owner"), String(process.pid), { mode: 0o600 });
  await assert.rejects(applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, offlinePorts), /STOP_REQUIRED/);
  await assert.rejects(access(f.audit), { code: "ENOENT" });
});

test("a source changed after the stop preflight is caught again under both writer locks", async t => {
  const f = await fixture(); t.after(f.close); let probes = 0;
  await assert.rejects(applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, { portProbe: async () => {
    if (++probes === 5) await f.put(f.databaseFile, { ...f.database, fundingRoutes: {} });
    return false;
  } }), /SOURCE_CHANGED/);
  assert.equal(JSON.parse(await readFile(f.bootstrapFile, "utf8")).frontendOrigin, "http://127.0.0.1:3024");
  await assert.rejects(access(f.audit), { code: "ENOENT" });
});

test("three stopped zero-cost direct provision pauses retain their snapshots and never dispatch on open/read", async t => {
  const f = await fixture("direct"); t.after(f.close); const paused = await f.pause(3);
  const beforeRaw = await readFile(f.databaseFile, "utf8");
  assert.equal((await applyMonadVpsMigration(f.runtime, f.bootstrapFile, origin, offlinePorts)).preservedPausedProvisions, 3);
  const afterRaw = await readFile(f.databaseFile, "utf8"); assert.equal(afterRaw.slice(afterRaw.indexOf('  "agents"')), beforeRaw.slice(beforeRaw.indexOf('  "agents"')));
  let dispatched = 0;
  const service = await HostedService.open({ directory: join(f.runtime, "hosted"), origin, chainId: "10143", models: [{ id: "kimi-k2.6", label: "Kimi" }],
    maxAgentsPerOwner: 6, maxTotalBudgetRaw: "1000000", maxPerRunBudgetRaw: "120000" }, { execute: async () => { dispatched++; throw new Error("NO_EXECUTION_EXPECTED"); } });
  try {
    const view = await service.snapshot(f.owner); assert.equal(view.runs.filter(run => run.status === "Paused").length, 3);
    assert.deepEqual(view.agents, f.database.agents); assert.equal(dispatched, 0);
    await assert.rejects(service.authenticate("f".repeat(64)), /HOSTED_AUTH_REQUIRED/);
    assert.ok((await service.challenge(f.owner)).message.includes(`Origin: ${origin}\n`));
    assert.equal(dispatched, 0); for (const entry of paused) assert.equal(await readFile(entry.path, "utf8"), entry.raw);
  } finally { await service.close(); }
});

test("only untouched direct zero-cost provision pauses are allowed and their source bytes remain guarded", async t => {
  for (const scenario of ["proxy", "transaction", "action", "charge", "changed-source"]) {
    const f = await fixture("direct"); t.after(f.close); const [paused] = await f.pause();
    if (scenario === "changed-source") {
      const plan = await planMonadVpsMigration(f.runtime, f.bootstrapFile, origin); await f.put(f.audit, plan);
      await writeFile(paused.path, paused.raw + " ", { mode: 0o600 });
      await assert.rejects(planMonadVpsMigration(f.runtime, f.bootstrapFile, origin), /SOURCE_CHANGED/); continue;
    }
    if (scenario === "proxy") paused.state.snapshot.config.rpcTransport = "system-https-proxy";
    else if (scenario === "transaction") paused.state.transactions = { register: { raw: "0xfixture" } };
    else if (scenario === "action") paused.state.snapshot.action = "task";
    else f.database.runs.at(-1).chargedRaw = "1";
    paused.state.binding = digest(canonical(paused.state.snapshot as Json)); await f.put(paused.path, paused.state); await f.put(f.databaseFile, f.database);
    await assert.rejects(planMonadVpsMigration(f.runtime, f.bootstrapFile, origin), /PAUSED_PROVISION_REQUIRED/);
  }
  for (const status of ["Queued", "Running"]) {
    const f = await fixture(); t.after(f.close); f.database.runs[0].status = status; await f.put(f.databaseFile, f.database);
    await assert.rejects(planMonadVpsMigration(f.runtime, f.bootstrapFile, origin), /STATE_INVALID/);
  }
});

test("auth patch preserves escaped historical bytes and rejects ambiguous duplicate root keys", () => {
  const raw = '{ "runs": [{ "code": "\\\" }],x" }], "sessions": [1], "configBinding": "old", "challenges": [2], "other": true }\n';
  const next = migratedMonadAuthentication(raw, "new");
  assert.deepEqual(JSON.parse(next), { ...JSON.parse(raw), configBinding: "new", sessions: [], challenges: [] });
  assert.equal(next.slice(0, next.indexOf('"sessions"')), raw.slice(0, raw.indexOf('"sessions"')));
  assert.throws(() => migratedMonadAuthentication('{"sessions":[],"sessions":[],"configBinding":"old","challenges":[]}', "new"), /DUPLICATE_FIELD/);
});
