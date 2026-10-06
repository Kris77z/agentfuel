import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatInput, InferenceReceipt, Json, PaymentProof, Quote, RoutingTier } from "@agentfuel/sdk/protocol";
import type { Upstream } from "./config.js";

export interface SignedOperation { rawTransaction: string; txHash: string; nonce: number }
export interface Refund { id: string; amount: string; state: "Prepared" | "Confirmed"; approval?: SignedOperation; transaction?: SignedOperation }
export interface RouteSnapshot { version: 1; model: string; tier?: RoutingTier; upstreams: Omit<Upstream, "key">[] }
export interface PaymentRecord {
  quote: Quote; request: ChatInput; state: "Quoted" | "Paid" | "Processing" | "Delivered" | "Refunded";
  proof?: PaymentProof; result?: Json; receipt?: InferenceReceipt; lastError?: string; refunds: Refund[];
  scanBlock?: number; expiredPayment?: boolean; route?: RouteSnapshot;
}
export class Store {
  private readonly locks = new Map<string, Promise<unknown>>();
  constructor(private readonly directory: string) {}
  private file(id: string) { if (!/^0x[0-9a-f]{64}$/.test(id)) throw new Error("Invalid paymentId"); return join(this.directory, `${id}.json`); }
  async read(id: string): Promise<PaymentRecord> { return JSON.parse(await readFile(this.file(id), "utf8")); }
  async write(record: PaymentRecord) {
    await mkdir(this.directory, { recursive: true });
    const target = this.file(record.quote.paymentId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(record), { flag: "wx", mode: 0o600 }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  async ids() { await mkdir(this.directory, { recursive: true }); return (await readdir(this.directory)).filter(name => /^0x[0-9a-f]{64}\.json$/.test(name)).map(name => name.slice(0, -5)); }
  lock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(id) || Promise.resolve()).catch(() => {}).then(work);
    this.locks.set(id, next);
    void next.finally(() => { if (this.locks.get(id) === next) this.locks.delete(id); }).catch(() => {});
    return next;
  }
}
