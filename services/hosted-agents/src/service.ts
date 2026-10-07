import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { open } from "node:fs/promises";
import { Wallet, getAddress, verifyMessage } from "ethers";
import { SessionStore } from "../../../packages/pi-loop/src/session.js";
import { taskPrivateDirectory } from "../../../packages/pi-loop/src/task-runner/config.js";
import { HostedError, type AgentSettings, type HostedAgent, type HostedConfig, type HostedExecutor, type HostedResult, type HostedRun } from "./types.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const amount = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,29})$/.test(v);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const now = () => new Date().toISOString();
const safeCode = (e: unknown) => { const v = (e as any)?.code ?? (e as any)?.message; return typeof v === "string" && /^[A-Z][A-Z0-9_]{0,100}$/.test(v) ? v : "HOSTED_EXECUTION_UNCERTAIN"; };
function fail(code: string, status = 400): never { throw new HostedError(code, status); }
function object(v: unknown, fields: string[]): asserts v is Record<string, any> {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(k => !fields.includes(k))) fail("HOSTED_INPUT_INVALID");
}
function id(v: unknown): asserts v is string { if (typeof v !== "string" || !uuid.test(v)) fail("HOSTED_REQUEST_ID_INVALID"); }
function owner(v: string) { try { return getAddress(v); } catch { return fail("HOSTED_WALLET_INVALID"); } }
interface Challenge { id: string; wallet: string; message: string; expiresAt: number }
interface Session { digest: string; owner: string; expiresAt: number }
interface Creation { owner: string; requestId: string; agentId: string; digest: string }
interface State { version: 1; configBinding: string; challenges: Challenge[]; sessions: Session[]; agents: HostedAgent[]; runs: HostedRun[]; creations: Creation[]; sponsoredOwners: Record<string, number>; sponsoredTotal: number }
export interface HostedCommand { action: "provision" | "deposit" | "task" | "game" | "credits"; requestId: string; rewardKind?: "usdc" | "llm-credits"; amountRaw?: string }

export function validateHostedConfig(value: unknown): HostedConfig {
  object(value, ["directory", "origin", "chainId", "models", "maxAgentsPerOwner", "maxTotalBudgetRaw", "maxPerRunBudgetRaw"]);
  const config = value as HostedConfig;
  if (!Array.isArray(config.models)) fail("HOSTED_CONFIG_INVALID", 503);
  for (const model of config.models) object(model, ["id", "label"]);
    const origin = new URL(config.origin);
    if (origin.origin !== config.origin || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) ||
      !["31337", "10143"].includes(config.chainId) || !Number.isSafeInteger(config.maxAgentsPerOwner) || config.maxAgentsPerOwner < 1 || config.maxAgentsPerOwner > 20 ||
      !amount(config.maxTotalBudgetRaw) || !amount(config.maxPerRunBudgetRaw) || BigInt(config.maxTotalBudgetRaw) < 1n || BigInt(config.maxPerRunBudgetRaw) < 1n ||
      !Array.isArray(config.models) || !config.models.length || config.models.length > 8 || new Set(config.models.map(m => m.id)).size !== config.models.length ||
      config.models.some(m => !/^[a-zA-Z0-9._-]{1,64}$/.test(m.id) || typeof m.label !== "string" || !m.label || m.label.length > 80) || resolve(config.directory) !== config.directory) fail("HOSTED_CONFIG_INVALID", 503);
  return structuredClone(config);
}

