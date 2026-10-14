import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { open, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { SessionStore } from "../packages/pi-loop/src/session.js";
import { taskPrivateFile } from "../packages/pi-loop/src/task-runner/config.js";
import { canonical, type Json } from "../packages/sdk/src/protocol.js";
import { validateGatewayCatalog } from "../services/hosted-agents/src/inference-gateway.js";
import { monadPublicOrigin, monadRuntimeBinding, validateMonadRuntimeHistory, type RuntimeJournal } from "./monad-hosted-runtime.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown) => digest(JSON.stringify(value));
const fail = (code: string): never => { throw new Error(code); };
interface Change { path: string; before: string; after: string; beforeHash: string; afterHash: string }
interface SourceGuard { path: string; before: string; beforeHash: string }
export interface MonadVpsMigration {
  version: 1; id: string; status: "Prepared" | "Applied"; preparedAt: string; appliedAt?: string;
  directory: string; bootstrapFile: string; origin: string; previousOrigin: string;
  previousRpcTransport: "direct" | "system-https-proxy"; rpcTransport: "direct"; ports: number[];
  previousBinding: string; publicBinding: string; gateway: SourceGuard; pausedProvisions: SourceGuard[]; changes: Change[];
}
function absolute(path: string) { if (!isAbsolute(path) || resolve(path) !== path) fail("MONAD_MIGRATION_ABSOLUTE_PATH_REQUIRED"); return path; }
const auditFile = (directory: string) => join(directory, "vps-origin-migration", "session.json");
const pathsFor = (directory: string, bootstrapFile: string) => [bootstrapFile, join(directory, "hosted.json"), join(directory, "hosted", "database", "session.json"), join(directory, "runtime-journal", "session.json")];
async function optionalMigration(directory: string): Promise<MonadVpsMigration | undefined> {
  try { return JSON.parse(await taskPrivateFile(auditFile(directory))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

/** Change only top-level values, retaining all unrelated bytes, including historical snapshots and escaped strings. */
function patchValues(raw: string, values: Record<string, unknown>, required = false) {
  const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("MONAD_MIGRATION_JSON_INVALID");
  const replacements = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
  const seen = new Set<string>(), patches: { start: number; end: number; value: string }[] = [];
  let position = raw.indexOf("{") + 1;
  const whitespace = () => { while (position < raw.length && /\s/.test(raw[position])) position++; };
  const stringEnd = (start: number) => { for (let end = start + 1; end < raw.length; end++) { if (raw[end] === "\\") end++; else if (raw[end] === '"') return end + 1; } return fail("MONAD_MIGRATION_JSON_INVALID"); };
  while (position < raw.length) {
    whitespace(); if (raw[position] === "}") break;
    if (raw[position] === ",") { position++; continue; }
    if (raw[position] !== '"') fail("MONAD_MIGRATION_JSON_INVALID");
    const keyStart = position; position = stringEnd(position); const key = JSON.parse(raw.slice(keyStart, position));
    if (seen.has(key)) fail("MONAD_MIGRATION_DUPLICATE_FIELD"); seen.add(key);
    whitespace(); if (raw[position++] !== ":") fail("MONAD_MIGRATION_JSON_INVALID"); whitespace();
    const start = position; let depth = 0;
    for (; position < raw.length; position++) {
      if (raw[position] === '"') { position = stringEnd(position) - 1; continue; }
      if (raw[position] === "[" || raw[position] === "{") depth++;
      else if (raw[position] === "]" || raw[position] === "}") { if (depth === 0) break; depth--; }
      else if (raw[position] === "," && depth === 0) break;
    }
    let end = position; while (end > start && /\s/.test(raw[end - 1])) end--;
    if (replacements.has(key)) { patches.push({ start, end, value: replacements.get(key)! }); replacements.delete(key); }
  }
  if (required && replacements.size) fail("MONAD_MIGRATION_AUTHENTICATION_FIELDS_REQUIRED");
  if (replacements.size) patches.push({ start: position, end: position, value: `${seen.size ? "," : ""}${[...replacements].map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(",")}` });
  for (const patch of patches.reverse()) raw = raw.slice(0, patch.start) + patch.value + raw.slice(patch.end);
  return raw;
}
export function migratedMonadAuthentication(raw: string, configBinding: string) {
  return patchValues(raw, { configBinding, challenges: [], sessions: [] }, true);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function pausedProvisionFiles(directory: string, database: any): string[] {
  if (!Array.isArray(database.runs)) fail("MONAD_VPS_MIGRATION_STATE_INVALID");
  return database.runs.filter((run: any) => run.status === "Paused").map((run: any) => {
    if (!uuid.test(run.agentId) || !uuid.test(run.requestId)) fail("MONAD_VPS_MIGRATION_STATE_INVALID");
    return join(directory, "hosted", "agents", run.agentId, "runs", run.requestId, "task-executor", "session.json");
  });
}
function validatePausedProvisions(directory: string, database: any, guards: SourceGuard[]) {
  const paused = database.runs.filter((run: any) => run.status === "Paused"), paths = pausedProvisionFiles(directory, database);
  if (guards.length !== paused.length) fail("MONAD_VPS_MIGRATION_PAUSED_PROVISION_REQUIRED");
  for (const [index, run] of paused.entries()) {
    const guard = guards[index], agent = database.agents.find((value: any) => value.id === run.agentId);
    if (!guard || guard.path !== paths[index] || digest(guard.before) !== guard.beforeHash) fail("MONAD_VPS_MIGRATION_PAUSED_PROVISION_REQUIRED");
    const state = JSON.parse(guard.before), snapshot = state.snapshot;
    if (!agent || agent.activeRequestId !== run.requestId || agent.reservedRaw !== "0" || agent.binding
      || run.action !== "provision" || run.reservedRaw !== "0" || run.chargedRaw !== "0" || run.recoverable !== true
      || run.result?.terminal !== false || run.result.phase !== "Paused" || run.result.chargedRaw !== "0"
      || state.version !== 1 || !snapshot || snapshot.action !== "provision" || snapshot.request !== run.requestId || snapshot.agent !== agent.id
      || snapshot.wallet !== agent.wallet || snapshot.owner !== agent.owner || snapshot.reservedRaw !== "0"
      || snapshot.config?.rpcTransport !== "direct" || snapshot.workflow?.chainId !== "10143"
      || state.binding !== digest(canonical(snapshot as Json)) || !state.transactions || Object.keys(state.transactions).length
      || state.result?.terminal !== false || state.result.phase !== "Paused" || state.result.chargedRaw !== "0") fail("MONAD_VPS_MIGRATION_PAUSED_PROVISION_REQUIRED");
  }
}
function buildPlan(directory: string, bootstrapFile: string, origin: string, raw: string[], gatewayRaw: string, pausedProvisions: SourceGuard[], preparedAt: string): MonadVpsMigration {
  const [bootstrap, hosted, database, runtime] = raw.map(value => JSON.parse(value));
  if (bootstrap.version !== 1 || bootstrap.chainId !== "10143" || bootstrap.frontendOrigin !== "http://127.0.0.1:3024"
    || !["direct", "system-https-proxy"].includes(bootstrap.rpcTransport) || hosted.version !== 1 || hosted.port !== 8792
    || hosted.hosted?.chainId !== "10143" || hosted.hosted.origin !== bootstrap.frontendOrigin || hosted.hosted.directory !== join(directory, "hosted")
    || database.version !== 1 || database.configBinding !== hash({ origin: bootstrap.frontendOrigin, chainId: "10143" })
    || !Array.isArray(database.challenges) || !Array.isArray(database.sessions) || !Array.isArray(database.agents) || !Array.isArray(database.runs)
    || database.runs.some((run: any) => !["Succeeded", "Failed", "Paused"].includes(run.status)
      || run.status !== "Paused" && (run.recoverable !== false || run.result?.terminal !== true))
    || database.agents.some((agent: any) => agent.reservedRaw !== "0" || agent.binding && agent.binding.chainId !== "10143"
      || agent.activeRequestId && !database.runs.some((run: any) => run.agentId === agent.id && run.requestId === agent.activeRequestId && run.status === "Paused"))
    || runtime.version !== 1 || runtime.publicOriginMigration || runtime.migrations?.some((migration: any) => migration.status !== "Applied")) fail("MONAD_VPS_MIGRATION_STATE_INVALID");
  validatePausedProvisions(directory, database, pausedProvisions); absolute(bootstrap.gatewayReadyFile);
  const gateway = JSON.parse(gatewayRaw);
  if (gateway.url !== "http://127.0.0.1:3426/v1" || gateway.endpoint !== `${gateway.url}/chat/completions` || gateway.models?.length !== 2) fail("MONAD_MIGRATION_GATEWAY_INVALID");
  absolute(gateway.keyFile);
  const catalog = validateGatewayCatalog(gateway.models.map((model: any, index: number) => ({ ...model, route: gateway.endpoint,
    inputMicroCreditsPerToken: index ? "3" : "1", outputMicroCreditsPerToken: index ? "6" : "2", maxCompletionTokens: 1024 })));
  if (!["cheap", "kimi-k2.6"].includes(catalog[0].id) || !["strong", "kimi-k3"].includes(catalog[1].id)
    || catalog[0].model !== "cheap/kimi-k2.6" || catalog[1].model !== "strong/kimi-k3"
    || catalog[0].responseModel !== "kimi-k2.6" || catalog[1].responseModel !== "kimi-k3") fail("MONAD_MIGRATION_GATEWAY_INVALID");
  validateMonadRuntimeHistory(runtime, bootstrap, gateway, catalog);
  const previousBinding = monadRuntimeBinding(bootstrap, gateway, catalog);
  const id = hash({ directory, bootstrapFile, origin, previousBinding, previousRpcTransport: bootstrap.rpcTransport });
  const afterBootstrap = { ...bootstrap, frontendOrigin: origin, rpcTransport: "direct" };
  const publicBinding = monadRuntimeBinding(afterBootstrap, gateway, catalog);
  const marker: RuntimeJournal["publicOriginMigration"] = { version: 1, id, fromOrigin: bootstrap.frontendOrigin, toOrigin: origin,
    fromRpcTransport: bootstrap.rpcTransport, toRpcTransport: "direct", previousBinding, publicBinding, auditFile: auditFile(directory) };
  const after = [patchValues(raw[0], { frontendOrigin: origin, rpcTransport: "direct" }),
    patchValues(raw[1], { hosted: { ...hosted.hosted, origin } }), migratedMonadAuthentication(raw[2], hash({ origin, chainId: "10143" })),
    patchValues(raw[3], { effectiveBinding: publicBinding, publicOriginMigration: marker })];
  const paths = pathsFor(directory, bootstrapFile);
  return { version: 1, id, status: "Prepared", preparedAt, directory, bootstrapFile, origin, previousOrigin: bootstrap.frontendOrigin,
    previousRpcTransport: bootstrap.rpcTransport, rpcTransport: "direct", ports: [...new Set<number>([3024, 3426, 3427, 8792, ...Object.values(runtime.ports ?? {}) as number[]])],
    previousBinding, publicBinding, gateway: { path: bootstrap.gatewayReadyFile, before: gatewayRaw, beforeHash: digest(gatewayRaw) }, pausedProvisions,
    changes: paths.map((path, index) => ({ path, before: raw[index], after: after[index], beforeHash: digest(raw[index]), afterHash: digest(after[index]) })) };
}
function boundRequest(record: MonadVpsMigration, directory: string, bootstrapFile: string, origin: string) {
  if (record.version !== 1 || record.directory !== directory || record.bootstrapFile !== bootstrapFile || record.origin !== origin
    || !["Prepared", "Applied"].includes(record.status) || !Array.isArray(record.changes) || record.changes.length !== 4
    || typeof record.preparedAt !== "string" || typeof record.gateway?.before !== "string" || !Array.isArray(record.pausedProvisions)) fail("MONAD_ORIGINAL_VPS_MIGRATION_REQUIRED");
  const expected = buildPlan(directory, bootstrapFile, origin, record.changes.map(change => change.before), record.gateway.before, record.pausedProvisions, record.preparedAt);
  const { appliedAt: _appliedAt, ...prepared } = record;
  if (!isDeepStrictEqual({ ...prepared, status: "Prepared" }, expected)) fail("MONAD_VPS_MIGRATION_AUDIT_INVALID");
}

async function listeningPort(port: number) {
  return new Promise<boolean>(done => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (result: boolean) => { socket.destroy(); done(result); };
    socket.setTimeout(250, () => finish(true)); socket.once("error", error => finish((error as NodeJS.ErrnoException).code !== "ECONNREFUSED")); socket.once("connect", () => finish(true));
  });
}
async function stopped(record: MonadVpsMigration, portProbe = listeningPort) {
  for (const port of record.ports) {
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) fail("MONAD_MIGRATION_PORT_INVALID");
    if (await portProbe(port)) fail("MONAD_VPS_MIGRATION_STOP_REQUIRED");
  }
  const runtime = JSON.parse(record.changes[3].before);
  if (runtime.ipcDirectory) {
    let raw: string; try { raw = await taskPrivateFile(join(absolute(runtime.ipcDirectory), "settler.owner")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    const pid = Number(raw.trim()); if (!Number.isSafeInteger(pid) || pid < 1) fail("MONAD_SETTLER_OWNER_INVALID");
    try { process.kill(pid, 0); fail("MONAD_VPS_MIGRATION_STOP_REQUIRED"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
}
function safeView(record: MonadVpsMigration) {
  return { version: 1, migrationId: record.id, status: record.status, previousOrigin: record.previousOrigin, origin: record.origin,
    previousRpcTransport: record.previousRpcTransport, rpcTransport: record.rpcTransport, auditFile: auditFile(record.directory),
    changedFiles: record.changes.map(change => ({ path: change.path, beforeHash: change.beforeHash, afterHash: change.afterHash })),
    clearedAuthentication: record.status === "Applied", historicalRequestsChanged: false, preservedPausedProvisions: record.pausedProvisions.length, chainWrites: 0, modelRequests: 0,
    next: "set MONAD_PUBLIC_ORIGIN to the exact origin and start the same runtime with --recover" };
}
async function atomicRaw(path: string, raw: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(raw); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path); const directory = await open(dirname(path), "r"); try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temporary, { force: true }); }
}
async function recordedSources(record: MonadVpsMigration) {
  for (const change of record.changes) {
    const currentHash = digest(await taskPrivateFile(change.path));
    if (currentHash !== change.afterHash && (record.status === "Applied" || currentHash !== change.beforeHash)) fail("MONAD_VPS_MIGRATION_SOURCE_CHANGED");
  }
  for (const guard of [record.gateway, ...record.pausedProvisions]) if (digest(await taskPrivateFile(guard.path)) !== guard.beforeHash) fail("MONAD_VPS_MIGRATION_SOURCE_CHANGED");
}

/** Read-only plan: config/journal bytes only. Never reads keys/RPC URLs, probes listeners, or recovers a writer lock. */
export async function planMonadVpsMigration(directory: string, bootstrapFile: string, origin: string): Promise<MonadVpsMigration> {
  directory = absolute(directory); bootstrapFile = absolute(bootstrapFile); origin = monadPublicOrigin(origin);
  const previous = await optionalMigration(directory);
  if (previous) { boundRequest(previous, directory, bootstrapFile, origin); await recordedSources(previous); return previous; }
  const raw = await Promise.all(pathsFor(directory, bootstrapFile).map(path => taskPrivateFile(path)));
  const bootstrap = JSON.parse(raw[0]), gatewayRaw = await taskPrivateFile(absolute(bootstrap.gatewayReadyFile));
  const pausedProvisions = await Promise.all(pausedProvisionFiles(directory, JSON.parse(raw[2])).map(async path => {
    const before = await taskPrivateFile(path); return { path, before, beforeHash: digest(before) };
  }));
  return buildPlan(directory, bootstrapFile, origin, raw, gatewayRaw, pausedProvisions, new Date().toISOString());
}

/** Four-file offline deployment transition; partial writes resume only from the recorded original intent. */
export async function applyMonadVpsMigration(directory: string, bootstrapFile: string, origin: string, options: { portProbe?: (port: number) => Promise<boolean> } = {}) {
  const planned = await planMonadVpsMigration(directory, bootstrapFile, origin); await stopped(planned, options.portProbe);
  const transaction = new SessionStore<MonadVpsMigration>(join(directory, "vps-origin-migration")); await transaction.start(true);
  const runtime = new SessionStore<unknown>(join(directory, "runtime-journal")), hosted = new SessionStore<unknown>(join(directory, "hosted", "database"));
  let runtimeHeld = false, hostedHeld = false;
  try {
    await runtime.start(true); runtimeHeld = true; await hosted.start(true); hostedHeld = true;
    const record = await transaction.read() ?? planned; boundRequest(record, directory, bootstrapFile, origin);
    await stopped(record, options.portProbe); await recordedSources(record);
    if (record.status === "Applied") {
      if ((await Promise.all(record.changes.map(change => taskPrivateFile(change.path)))).some((value, index) => digest(value) !== record.changes[index].afterHash)) fail("MONAD_VPS_MIGRATION_SOURCE_CHANGED");
      return { ...safeView(record), cached: true };
    }
    await transaction.write(record); // Immutable before/after bytes are durable before the first source write.
    for (const change of record.changes) await atomicRaw(change.path, change.after);
    record.status = "Applied"; record.appliedAt = new Date().toISOString(); await transaction.write(record);
    return { ...safeView(record), cached: false };
  } finally { if (hostedHeld) await hosted.close(); if (runtimeHeld) await runtime.close(); await transaction.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, directory, bootstrapFile, origin, ...rest] = process.argv.slice(2);
  if (!["--check", "--execute"].includes(mode) || !directory || !bootstrapFile || !origin || rest.length) {
    console.error("Usage: monad-vps-migrate.ts --check|--execute RUNTIME_DIRECTORY BOOTSTRAP_FILE EXACT_HTTPS_ORIGIN"); process.exitCode = 1;
  } else if (mode === "--execute" && process.platform !== "linux") { console.error("MONAD_VPS_MIGRATION_LINUX_REQUIRED"); process.exitCode = 1; }
  else if (origin !== process.env.MONAD_PUBLIC_ORIGIN) { console.error("MONAD_PUBLIC_ORIGIN_NOT_PINNED"); process.exitCode = 1; }
  else (mode === "--execute" ? applyMonadVpsMigration(resolve(directory), resolve(bootstrapFile), origin)
    : planMonadVpsMigration(resolve(directory), resolve(bootstrapFile), origin).then(safeView))
    .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(/^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "MONAD_VPS_MIGRATION_FAILED"); process.exitCode = 1; });
}
