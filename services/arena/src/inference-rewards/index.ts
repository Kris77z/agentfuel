import { createHash } from "node:crypto";
import { SessionStore } from "../../../../packages/pi-loop/src/session.js";

/** An operator-issued inference allowance, never a cryptocurrency or a loan. */
export const INFERENCE_REWARD_POLICY = Object.freeze({ version: 1, model: "kimi-k2.6" as const, rewardTokens: 4096,
  maxPromptBytes: 8192, promptFramingReserveTokens: 256, maxCompletionTokens: 512, upstreamTimeoutMs: 55000,
  maxResponseBytes: 1048576, inferenceRetries: 0 });
export interface RewardIdentity { agentId: string; wallet: string }
export interface TerminalRewardInput {
  grantId: string; matchId: string; replayDigest: string; players: [RewardIdentity, RewardIdentity]; winners: (0 | 1)[];
}
export interface RewardGrant extends TerminalRewardInput {
  model: "kimi-k2.6"; allocations: [number, number]; createdAt: string;
}
export interface RedemptionInput { redemptionId: string; prompt: string; maxCompletionTokens: number }
export interface RewardInferenceRequest {
  model: "kimi-k2.6"; stream: false; max_completion_tokens: number; thinking: { type: "disabled" };
  messages: [{ role: "user"; content: string }];
}
export interface RewardUsage { prompt_tokens: number; completion_tokens: number; total_tokens: number }
export type RedemptionStatus = "DispatchIntent" | "ResponseRecorded" | "Completed" | "Failed" | "OutcomeUnknown" | "UsageOverrun";
export interface RewardRedemption {
  redemptionId: string; identity: RewardIdentity; model: "kimi-k2.6"; requestDigest: string; reservedTokens: number;
  status: RedemptionStatus; createdAt: string; updatedAt: string; chargedTokens?: number; usage?: RewardUsage;
  content?: string; finishReason?: "stop" | "length"; error?: string;
}
interface PrivateRedemption extends RewardRedemption {
  request: RewardInferenceRequest; response?: { httpStatus: number; rawText: string };
}
interface LedgerState {
  version: 1; policy: typeof INFERENCE_REWARD_POLICY; accounts: RewardIdentity[];
  grants: RewardGrant[]; redemptions: PrivateRedemption[];
}
export interface RewardBalance {
  identity: RewardIdentity; model: "kimi-k2.6"; grantedTokens: number; consumedTokens: number; reservedTokens: number;
  availableTokens: number; deficitTokens: number; blocked: boolean;
}
export type RewardDispatch = (request: RewardInferenceRequest, signal: AbortSignal,
  context: { redemptionId: string; requestDigest: string }) => Promise<Response>;