/** One daemon owns the private local database; async jobs use serial durable admission. */
export class HostedService {
  private queue: Promise<unknown> = Promise.resolve();
  private jobs = new Set<Promise<void>>();
  private closed = false;
  private constructor(readonly config: HostedConfig, private executor: HostedExecutor, private store: SessionStore<State>, private state: State) {}
  static async open(config: HostedConfig, executor: HostedExecutor, options: { recover?: boolean } = {}) {
    config = validateHostedConfig(config);
    await taskPrivateDirectory(config.directory);
    const store = new SessionStore<State>(join(config.directory, "database")); await store.start(options.recover);
    try {
      const binding = hash(JSON.stringify({ origin: config.origin, chainId: config.chainId }));
      const state = await store.read() ?? { version: 1, configBinding: binding, challenges: [], sessions: [], agents: [], runs: [], creations: [], sponsoredOwners: {}, sponsoredTotal: 0 };
      if (state.version !== 1 || state.configBinding !== binding) fail("HOSTED_CONFIG_BINDING_CHANGED", 503);
      for (const run of state.runs) if (["Queued", "Running"].includes(run.status)) { run.status = "Paused"; run.recoverable = true; run.reason = "HOSTED_PROCESS_INTERRUPTED"; run.updatedAt = now(); }
      await store.write(state);
      return new HostedService(structuredClone(config), executor, store, state);
    } catch (e) { await store.close(); throw e; }
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new HostedError("HOSTED_SERVICE_CLOSED", 503));
    const operation = this.queue.then(fn); this.queue = operation.catch(() => undefined); return operation;
  }
  private save() { return this.store.write(this.state); }
  private agent(who: string, agentId: string) {
    id(agentId); const found = this.state.agents.find(a => a.id === agentId && a.owner === owner(who));
    if (!found) fail("HOSTED_AGENT_NOT_FOUND", 404); return found;
  }
  private settings(input: unknown): AgentSettings {
    object(input, ["name", "modelId", "strategy", "perRunBudgetRaw", "totalBudgetRaw", "allowCredit"]);
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80 || /[\x00-\x1f\x7f]/.test(input.name) ||
      !this.config.models.some(m => m.id === input.modelId) || !["conservative", "balanced", "aggressive"].includes(input.strategy) || typeof input.allowCredit !== "boolean" ||
      !amount(input.perRunBudgetRaw) || !amount(input.totalBudgetRaw) || BigInt(input.perRunBudgetRaw) < 1n || BigInt(input.perRunBudgetRaw) > BigInt(this.config.maxPerRunBudgetRaw) ||
      BigInt(input.totalBudgetRaw) < BigInt(input.perRunBudgetRaw) || BigInt(input.totalBudgetRaw) > BigInt(this.config.maxTotalBudgetRaw)) fail("HOSTED_SETTINGS_INVALID");
    return { name: input.name.trim(), modelId: input.modelId, strategy: input.strategy, perRunBudgetRaw: input.perRunBudgetRaw, totalBudgetRaw: input.totalBudgetRaw, allowCredit: input.allowCredit };
  }
  challenge(wallet: string) { return this.serial(async () => {
    const address = owner(wallet), t = Date.now(), challengeId = randomUUID();
    this.state.challenges = this.state.challenges.filter(c => c.expiresAt > t);
    if (this.state.challenges.length >= 1000 || this.state.challenges.filter(c => c.wallet === address).length >= 5) fail("HOSTED_AUTH_RATE_LIMIT", 429);
    const expiresAt = t + 5 * 60_000;
    const message = `AgentFuel hosted agent login\nOrigin: ${this.config.origin}\nWallet: ${address}\nChain: ${this.config.chainId}\nNonce: ${challengeId}\nExpires: ${new Date(expiresAt).toISOString()}\nThis signature authenticates your platform account. It authorizes no blockchain transaction.`;
    this.state.challenges.push({ id: challengeId, wallet: address, message, expiresAt }); await this.save();
    return { id: challengeId, message, expiresAt };
  }); }
  login(challengeId: string, signature: string) { return this.serial(async () => {
    id(challengeId); const c = this.state.challenges.find(c => c.id === challengeId);
    if (!c || c.expiresAt <= Date.now() || typeof signature !== "string" || signature.length > 200) fail("HOSTED_AUTH_INVALID", 401);
    let signed: string; try { signed = verifyMessage(c.message, signature); } catch { return fail("HOSTED_AUTH_INVALID", 401); }
    if (signed !== c.wallet) fail("HOSTED_AUTH_INVALID", 401);
    const token = randomBytes(32).toString("hex"), expiresAt = Date.now() + 24 * 60 * 60_000;
    this.state.challenges = this.state.challenges.filter(v => v.id !== challengeId);
    this.state.sessions = this.state.sessions.filter(s => s.expiresAt > Date.now());
    if (this.state.sessions.length >= 10000) fail("HOSTED_SESSION_LIMIT", 503);
    this.state.sessions.push({ digest: hash(token), owner: c.wallet, expiresAt }); await this.save(); return { token, expiresAt };
  }); }
  authenticate(token: string): Promise<string> { return this.serial(async () => {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) fail("HOSTED_AUTH_REQUIRED", 401);
    const s = this.state.sessions.find(s => s.digest === hash(token) && s.expiresAt > Date.now());
    if (!s) fail("HOSTED_AUTH_REQUIRED", 401); return s.owner;
  }); }
  logout(token: string) { return this.serial(async () => { this.state.sessions = this.state.sessions.filter(s => s.digest !== hash(token)); await this.save(); }); }
  snapshot(who: string) { return this.serial(async () => {
    const address = owner(who), agents = this.state.agents.filter(a => a.owner === address), ids = new Set(agents.map(a => a.id));
    return structuredClone({ agents, runs: this.state.runs.filter(r => ids.has(r.agentId)).slice(-100).reverse(), models: this.config.models });
  }); }
  async create(who: string, input: AgentSettings & { requestId: string }) {
    const agent = await this.serial(async () => {
      object(input, ["requestId", "name", "modelId", "strategy", "perRunBudgetRaw", "totalBudgetRaw", "allowCredit"]); id(input.requestId);
      const { requestId, ...rest } = input, settings = this.settings(rest), address = owner(who), digest = hash(JSON.stringify(settings));
      const previous = this.state.creations.find(c => c.owner === address && c.requestId === requestId);
      if (previous) { if (previous.digest !== digest) fail("HOSTED_REQUEST_CONFLICT", 409); return structuredClone(this.agent(address, previous.agentId)); }
      if (this.state.creations.some(c => c.requestId === requestId) || this.state.runs.some(r => r.requestId === requestId)) fail("HOSTED_REQUEST_CONFLICT", 409);
      if (this.state.agents.filter(a => a.owner === address).length >= this.config.maxAgentsPerOwner || this.state.agents.length >= 1000) fail("HOSTED_AGENT_LIMIT", 409);
      const agentId = randomUUID(), directory = join(this.config.directory, "agents", agentId); await taskPrivateDirectory(directory);
      const wallet = Wallet.createRandom(); const file = await open(join(directory, "wallet.key"), "wx", 0o600);
      try { await file.writeFile(wallet.privateKey + "\n"); await file.sync(); } finally { await file.close(); }
      const created: HostedAgent = { ...settings, id: agentId, owner: address, wallet: wallet.address, createdAt: now(), updatedAt: now(), status: "Pending", spentRaw: "0", reservedRaw: "0" };
      this.state.agents.push(created); this.state.creations.push({ owner: address, requestId, agentId, digest }); await this.save(); return structuredClone(created);
    });
    // A retry of creation addresses the same provisioning request; it never regenerates a wallet.
    await this.command(who, agent.id, { action: "provision", requestId: input.requestId });
    return this.serial(async () => structuredClone(this.agent(who, agent.id)));
  }
  update(who: string, agentId: string, input: AgentSettings) { return this.serial(async () => {
    const a = this.agent(who, agentId), settings = this.settings(input);
    if (a.activeRequestId) fail("HOSTED_RECOVER_ORIGINAL_REQUIRED", 409);
    if (BigInt(settings.totalBudgetRaw) < BigInt(a.spentRaw)) fail("HOSTED_BUDGET_BELOW_SPENT", 409);
    Object.assign(a, settings, { updatedAt: now() }); await this.save(); return structuredClone(a);
  }); }
  pause(who: string, agentId: string, paused: boolean) { return this.serial(async () => {
    if (typeof paused !== "boolean") fail("HOSTED_INPUT_INVALID"); const a = this.agent(who, agentId);
    a.status = paused ? "Paused" : a.binding ? "Ready" : "Pending"; a.updatedAt = now(); await this.save(); return structuredClone(a);
  }); }
  command(who: string, agentId: string, input: HostedCommand) { return this.serial(async () => {
    object(input, ["action", "requestId", "rewardKind", "amountRaw"]); id(input.requestId);
    if (!["provision", "deposit", "task", "game", "credits"].includes(input.action) || (input.action === "game" ? !["usdc", "llm-credits"].includes(input.rewardKind as string) : input.rewardKind !== undefined)) fail("HOSTED_COMMAND_INVALID");
    if (input.action === "deposit" ? !amount(input.amountRaw) || BigInt(input.amountRaw) < 1n || BigInt(input.amountRaw) > BigInt(this.config.maxTotalBudgetRaw) : input.amountRaw !== undefined) fail("HOSTED_DEPOSIT_AMOUNT_INVALID");
    const a = this.agent(who, agentId), creation = this.state.creations.find(c => c.requestId === input.requestId);
    if (creation && (creation.agentId !== a.id || input.action !== "provision")) fail("HOSTED_REQUEST_CONFLICT", 409);
    const previous = this.state.runs.find(r => r.requestId === input.requestId);
    if (previous) {
      if (previous.agentId !== a.id || previous.action !== input.action || previous.rewardKind !== input.rewardKind || previous.amountRaw !== input.amountRaw) fail("HOSTED_REQUEST_CONFLICT", 409);
      if (previous.status !== "Paused") return structuredClone(previous);
      if (a.activeRequestId !== previous.requestId) fail("HOSTED_RECOVER_ORIGINAL_REQUIRED", 409);
      previous.status = "Queued"; previous.recoverable = false; delete previous.reason; previous.updatedAt = now(); await this.save();
      this.launch(a, previous, true); return structuredClone(previous);
    }
    if (a.activeRequestId) fail("HOSTED_RECOVER_ORIGINAL_REQUIRED", 409);
    if (a.status === "Paused") fail("HOSTED_AGENT_PAUSED", 409);
    if (input.action === "provision" ? !!a.binding : !a.binding) fail("HOSTED_AGENT_STATE_INVALID", 409);
    if (this.state.runs.length >= 10000) fail("HOSTED_RUN_LIMIT", 503);
    const reserve = input.action === "task" ? a.perRunBudgetRaw : "0";
    if (BigInt(a.spentRaw) + BigInt(reserve) > BigInt(a.totalBudgetRaw)) fail("HOSTED_BUDGET_EXHAUSTED", 409);
    // Bounded free sponsorship, independent of how many agents an owner creates. Unknown games retain the slot.
    if (input.action === "game") {
      if ((this.state.sponsoredOwners[a.owner] ?? 0) >= 3 || this.state.sponsoredTotal >= 100) fail("HOSTED_SPONSOR_LIMIT", 409);
      this.state.sponsoredOwners[a.owner] = (this.state.sponsoredOwners[a.owner] ?? 0) + 1; this.state.sponsoredTotal++;
    }
    const run: HostedRun = { ...input, agentId: a.id, status: "Queued", createdAt: now(), updatedAt: now(), reservedRaw: reserve, chargedRaw: "0", recoverable: false };
    a.reservedRaw = reserve; a.activeRequestId = run.requestId; a.updatedAt = now(); this.state.runs.push(run); await this.save(); this.launch(a, run, false); return structuredClone(run);
  }); }
  private result(value: HostedResult, a: HostedAgent, run: HostedRun) {
    object(value, ["phase", "terminal", "success", "chargedRaw", "reason", "binding", "taskId", "paymentId", "txHash", "matchId", "cashRaw", "principalRaw", "feeRaw", "rewardRaw", "creditsGranted", "creditsUsed"]);
    if (typeof value.phase !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(value.phase) || typeof value.terminal !== "boolean" || typeof value.success !== "boolean" ||
      !amount(value.chargedRaw) || BigInt(value.chargedRaw) > BigInt(run.reservedRaw) || (value.success && !value.terminal)) fail("HOSTED_RESULT_INVALID", 503);
    if (value.reason !== undefined && !/^[A-Z][A-Z0-9_]{0,100}$/.test(value.reason)) fail("HOSTED_RESULT_INVALID", 503);
    for (const f of ["cashRaw", "principalRaw", "feeRaw", "rewardRaw", "taskId"] as const) if (value[f] !== undefined && !amount(value[f])) fail("HOSTED_RESULT_INVALID", 503);
    for (const f of ["paymentId", "txHash"] as const) if (value[f] !== undefined && !/^0x[0-9a-f]{64}$/i.test(value[f]!)) fail("HOSTED_RESULT_INVALID", 503);
    if (value.matchId !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(value.matchId)) fail("HOSTED_RESULT_INVALID", 503);
    for (const f of ["creditsGranted", "creditsUsed"] as const) if (value[f] !== undefined && (!Number.isSafeInteger(value[f]) || value[f]! < 0)) fail("HOSTED_RESULT_INVALID", 503);
    if (value.binding) {
      object(value.binding, ["wallet", "agentId", "chainId"]);
      if (run.action !== "provision" || value.binding.wallet !== a.wallet || value.binding.chainId !== this.config.chainId || !amount(value.binding.agentId) || value.binding.agentId === "0" || this.state.agents.some(other => other.id !== a.id && other.binding?.agentId === value.binding!.agentId)) fail("HOSTED_RESULT_BINDING_INVALID", 503);
    }
    if (run.action === "provision" && value.success && !value.binding) fail("HOSTED_RESULT_BINDING_REQUIRED", 503);
    return structuredClone(value);
  }
  private launch(a: HostedAgent, run: HostedRun, recover: boolean) {
    const snapshot = structuredClone(a), original = structuredClone(run);
    const job = (async () => {
      await this.serial(async () => { run.status = "Running"; run.updatedAt = now(); await this.save(); });
      try {
        const directory = join(this.config.directory, "agents", a.id, "runs", run.requestId); await taskPrivateDirectory(directory);
        const result = await this.executor.execute({ agent: snapshot, run: original, directory, keyFile: join(this.config.directory, "agents", a.id, "wallet.key"), recover });
        await this.serial(async () => {
          const safe = this.result(result, a, run); run.result = safe; run.updatedAt = now();
          if (safe.terminal) {
            run.status = safe.success ? "Succeeded" : "Failed"; run.recoverable = false; run.chargedRaw = safe.chargedRaw;
            a.spentRaw = String(BigInt(a.spentRaw) + BigInt(safe.chargedRaw)); a.reservedRaw = "0"; delete a.activeRequestId;
            if (safe.binding) { a.binding = safe.binding; if (a.status !== "Paused") a.status = "Ready"; }
          } else { run.status = "Paused"; run.recoverable = true; }
          if (safe.reason) run.reason = safe.reason; await this.save();
        });
      } catch (e) { await this.serial(async () => { run.status = "Paused"; run.reason = safeCode(e); run.recoverable = true; run.updatedAt = now(); await this.save(); }); }
    })();
    this.jobs.add(job); void job.finally(() => this.jobs.delete(job)).catch(() => undefined);
  }
  async waitUntilIdle() {
    for (;;) {
      const observed = this.queue; await observed;
      if (this.jobs.size) { await Promise.all([...this.jobs]); continue; }
      if (observed === this.queue) return;
    }
  }
  async close() { await this.waitUntilIdle(); this.closed = true; await this.store.close(); }
}
