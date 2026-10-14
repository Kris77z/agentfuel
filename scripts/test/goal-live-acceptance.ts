import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { JsonRpcProvider, Wallet } from "ethers";
import { fundLocalWallet } from "../local-hosted.js";

// Explicit real-model acceptance on an isolated Anvil chain. The journal binds
// every paid run to one UUID, so interrupted probes never silently buy again.
const directory = resolve(process.argv[2] ?? "");
const mode = process.argv[3];
assert.ok(process.argv[2] && ["prepare", "cheap", "cheap-recheck", "cheap-final", "strong", "evidence"].includes(mode), "Usage: goal-live-acceptance.ts RUNTIME prepare|cheap|cheap-recheck|cheap-final|strong|evidence");
const ready = JSON.parse(await readFile(join(directory, "ready.json"), "utf8"));
assert.equal(ready.chainId, "31337");
assert.match(ready.hostedUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
const journalFile = join(directory, "goal-acceptance.json");
let journal: any;
try { journal = JSON.parse(await readFile(journalFile, "utf8")); }
catch (e: any) { if (e.code !== "ENOENT") throw e; journal = { version: 1, runs: {}, startedAt: new Date().toISOString() }; }
const save = () => writeFile(journalFile, JSON.stringify(journal, null, 2), { mode: 0o600 });
let token = "";
async function api(path: string, method = "GET", input?: unknown) {
  const response = await fetch(ready.hostedUrl + path, { method, headers: { origin: ready.hostedUrl,
    "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
const owner = new Wallet((await readFile(join(directory, "owner.key"), "utf8")).trim());
const challenge = await api("/auth/challenge", "POST", { wallet: owner.address });
token = (await api("/auth/login", "POST", { challengeId: challenge.id, signature: await owner.signMessage(challenge.message) })).token;
await writeFile(join(directory, "browser-cookie.txt"), `agentfuel_hosted_session=${token}`, { mode: 0o600 });
async function wait(requestId: string) {
  let last = "";
  for (const deadline = Date.now() + 660000; Date.now() < deadline;) {
    const snapshot = await api("/agents"); const run = snapshot.runs.find((r: any) => r.requestId === requestId);
    const state = JSON.stringify({ requestId, status: run?.status, stage: run?.mission?.stage, paidCalls: run?.mission?.calls?.length, reason: run?.reason });
    if (last !== state) { console.log(state); last = state; }
    if (run && !["Queued", "Running"].includes(run.status)) return run;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error("GOAL_WAIT_TIMEOUT: Inspect original UUID before recovery");
}
async function run(label: string, action: string, extra = {}) {
  journal.runs[label] ??= { input: { action, requestId: randomUUID(), ...extra } }; await save();
  const entry = journal.runs[label];
  if (entry.result && ["Succeeded", "Failed"].includes(entry.result.status)) return entry.result;
  await api(`/agents/${journal.agent.id}/runs`, "POST", entry.input);
  entry.result = await wait(entry.input.requestId); await save(); return entry.result;
}
if (mode === "prepare") {
  journal.create ??= { requestId: randomUUID(), name: "Tabby live mission" }; await save();
  journal.agent ??= await api("/agents", "POST", journal.create); await save();
  let provision = await wait(journal.create.requestId);
  if (!journal.funded) {
    assert.notEqual(journal.fundingStarted, true, "Inspect faucet balance before retrying interrupted mint");
    journal.fundingStarted = true; await save();
    await fundLocalWallet(directory, journal.agent.wallet, "600000"); journal.funded = true; await save();
  }
  if (provision.status === "Paused") {
    await api(`/agents/${journal.agent.id}/runs`, "POST", { action: "provision", requestId: journal.create.requestId });
    provision = await wait(journal.create.requestId);
  }
  assert.equal(provision.status, "Succeeded");
  journal.agent = await api(`/agents/${journal.agent.id}`, "PATCH", { name: journal.agent.name, modelId: "kimi-k2.6", strategy: "balanced", perRunBudgetRaw: "120000", totalBudgetRaw: "600000", allowCredit: false }); await save();
  assert.equal((await run("deposit", "deposit", { amountRaw: "600000" })).status, "Succeeded");
  journal.financeBefore = await api(`/agents/${journal.agent.id}/finance`); await save();
  console.log(JSON.stringify({ prepared: true, agentId: journal.agent.id, wallet: journal.agent.wallet, finance: journal.financeBefore, cookieFile: join(directory, "browser-cookie.txt") }));
} else if (["cheap", "cheap-recheck", "cheap-final", "strong"].includes(mode)) {
  assert.ok(journal.agent);
  if (journal.agent.modelId !== (mode === "strong" ? "kimi-k3" : "kimi-k2.6")) {
    journal.agent = await api(`/agents/${journal.agent.id}`, "PATCH", { name: journal.agent.name, modelId: mode === "strong" ? "kimi-k3" : "kimi-k2.6", strategy: "balanced", perRunBudgetRaw: "120000", totalBudgetRaw: "600000", allowCredit: false }); await save();
  }
  const goal = mode.startsWith("cheap")
    ? "请帮我完成一份可以直接发给团队的中文销售简报（不超过500字）。以下均是我提供的数据，不需要联网：一月收入120000元，成本72000元，订单240单；二月收入150000元，成本84000元，订单300单；三月收入135000元，成本81000元，订单270单。请计算每月毛利润、毛利率、客单价、二三月收入环比，以及季度总收入/总毛利润/整体毛利率，给一个表格和三条可执行建议。请明确区分数据结论与建议，不编造其他数据。"
    : "请帮我写一个可直接复制的 TypeScript 纯函数 summarizeSales，输入数组项是 month:string,revenue:number,cost:number,orders:number，输出各月 grossProfit,grossMargin,averageOrderValue 和总计 revenue,grossProfit,grossMargin。零收入或零订单时对应比率为 null，非法负数或非有限数应抛错。提供完整代码、简短说明，以及三条明确的输入/预期输出样例。无需联网，不要声称已运行代码。";
  journal.runs[mode] ??= { input: { action: "goal", requestId: randomUUID(), goal }, financeBefore: await api(`/agents/${journal.agent.id}/finance`), gatewayBefore: await (await fetch("http://127.0.0.1:3427/health")).json() }; await save();
  const result = await run(mode, "goal", { goal });
  journal.runs[mode].financeAfter = await api(`/agents/${journal.agent.id}/finance`);
  journal.runs[mode].gatewayAfter = await (await fetch("http://127.0.0.1:3427/health")).json(); await save();
  if (result.mission?.answer) await writeFile(join(directory, `${mode}-artifact.md`), result.mission.answer, { mode: 0o600 });
  assert.equal(result.status, "Succeeded", JSON.stringify(result));
  assert.ok(result.mission.answer && result.mission.review.passed && result.mission.calls.length >= 3);
  console.log(JSON.stringify({ completed: mode, requestId: result.requestId, phases: result.mission.phases.map((p: any) => p.name), calls: result.mission.calls, chargedRaw: result.result.chargedRaw, review: result.mission.review }));
} else {
  const provider = new JsonRpcProvider(ready.rpcUrl, undefined, { cacheTimeout: -1 });
  try {
    const nonce = await provider.getTransactionCount(journal.agent.wallet);
    const before = await (await fetch("http://127.0.0.1:3427/health")).json();
    const receipts = [];
    for (const [label, entry] of Object.entries<any>(journal.runs)) {
      if (entry.input.action !== "goal") continue;
      assert.ok(["Succeeded", "Failed"].includes(entry.result.status) && entry.result.result?.terminal, label);
      if (entry.result.status === "Failed") assert.equal(entry.result.reason, "HOSTED_GOAL_REVIEW_FAILED", `${label}: unexpected failure`);
      const charged = entry.result.mission.calls.reduce((v: bigint, c: any) => v + BigInt(c.chargedRaw), 0n);
      assert.equal(entry.result.result.chargedRaw, charged.toString());
      assert.equal(BigInt(entry.financeBefore.cashRaw) - BigInt(entry.financeAfter.cashRaw), charged);
      assert.equal(entry.financeAfter.debtRaw, "0");
      for (const call of entry.result.mission.calls) {
        assert.ok(call.promptTokens > 0 && call.completionTokens > 0);
        const receipt = await provider.getTransactionReceipt(call.txHash); assert.equal(receipt?.status, 1);
        receipts.push({ label, stage: call.stage, txHash: call.txHash, paymentId: call.paymentId, blockNumber: receipt!.blockNumber, status: receipt!.status });
      }
      await api(`/agents/${journal.agent.id}/runs`, "POST", entry.input);
      assert.equal((await wait(entry.input.requestId)).status, entry.result.status);
    }
    assert.equal(await provider.getTransactionCount(journal.agent.wallet), nonce);
    const after = await (await fetch("http://127.0.0.1:3427/health")).json();
    assert.equal(after.acceptedRequests, before.acceptedRequests);
    journal.evidence = { completedAt: new Date().toISOString(), boundary: "Real Kimi models via Magpie; isolated Anvil/mock registry/test USDC; no Monad or user funds; model review is not code execution", receipts, replay: { noNewTransactions: true, noNewModelRequests: true } }; await save();
    await writeFile(join(directory, "goal-evidence.json"), JSON.stringify({ ...journal.evidence, agentId: journal.agent.id, runs: Object.fromEntries(Object.entries<any>(journal.runs).filter(([,e])=>e.input.action==="goal").map(([k,e])=>[k,{input:e.input,result:e.result,financeBefore:e.financeBefore,financeAfter:e.financeAfter}])) }, null, 2));
    console.log(JSON.stringify(journal.evidence));
  } finally { provider.destroy(); }
}