function identity(input: RewardIdentity): RewardIdentity {
  if (!input || typeof input.agentId !== "string" || !/^[1-9][0-9]{0,77}$/.test(input.agentId)
    || typeof input.wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(input.wallet) || /^0x0{40}$/i.test(input.wallet))
    throw new Error("REWARD_INVALID_IDENTITY");
  return { agentId: input.agentId, wallet: input.wallet.toLowerCase() };
}
const accountKey = (value: RewardIdentity) => `${value.agentId}:${value.wallet}`;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone = <T>(value: T): T => structuredClone(value);
function validId(value: string, field: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error(`REWARD_INVALID_${field}`);
}
function count(value: unknown): value is number { return Number.isSafeInteger(value) && typeof value === "number" && value >= 0; }
function safeSum(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!count(total)) throw new Error("REWARD_UNSAFE_TOKEN_TOTAL"); return total;
}
function publicRedemption(record: PrivateRedemption): RewardRedemption {
  const { request: _request, response: _response, ...publicValue } = record; return clone(publicValue);
}
function grantInput(input: TerminalRewardInput): TerminalRewardInput {
  validId(input.grantId, "GRANT_ID"); validId(input.matchId, "MATCH_ID");
  if (!/^[0-9a-f]{64}$/.test(input.replayDigest) || !Array.isArray(input.players) || input.players.length !== 2
    || !Array.isArray(input.winners) || input.winners.length < 1 || input.winners.length > 2
    || input.winners.some(seat => seat !== 0 && seat !== 1) || new Set(input.winners).size !== input.winners.length)
    throw new Error("REWARD_INVALID_TERMINAL_INPUT");
  const players = input.players.map(identity) as [RewardIdentity, RewardIdentity];
  if (players[0].agentId === players[1].agentId || players[0].wallet === players[1].wallet) throw new Error("REWARD_DISTINCT_PLAYERS_REQUIRED");
  return { grantId: input.grantId, matchId: input.matchId, replayDigest: input.replayDigest, players,
    winners: [...input.winners].sort() };
}
function request(input: RedemptionInput): { request: RewardInferenceRequest; reservedTokens: number } {
  validId(input.redemptionId, "REDEMPTION_ID");
  if (typeof input.prompt !== "string" || !input.prompt.trim() || Buffer.byteLength(input.prompt, "utf8") > INFERENCE_REWARD_POLICY.maxPromptBytes
    || !Number.isSafeInteger(input.maxCompletionTokens) || input.maxCompletionTokens < 1
    || input.maxCompletionTokens > INFERENCE_REWARD_POLICY.maxCompletionTokens) throw new Error("REWARD_INVALID_INFERENCE_REQUEST");
  const body: RewardInferenceRequest = { model: INFERENCE_REWARD_POLICY.model, stream: false,
    max_completion_tokens: input.maxCompletionTokens, thinking: { type: "disabled" }, messages: [{ role: "user", content: input.prompt }] };
  return { request: body, reservedTokens: Buffer.byteLength(input.prompt, "utf8") + INFERENCE_REWARD_POLICY.promptFramingReserveTokens + input.maxCompletionTokens };
}
function parseUsage(body: any): RewardUsage | undefined {
  const value = body?.usage;
  if (!value || !count(value.prompt_tokens) || !count(value.completion_tokens) || !count(value.total_tokens)
    || value.total_tokens === 0 || value.total_tokens !== value.prompt_tokens + value.completion_tokens) return undefined;
  return { prompt_tokens: value.prompt_tokens, completion_tokens: value.completion_tokens, total_tokens: value.total_tokens };
}
/** Recover only a durable response, never a dispatch. A malformed/missing receipt cannot manufacture usage. */
function settle(record: PrivateRedemption) {
  if (record.status !== "ResponseRecorded" || !record.response) return;
  let body: any; try { body = JSON.parse(record.response.rawText); } catch { /* Kept reserved below. */ }
  const usage = parseUsage(body);
  record.updatedAt = new Date().toISOString();
  if (!usage || body?.model !== INFERENCE_REWARD_POLICY.model) {
    record.status = "OutcomeUnknown"; record.error = "REWARD_UNVERIFIABLE_UPSTREAM_USAGE"; return;
  }
  record.usage = usage;
  // The UTF-8 byte bound includes a conservative message-framing allowance. A provider violating
  // it is an operational exception: freeze this account with its reservation, never issue more calls.
  record.chargedTokens = usage.total_tokens;
  if (usage.total_tokens > record.reservedTokens || usage.completion_tokens > record.request.max_completion_tokens
    || usage.prompt_tokens > record.reservedTokens - record.request.max_completion_tokens) {
    record.status = "UsageOverrun"; record.error = "REWARD_UPSTREAM_EXCEEDED_RESERVATION"; return;
  }
  const choice = body?.choices?.[0];
  if (record.response.httpStatus < 200 || record.response.httpStatus >= 300 || !Array.isArray(body?.choices) || body.choices.length !== 1
    || choice?.message?.role !== "assistant" || typeof choice.message.content !== "string" || !choice.message.content.trim()
    || choice.message.tool_calls !== undefined || choice.message.function_call !== undefined
    || !["stop", "length"].includes(choice.finish_reason)) {
    record.status = "Failed"; record.error = "REWARD_INFERENCE_RESPONSE_NOT_DELIVERABLE"; return;
  }
  record.status = "Completed"; record.content = choice.message.content; record.finishReason = choice.finish_reason;
}
async function boundedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > INFERENCE_REWARD_POLICY.maxResponseBytes) { await reader.cancel(); throw new Error("REWARD_RESPONSE_TOO_LARGE"); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

/** One process owns a private durable ledger; calls inside that process serialize all state changes. */
export class InferenceRewardLedger {
  private state!: LedgerState;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private closing = false;
  private poisoned = false;
  private inFlight = new Set<Promise<RewardRedemption>>();
  private constructor(private readonly store: SessionStore<LedgerState>, private readonly dispatch?: RewardDispatch) {}

  static async open(directory: string, options: { accounts: RewardIdentity[]; dispatch?: RewardDispatch; recover?: boolean }) {
    if (!Array.isArray(options.accounts) || options.accounts.length < 2) throw new Error("REWARD_FIXED_ACCOUNTS_REQUIRED");
    const accounts = options.accounts.map(identity).sort((a, b) => accountKey(a).localeCompare(accountKey(b)));
    if (new Set(accounts.map(a => a.agentId)).size !== accounts.length || new Set(accounts.map(a => a.wallet)).size !== accounts.length)
      throw new Error("REWARD_DISTINCT_ACCOUNTS_REQUIRED");
    const store = new SessionStore<LedgerState>(directory); await store.start(options.recover);
    const ledger = new InferenceRewardLedger(store, options.dispatch);
    try {
      const existing = await store.read();
      if (existing) {
        if (existing.version !== 1 || JSON.stringify(existing.policy) !== JSON.stringify(INFERENCE_REWARD_POLICY)
          || JSON.stringify(existing.accounts) !== JSON.stringify(accounts) || !Array.isArray(existing.grants) || !Array.isArray(existing.redemptions))
          throw new Error("REWARD_LEDGER_BINDING_MISMATCH");
        ledger.state = existing;
        ledger.validateState();
        if (existing.redemptions.some(r => r.status === "DispatchIntent" || r.status === "ResponseRecorded")) {
          const next = clone(existing);
          for (const record of next.redemptions) {
            if (record.status === "DispatchIntent") {
              record.status = "OutcomeUnknown"; record.error = "REWARD_RESTART_UNKNOWN_DISPATCH_NO_RETRY"; record.updatedAt = new Date().toISOString();
            } else settle(record);
          }
          await ledger.commit(next);
        }
      } else {
        await ledger.commit({ version: 1, policy: INFERENCE_REWARD_POLICY, accounts, grants: [], redemptions: [] });
      }
      return ledger;
    } catch (error) { await store.close(); throw error; }
  }
  private account(value: RewardIdentity) {
    const normalized = identity(value);
    if (!this.state.accounts.some(a => accountKey(a) === accountKey(normalized))) throw new Error("REWARD_IDENTITY_NOT_AUTHORIZED");
    return normalized;
  }
  private validateState() {
    const grants = new Set<string>(), matches = new Set<string>(), redemptions = new Set<string>();
    for (const grant of this.state.grants) {
      const input = grantInput(grant); for (const player of input.players) this.account(player);
      const allocations = this.allocations(input.winners);
      if (grant.model !== INFERENCE_REWARD_POLICY.model || JSON.stringify(allocations) !== JSON.stringify(grant.allocations)
        || grants.has(grant.grantId) || matches.has(grant.matchId)) throw new Error("REWARD_LEDGER_INVALID_GRANT");
      grants.add(grant.grantId); matches.add(grant.matchId);
    }
    for (const r of this.state.redemptions) {
      this.account(r.identity); validId(r.redemptionId, "REDEMPTION_ID");
      const bounded = request({ redemptionId: r.redemptionId, prompt: r.request?.messages?.[0]?.content,
        maxCompletionTokens: r.request?.max_completion_tokens });
      if (r.model !== INFERENCE_REWARD_POLICY.model || digest(bounded.request) !== r.requestDigest || JSON.stringify(r.request) !== JSON.stringify(bounded.request)
        || r.reservedTokens !== bounded.reservedTokens || redemptions.has(r.redemptionId)
        || !["DispatchIntent", "ResponseRecorded", "Completed", "Failed", "OutcomeUnknown", "UsageOverrun"].includes(r.status)
        || ((r.status === "Completed" || r.status === "Failed" || r.status === "UsageOverrun") && (!count(r.chargedTokens) || !r.usage || r.chargedTokens !== r.usage.total_tokens
          || (r.status !== "UsageOverrun" && r.chargedTokens > r.reservedTokens))))
        throw new Error("REWARD_LEDGER_INVALID_REDEMPTION");
      if (r.response && (!Number.isInteger(r.response.httpStatus) || r.response.httpStatus < 100 || r.response.httpStatus > 599
        || typeof r.response.rawText !== "string" || Buffer.byteLength(r.response.rawText) > INFERENCE_REWARD_POLICY.maxResponseBytes))
        throw new Error("REWARD_LEDGER_INVALID_RESPONSE");
      if (["ResponseRecorded", "Completed", "Failed", "UsageOverrun"].includes(r.status) && !r.response)
        throw new Error("REWARD_LEDGER_MISSING_RESPONSE");
      if (["DispatchIntent", "ResponseRecorded", "OutcomeUnknown"].includes(r.status) && r.chargedTokens !== undefined)
        throw new Error("REWARD_LEDGER_INVALID_CHARGE");
      if (["Completed", "Failed", "UsageOverrun"].includes(r.status)) {
        const verified = clone(r); verified.status = "ResponseRecorded";
        delete verified.usage; delete verified.chargedTokens; delete verified.content; delete verified.finishReason; delete verified.error;
        settle(verified);
        for (const field of ["status", "usage", "chargedTokens", "content", "finishReason", "error"] as const)
          if (JSON.stringify(verified[field]) !== JSON.stringify(r[field])) throw new Error("REWARD_LEDGER_RECEIPT_MISMATCH");
      }
      redemptions.add(r.redemptionId);
    }
    for (const account of this.state.accounts) this.balanceValue(account);
  }
  private async commit(next: LedgerState) {
    try { await this.store.write(next); this.state = next; }
    catch (error) { this.poisoned = true; throw error; }
  }
  private serialized<T>(action: () => Promise<T> | T): Promise<T> {
    const work = this.queue.then(() => {
      if (this.closed) throw new Error("REWARD_LEDGER_CLOSED");
      if (this.poisoned) throw new Error("REWARD_LEDGER_REOPEN_REQUIRED");
      return action();
    });
    this.queue = work.catch(() => undefined); return work;
  }
  private allocations(winners: (0 | 1)[]): [number, number] {
    const amount = INFERENCE_REWARD_POLICY.rewardTokens / winners.length;
    return [winners.includes(0) ? amount : 0, winners.includes(1) ? amount : 0];
  }
  private balanceValue(value: RewardIdentity): RewardBalance {
    const key = accountKey(value);
    const grantedTokens = safeSum(this.state.grants.flatMap(g => g.players.map((p, seat) => accountKey(p) === key ? g.allocations[seat] : 0)));
    const records = this.state.redemptions.filter(r => accountKey(r.identity) === key);
    const consumedTokens = safeSum(records.map(r => r.chargedTokens ?? 0));
    const reservedTokens = safeSum(records.filter(r => !["Completed", "Failed", "UsageOverrun"].includes(r.status)).map(r => r.reservedTokens));
    const remainder = grantedTokens - consumedTokens - reservedTokens;
    if (remainder < 0 && !records.some(r => r.status === "UsageOverrun")) throw new Error("REWARD_LEDGER_NEGATIVE_BALANCE");
    const availableTokens = Math.max(0, remainder), deficitTokens = Math.max(0, -remainder);
    return { identity: clone(value), model: INFERENCE_REWARD_POLICY.model, grantedTokens, consumedTokens, reservedTokens,
      availableTokens, deficitTokens, blocked: records.some(r => r.status === "UsageOverrun") };
  }
  balance(value: RewardIdentity) { return this.serialized(() => this.balanceValue(this.account(value))); }

  /** Server-only: the trusted runner must recompute terminal state/winners from its private replay first. */
  grantTerminal(input: TerminalRewardInput): Promise<RewardGrant> {
    return this.serialized(async () => {
      const trusted = grantInput(input); for (const player of trusted.players) this.account(player);
      const existing = this.state.grants.find(g => g.grantId === trusted.grantId || g.matchId === trusted.matchId);
      if (existing) {
        const { allocations: _allocations, model: _model, createdAt: _createdAt, ...original } = existing;
        if (JSON.stringify(original) !== JSON.stringify(trusted)) throw new Error("REWARD_GRANT_ID_BINDING_MISMATCH");
        return clone(existing);
      }
      const grant: RewardGrant = { ...trusted, model: INFERENCE_REWARD_POLICY.model, allocations: this.allocations(trusted.winners), createdAt: new Date().toISOString() };
      const next = clone(this.state); next.grants.push(grant);
      // Check integer overflow before persisting any award.
      for (const player of trusted.players) {
        const key = accountKey(player);
        safeSum(next.grants.flatMap(g => g.players.map((p, seat) => accountKey(p) === key ? g.allocations[seat] : 0)));
      }
      await this.commit(next); return clone(grant);
    });
  }
  redemption(value: RewardIdentity, redemptionId: string): Promise<RewardRedemption | null> {
    return this.serialized(() => {
      const owner = this.account(value); validId(redemptionId, "REDEMPTION_ID");
      const record = this.state.redemptions.find(r => r.redemptionId === redemptionId);
      if (!record || accountKey(record.identity) !== accountKey(owner)) return null;
      return publicRedemption(record);
    });
  }
  redeem(value: RewardIdentity, input: RedemptionInput): Promise<RewardRedemption> {
    if (this.closing || this.closed) return Promise.reject(new Error("REWARD_LEDGER_CLOSED"));
    const pending = this.redeemOnce(value, input); this.inFlight.add(pending);
    return pending.finally(() => this.inFlight.delete(pending));
  }
  private async redeemOnce(value: RewardIdentity, input: RedemptionInput): Promise<RewardRedemption> {
    const prepared = await this.serialized(async () => {
      const owner = this.account(value); const bounded = request(input); const requestDigest = digest(bounded.request);
      const existing = this.state.redemptions.find(r => r.redemptionId === input.redemptionId);
      if (existing) {
        if (accountKey(existing.identity) !== accountKey(owner) || existing.requestDigest !== requestDigest) throw new Error("REWARD_REDEMPTION_ID_BINDING_MISMATCH");
        return { execute: false as const, record: publicRedemption(existing) };
      }
      if (!this.dispatch) throw new Error("REWARD_INFERENCE_PROVIDER_NOT_CONFIGURED");
      const balance = this.balanceValue(owner);
      if (balance.blocked) throw new Error("REWARD_ACCOUNT_BLOCKED_BY_USAGE_OVERRUN");
      if (balance.availableTokens < bounded.reservedTokens) throw new Error("REWARD_INSUFFICIENT_AVAILABLE_TOKENS");
      const createdAt = new Date().toISOString();
      const record: PrivateRedemption = { redemptionId: input.redemptionId, identity: owner, model: INFERENCE_REWARD_POLICY.model,
        requestDigest, reservedTokens: bounded.reservedTokens, status: "DispatchIntent", createdAt, updatedAt: createdAt, request: bounded.request };
      const next = clone(this.state); next.redemptions.push(record); await this.commit(next);
      return { execute: true as const, record };
    });
    if (!prepared.execute) return prepared.record;
    return this.execute(prepared.record);
  }
  private async execute(intent: PrivateRedemption): Promise<RewardRedemption> {
    let response: { httpStatus: number; rawText: string };
    try {
      const physical = await this.dispatch!(clone(intent.request), AbortSignal.timeout(INFERENCE_REWARD_POLICY.upstreamTimeoutMs),
        { redemptionId: intent.redemptionId, requestDigest: intent.requestDigest });
      response = { httpStatus: physical.status, rawText: await boundedText(physical) };
    } catch {
      return this.serialized(async () => {
        const next = clone(this.state); const record = next.redemptions.find(r => r.redemptionId === intent.redemptionId)!;
        record.status = "OutcomeUnknown"; record.error = "REWARD_UNKNOWN_DISPATCH_NO_RETRY"; record.updatedAt = new Date().toISOString();
        await this.commit(next); return publicRedemption(record);
      });
    }
    await this.serialized(async () => {
      const next = clone(this.state); const record = next.redemptions.find(r => r.redemptionId === intent.redemptionId)!;
      record.response = response; record.status = "ResponseRecorded"; record.updatedAt = new Date().toISOString(); await this.commit(next);
    });
    return this.serialized(async () => {
      const next = clone(this.state); const record = next.redemptions.find(r => r.redemptionId === intent.redemptionId)!;
      settle(record); await this.commit(next); return publicRedemption(record);
    });
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.inFlight]); await this.queue;
    if (!this.closed) { this.closed = true; await this.store.close(); }
  }
}
