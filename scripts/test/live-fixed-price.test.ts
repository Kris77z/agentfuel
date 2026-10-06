import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Wallet, JsonRpcProvider } from "ethers";
import { ALL_ROLES, SIGNING_ROLES, MONAD_IDENTITY, MONAD_REPUTATION, MONAD_USDC } from "../demo-monad-config.js";
import { key, startAnvil, stopAnvil } from "../../services/underwriter/test/fixture.js";
import { verifyLiveFixedPrice, BoundedWallet } from "../verify-live-fixed-price.js";
import { auditSavedFixedPrice } from "../live-fixed-price-evidence.js";

async function config(directory: string) {
  const keys = { deployer: 1, guardian: 1, treasury: 1, poster: 1, underwriter: 3, verifier: 4, hero: 2, veteran: 5, defaulted: 6, rotatedOwner: 7, rotatedWallet: 8, provider: 9, refunder: 1 };
  const data = { version: 1, chainId: "10143", rpcUrl: "https://rpc.invalid", explorerUrl: "https://explorer.invalid", asset: { address: MONAD_USDC, symbol: "USDC", decimals: 6 }, registries: { identity: MONAD_IDENTITY, reputation: MONAD_REPUTATION },
    roles: Object.fromEntries(ALL_ROLES.map(role => [role, new Wallet(key(keys[role])).address])), keyFiles: Object.fromEntries(SIGNING_ROLES.map(role => [role, join(directory, `${role}.key`)])),
    upstream: { name: "kimi", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.6", apiKeyFile: join(directory, "kimi.key"), requestOptions: { max_tokens: 1024 } }, blockedProvider: new Wallet(key(10)).address };
  const path = join(directory, "config.json"); await writeFile(path, JSON.stringify(data)); return path;
}
const good = "import json,sys\nprint(json.dumps(sum(json.load(sys.stdin))))\n";
const response = (code: string) => Response.json({ model: "kimi-k2.6", choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call_real", type: "function", function: { name: "test_public_sample", arguments: JSON.stringify({ code }) } }] } }], usage: { prompt_tokens: 40, completion_tokens: 55, total_tokens: 95 } });

test("RPC transport rejects unknown values before configuration or network access, including a missing CLI value", async () => {
  const invalid = { mode: "monad" as const, configFile: "/does-not-exist", output: "/does-not-exist-output" };
  for (const value of [null, "", "proxy", "DIRECT", false]) await assert.rejects(verifyLiveFixedPrice({ ...invalid, rpcTransport: value as any }), /INVALID_RPC_TRANSPORT/);
  for (const rpcTransport of [undefined, "direct" as const, "system-https-proxy" as const]) await assert.rejects(verifyLiveFixedPrice({ ...invalid, rpcTransport }), error => error instanceof Error && error.message !== "INVALID_RPC_TRANSPORT");
  const path = fileURLToPath(new URL("../verify-live-fixed-price.ts", import.meta.url));
  for (const args of [["--rpc-transport", "proxy"], ["--rpc-transport"]]) await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", path, ...args]), (error: any) => error.code === 1 && error.stderr.trim() === "INVALID_RPC_TRANSPORT");
});

test("live B exact script shape performs one financed purchase, tool call and independent settlement, then audits raw evidence", { timeout: 120000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "af-live-b-test-")); let calls = 0;
  try {
    const configFile = await config(directory), output = join(directory, "output");
    const plan = await verifyLiveFixedPrice({ mode: "local", configFile, output }); assert.equal(plan.paidModelEndpointNotCalled, true);
    const report = await verifyLiveFixedPrice({ mode: "local", configFile, output, execute: true }, async (_url, init) => { calls++; const request = JSON.parse(String(init?.body)); assert.equal(request.model, "kimi-k2.6"); assert.equal(request.max_completion_tokens, 2048); return response(good); });
    assert.equal(report.error, undefined, JSON.stringify(report)); assert.equal(report.complete, true, JSON.stringify(report)); assert.equal(report.upstreamMode, "controlled"); assert.equal(calls, 1);
    const audit = await auditSavedFixedPrice(output); assert.equal(audit.signedCreditAuthorizationValidated, true); assert.equal(audit.rawLoanOpenedValidated, true); assert.equal(audit.fromCredit, "80000"); assert.equal(audit.fee, "12000"); assert.equal(audit.repairObserved, false);
    const restored = await startAnvil(); const restoredRpc = new JsonRpcProvider(restored.rpc, undefined, { cacheTimeout: -1 });
    try {
      await restoredRpc.send("anvil_loadState", [JSON.parse(await readFile(join(output, "anvil-state.json"), "utf8"))]);
      const session = JSON.parse(await readFile(join(output, "session/session.json"), "utf8"));
      const raw = await restoredRpc.getTransactionReceipt(session.inference.receipt.txHash); assert.equal(raw?.blockHash, session.inference.receipt.blockHash);
      assert.equal((await restoredRpc.getTransaction(session.inference.receipt.txHash))?.hash, session.inference.receipt.txHash);
      assert.equal((await restoredRpc.getBlock(session.inference.receipt.blockNumber))?.hash, session.inference.receipt.blockHash);
    } finally { restoredRpc.destroy(); await stopAnvil(restored.child); }
    // Lose client delivery persistence while keeping the original handle and signed final payload.
    const client = JSON.parse(await readFile(join(output, "session/session.json"), "utf8"));
    client.phase = "Paused"; delete client.inference;
    await writeFile(join(output, "session/session.json"), JSON.stringify(client));
    const oldReport = JSON.parse(await readFile(join(output, "report.json"), "utf8"));
    const originalSourceHashes = structuredClone(oldReport.sourceHashes);
    Object.assign(oldReport, { complete: false, stage: "fixed-price-purchase", error: "RECORDED_TRANSACTION_UNCONFIRMED_USE_SAME_OUTPUT", shutdownError: "LIVE_FIXED_RUN_UNCONFIRMED", evidenceError: "LIVE_FIXED_RUN_UNCONFIRMED", auditError: "FIXED_PRICE_EVIDENCE_INVALID" });
    await writeFile(join(output, "report.json"), JSON.stringify(oldReport));
    const resumed = await verifyLiveFixedPrice({ mode: "local", configFile, output, execute: true, resume: true }, async () => { calls++; throw new Error("No new paid model dispatch on resume"); });
    assert.equal(resumed.complete, true, JSON.stringify(resumed)); assert.equal(calls, 1); assert.equal(resumed.audit.signedPaymentValidated, true);
    for (const field of ["error", "shutdownError", "evidenceError", "auditError"]) assert.equal(resumed[field], undefined);
    assert.equal(resumed.failureHistory.length, 1); assert.equal(resumed.failureHistory[0].stage, "fixed-price-purchase");
    for (const field of ["error", "shutdownError", "evidenceError", "auditError"]) assert.equal(resumed.failureHistory[0][field], oldReport[field]);
    assert.equal(Number.isSafeInteger(resumed.failureHistory[0].recordedAtMs), true); assert.deepEqual(resumed.sourceHashes, originalSourceHashes);
    assert.deepEqual(resumed.resumeSourceHash, { path: "scripts/verify-live-fixed-price.ts", sha256: createHash("sha256").update(await readFile(new URL("../verify-live-fixed-price.ts", import.meta.url))).digest("hex") });
    const persistedReport = JSON.parse(await readFile(join(output, "report.json"), "utf8"));
    assert.equal(persistedReport.error, undefined); assert.deepEqual(persistedReport.failureHistory, resumed.failureHistory);
    const saved = JSON.parse(await readFile(join(output, "round-1/response.json"), "utf8")); saved.usage.completion_tokens++;
    await writeFile(join(output, "round-1/response.json"), JSON.stringify(saved)); await assert.rejects(auditSavedFixedPrice(output));
    assert.equal(JSON.parse(await readFile(join(output, "offline-fixed-audit.json"), "utf8")).fullyVerified, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("first passing tool blocks the rest of a legitimate batch without extra Docker execution or audit failure", { timeout: 120000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "af-live-b-batch-"));
  try {
    const configFile = await config(directory), output = join(directory, "output"); let count = 0;
    const report = await verifyLiveFixedPrice({ mode: "local", configFile, output, execute: true }, async () => { count++; const body = await response(good).json(); body.choices[0].message.tool_calls.push({ id: "later", type: "function", function: { name: "test_public_sample", arguments: JSON.stringify({ code: "while True: pass\n" }) } }); return Response.json(body); });
    assert.equal(report.complete, true, JSON.stringify(report)); assert.equal(count, 1); assert.equal(report.audit.toolCalls, 1);
    const session = JSON.parse(await readFile(join(output, "session/session.json"), "utf8")); assert.equal(session.inference.result.run.tools.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("trusted gateway routes reject credentials, inline keys and unbounded route shapes", async () => {
  const { readLiveRoutes } = await import("../verify-live-fixed-price.js"); const directory = await mkdtemp(join(tmpdir(), "af-live-routes-"));
  try {
    const route = (name: string) => ({ name, model: `${name}/${name === "cheap" ? "kimi-k2.6" : "kimi-k3"}`, baseUrl: "http://127.0.0.1:9999/v1", keyFile: join(directory, "synthetic.key") });
    const data = { cheap: route("cheap"), strong: route("strong") }, path = join(directory, "routes.json");
    await writeFile(path, JSON.stringify(data)); assert.equal((await readLiveRoutes(path)).cheap.model, "cheap/kimi-k2.6");
    for (const patch of [null, [], { ...data, cheap: [] }, { ...data, cheap: { ...data.cheap, key: "inline-secret" } }, { ...data, cheap: { ...data.cheap, keyFile: "relative.key" } }, { ...data, cheap: { ...data.cheap, baseUrl: "http://remote.invalid/v1" } }, { ...data, cheap: { ...data.cheap, baseUrl: "https://user:secret@api.invalid/v1" } }, { ...data, cheap: { ...data.cheap, baseUrl: "https://api.invalid/v1?key=secret" } }]) { await writeFile(path, JSON.stringify(patch)); await assert.rejects(readLiveRoutes(path), /INVALID_LIVE_ROUTES/); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("injected client provider remains caller-owned; gas ceilings stop signing without changing funds or nonce", { timeout: 15000 }, async () => {
  const { runFixedPriceTask } = await import("../../packages/pi-loop/src/fixed-task.js"); const local = await startAnvil(), p = new JsonRpcProvider(local.rpc, undefined, { cacheTimeout: -1 }), directory = await mkdtemp(join(tmpdir(), "af-provider-owner-"));
  try {
    const wallet = new Wallet(key(2), p); await p.send("anvil_setBalance", [wallet.address, "0x1000000000000000000"]);
    const deadlineMs = Date.now() - 1; const config = { taskId: "1", agentId: "1", rpcUrl: "https://unused.invalid", chainId: "31337", account: wallet.address, asset: wallet.address, provider: wallet.address, escrowAddress: wallet.address,
      relayUrl: "http://127.0.0.1:1/v1/chat", underwriterUrl: "http://127.0.0.1:1", arenaUrl: "http://127.0.0.1:1", maxServicePrice: "120000", deadlineMs, solve: { version: 1 as const, problemId: "sum-integers" as const, tiers: ["cheap" as const], maxRounds: 1, maxToolCalls: 1, maxCompletionTokens: 256, deadlineMs } };
    const s = await runFixedPriceTask(directory, config, { signer: wallet, provider: p }); assert.equal(s.reason, "SESSION_DEADLINE"); assert.equal(await p.send("eth_chainId", []), "0x7a69");
    const before = await p.getBalance(wallet.address), nonce = await p.getTransactionCount(wallet.address);
    const bounded = new BoundedWallet(key(2), p, 1n, 100000n); await assert.rejects(bounded.populateTransaction({ to: wallet.address, value: 0 }), /GAS_CEILING_EXCEEDED/);
    const gasBounded = new BoundedWallet(key(2), p, 100000000000n, 100000n); await assert.rejects(gasBounded.populateTransaction({ to: wallet.address, gasLimit: 100001n }), /GAS_CEILING_EXCEEDED/);
    assert.equal(await p.getBalance(wallet.address), before); assert.equal(await p.getTransactionCount(wallet.address), nonce);
    const other = new JsonRpcProvider(local.rpc); try { await assert.rejects(runFixedPriceTask(join(directory, "mismatch"), config, { signer: new Wallet(key(2), other), provider: p }), /SIGNER_PROVIDER_MISMATCH/); } finally { other.destroy(); }
  } finally { p.destroy(); await stopAnvil(local.child); await rm(directory, { recursive: true, force: true }); }
});

test("a busy runner or rejected resume cannot overwrite original evidence", async () => {
  const { SessionStore } = await import("../../packages/pi-loop/src/session.js"); const { mkdir } = await import("node:fs/promises");
  const directory = await mkdtemp(join(tmpdir(), "af-live-b-lock-")), output = join(directory, "output"), configFile = await config(directory);
  const owner = new SessionStore(join(output, "runner")); await owner.start(); const path = join(output, "report.json"), original = '{"original":"protected"}\n';
  try {
    await mkdir(output, { recursive: true }); await writeFile(path, original); let calls = 0;
    const busy = await verifyLiveFixedPrice({ mode: "local", configFile, output, execute: true }, async () => { calls++; throw new Error("Unreachable"); });
    assert.equal(busy.error, "SESSION_BUSY"); assert.equal(await readFile(path, "utf8"), original); assert.equal(calls, 0);
    await owner.write({ version: 1, binding: "different", mode: "local", upstreamMode: "controlled" }); await owner.close();
    const rejected = await verifyLiveFixedPrice({ mode: "local", configFile, output, execute: true, resume: true }, async () => { calls++; throw new Error("Unreachable"); });
    assert.equal(rejected.error, "RUN_CONFIG_MISMATCH"); assert.equal(await readFile(path, "utf8"), original); assert.equal(calls, 0);
  } finally { await owner.close(); await rm(directory, { recursive: true, force: true }); }
});
