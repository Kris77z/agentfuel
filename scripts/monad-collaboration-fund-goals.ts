import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Contract, Interface, Transaction, Wallet, getAddress, keccak256, type JsonRpcProvider, type TransactionRequest } from "ethers";
import { SessionStore } from "../packages/pi-loop/src/session.js";
import { taskPrivateFile } from "../packages/pi-loop/src/task-runner/config.js";
import { DemoJournal } from "./demo-journal.js";
import { reportDemoFailure } from "./demo-common.js";
import { monadProvider, readRpcUrlFile, type RpcTransport } from "./demo-rpc.js";
import { collaborationCases, collaborationOrigin, verifyCollaborationJournal } from "./monad-collaboration-goal-acceptance.js";

type FundingMode = "inspect" | "apply" | "recover";
interface FundingPlan { id: string; case: "external" | "fallback" | "fallback-recheck" | "fallback-fresh"; asset: "MON" | "test-USDC"; to: string; amount: string; target: string; data: string; value: string }
interface FundingReceipt { id: string; case: string; asset: string; from: string; to: string; amount: string; txHash: string; blockNumber: number; blockHash: string; status: 1 }
interface FundingState { version: 1; binding: string; plans: FundingPlan[]; receipts: Record<string, FundingReceipt>; status: "Intent" | "Applied" }
export interface CollaborationFundingOptions { runtime: string; output: string; mode?: FundingMode; rpcTransport?: RpcTransport; caseName?: "fallback-recheck" | "fallback-fresh"; nativeAmountWei?: string; externalUsdcRaw?: string; fallbackUsdcRaw?: string }
export interface CollaborationFundingDependencies { provider: JsonRpcProvider; allowLocalChain?: boolean }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a: string, b: string) => getAddress(a) === getAddress(b);
const tokenInterface = new Interface(["function transfer(address,uint256) returns(bool)", "event Transfer(address indexed from,address indexed to,uint256 value)"]);
const absolute = (value: string) => { assert.ok(isAbsolute(value) && resolve(value) === value, "FUND_GOALS_ABSOLUTE_PATH_REQUIRED"); return value; };
async function optionalJson(file: string): Promise<any> { try { await stat(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return undefined; } return JSON.parse(await taskPrivateFile(file)); }

/** Operator-only, one-time funding of the two original acceptance wallets.
 * It does not deposit Account cash or create/replace business request UUIDs. */
export async function fundMonadCollaborationGoals(options: CollaborationFundingOptions, deps?: CollaborationFundingDependencies) {
  const runtime = absolute(options.runtime), output = absolute(options.output), mode = options.mode ?? "inspect";
  assert.ok(["inspect", "apply", "recover"].includes(mode), "FUND_GOALS_MODE_INVALID");
  assert.ok(options.caseName === undefined || options.caseName === "fallback-recheck" || options.caseName === "fallback-fresh", "FUND_GOALS_CASE_INVALID");
  const fresh = options.caseName === "fallback-fresh", recheck = options.caseName === "fallback-recheck";
  if (fresh) assert.ok(options.nativeAmountWei !== undefined && options.externalUsdcRaw !== undefined && options.fallbackUsdcRaw !== undefined, "FUND_GOALS_FRESH_EXPLICIT_AMOUNTS_REQUIRED");
  const nativeAmountWei = options.nativeAmountWei ?? (recheck ? "0" : "350000000000000000");
  assert.match(nativeAmountWei, /^(0|[1-9][0-9]{0,18})$/, "FUND_GOALS_NATIVE_AMOUNT_INVALID"); assert.ok(BigInt(nativeAmountWei) <= 1000000000000000000n, "FUND_GOALS_NATIVE_AMOUNT_INVALID");
  if (recheck) assert.equal(nativeAmountWei, "0", "FUND_GOALS_RECHECK_NATIVE_NOT_ALLOWED");
  if (options.externalUsdcRaw !== undefined) assert.equal(options.externalUsdcRaw, collaborationCases.external.depositRaw, "FUND_GOALS_EXTERNAL_CASH_CHANGED");
  if (options.fallbackUsdcRaw !== undefined) assert.equal(options.fallbackUsdcRaw, collaborationCases.fallback.depositRaw, "FUND_GOALS_FALLBACK_CASH_CHANGED");
  if (options.rpcTransport) assert.ok(["direct", "system-https-proxy"].includes(options.rpcTransport), "FUND_GOALS_TRANSPORT_INVALID");
  const bootstrap = JSON.parse(await taskPrivateFile(join(runtime, "..", "bootstrap.json")));
  assert.ok(bootstrap.chainId === "10143" || deps?.allowLocalChain && bootstrap.chainId === "31337", "FUND_GOALS_CHAIN_INVALID");
  assert.equal(bootstrap.frontendOrigin, collaborationOrigin); assert.match(bootstrap.maxFeePerGas, /^[1-9][0-9]{0,29}$/);
  assert.equal(bootstrap.asset.decimals, 6, "FUND_GOALS_SIX_DECIMAL_TEST_ASSET_REQUIRED");
  const source = new Wallet((await taskPrivateFile(absolute(bootstrap.roleKeyFiles.guardian))).trim());
  assert.ok(same(source.address, bootstrap.payTo), "FUND_GOALS_GUARDIAN_PROVIDER_CHANGED");
  const journal = JSON.parse(await taskPrivateFile(join(output, "journal.json")));
  const owner = new Wallet((await taskPrivateFile(join(output, "owner.key"))).trim());
  verifyCollaborationJournal(journal, runtime, owner.address);
  if (fresh) assert.deepEqual(Object.keys(journal.cases).sort(), ["external", "fallback-fresh"], "FUND_GOALS_FRESH_DIRECTORY_MUST_EXCLUDE_OLD_CASES");
  else assert.equal(journal.cases["fallback-fresh"], undefined, "FUND_GOALS_FRESH_REQUIRES_EXPLICIT_CASE");
  const hosted = JSON.parse(await taskPrivateFile(join(runtime, "hosted", "database", "session.json")));
  const plans: FundingPlan[] = [];
  const names = fresh ? ["external", "fallback-fresh"] as const : recheck ? ["fallback-recheck"] as const : ["external", "fallback"] as const;
  for (const name of names) {
    const entry = journal.cases[name], spec = collaborationCases[name]; assert.ok(entry?.agent, `FUND_GOALS_PREPARE_${name.toUpperCase()}_FIRST`);
    const agent = hosted.agents.find((value: any) => value.id === entry.agent.id), creation = hosted.creations.find((value: any) => value.requestId === entry.create.requestId);
    assert.ok(agent && creation && creation.agentId === agent.id && same(agent.wallet, entry.agent.wallet) && same(agent.owner, owner.address) && same(creation.owner, owner.address), "FUND_GOALS_ORIGINAL_AGENT_BINDING_CHANGED");
    assert.ok(!same(agent.wallet, source.address), "FUND_GOALS_SOURCE_TARGET_COLLISION");
    const to = getAddress(agent.wallet);
    if (BigInt(nativeAmountWei) > 0n) plans.push({ id: `${name}-MON-${nativeAmountWei}`, case: name, asset: "MON", to, amount: nativeAmountWei, target: to, data: "0x", value: nativeAmountWei });
    plans.push({ id: `${name}-USDC-${spec.depositRaw}`, case: name, asset: "test-USDC", to, amount: spec.depositRaw, target: getAddress(bootstrap.asset.address), data: tokenInterface.encodeFunctionData("transfer", [to, spec.depositRaw]), value: "0" });
  }
  assert.equal(new Set(plans.map(plan => plan.to)).size, recheck ? 1 : 2, "FUND_GOALS_DUPLICATE_AGENT_WALLET");
  if (recheck) { assert.equal(plans.length, 1); assert.equal(plans[0].asset, "test-USDC"); assert.equal(plans[0].amount, "50000"); assert.equal(plans[0].value, "0"); }
  const fundingDirectory = join(output, fresh ? "funding-fresh" : recheck ? "funding-fallback-recheck" : "funding"), binding = hash({ runtime, output, chainId: bootstrap.chainId, source: source.address, token: getAddress(bootstrap.asset.address), maxFeePerGas: bootstrap.maxFeePerGas, plans });
  let connection: Awaited<ReturnType<typeof monadProvider>> | undefined;
  const stateStore = new SessionStore<FundingState>(fundingDirectory);
  const operator = new SessionStore<{ directory?: string; hash?: string }>(join(runtime, "wallets", "operator", source.address.toLowerCase()));
  let stateHeld = false, operatorHeld = false;
  try {
    const provider = deps?.provider ?? (connection = await monadProvider(await readRpcUrlFile(bootstrap.rpcUrlFile), options.rpcTransport ?? bootstrap.rpcTransport)).provider;
    assert.equal(BigInt(await provider.send("eth_chainId", [])), BigInt(bootstrap.chainId), "FUND_GOALS_NETWORK_MISMATCH");
    const token = new Contract(bootstrap.asset.address, ["function balanceOf(address) view returns(uint256)", "function decimals() view returns(uint8)"], provider);
    const manager = new Contract(bootstrap.contracts.manager, ["function guardian() view returns(address)"], provider);
    assert.ok(same(await manager.getFunction("guardian").staticCall(), source.address), "FUND_GOALS_CANONICAL_GUARDIAN_CHANGED");
    assert.equal(await token.getFunction("decimals").staticCall(), 6n);
    const existing: FundingState | undefined = await optionalJson(join(fundingDirectory, "session.json"));
    if (existing) { assert.equal(existing.version, 1); assert.equal(existing.binding, binding, "FUND_GOALS_FROZEN_INTENT_CHANGED"); assert.deepEqual(existing.plans, plans); }
    const [nativeBalance, tokenBalance, latest, pending] = await Promise.all([provider.getBalance(source.address), token.getFunction("balanceOf").staticCall(source.address), provider.getTransactionCount(source.address, "latest"), provider.getTransactionCount(source.address, "pending")]);
    if (mode === "inspect") return { readOnly: true, chainId: bootstrap.chainId, source: source.address, sourceMonWei: String(nativeBalance), sourceTestUsdcRaw: String(tokenBalance), latestNonce: latest, pendingNonce: pending, completed: existing?.status === "Applied", plans: plans.map(plan => ({ case: plan.case, asset: plan.asset, from: source.address, to: plan.to, amount: plan.amount, confirmed: Boolean(existing?.receipts[plan.id]) })) };
    if (mode === "recover") assert.ok(existing, "FUND_GOALS_ORIGINAL_INTENT_REQUIRED");
    await stateStore.start(mode === "recover"); stateHeld = true;
    await operator.start(mode === "recover"); operatorHeld = true;
    const active = await operator.read(); assert.ok(!active?.directory || active.directory === fundingDirectory, "HOSTED_GUARDIAN_RECOVERY_REQUIRED");
    const state: FundingState = await stateStore.read() ?? { version: 1, binding, plans, receipts: {}, status: "Intent" };
    assert.equal(state.binding, binding, "FUND_GOALS_FROZEN_INTENT_CHANGED"); assert.deepEqual(state.plans, plans);
    // Both original recipient intents precede every signature and broadcast.
    await stateStore.write(state); await operator.write({ directory: fundingDirectory, ...(active?.hash ? { hash: active.hash } : {}) });
    const signedFile = join(fundingDirectory, "transactions.json"), transactions = new DemoJournal(provider, signedFile); await transactions.load();
    const signer = source.connect(provider), cap = BigInt(bootstrap.maxFeePerGas), estimates = new Map<string, bigint>();
    const signedEntries = await optionalJson(signedFile) ?? {};
    assert.ok(existing || Object.keys(signedEntries).length === 0, "FUND_GOALS_ORIGINAL_INTENT_MISSING");
    for (const id of Object.keys(signedEntries)) assert.ok(plans.some(plan => plan.id === id), "FUND_GOALS_UNEXPECTED_SIGNED_OPERATION");
    for (const [id, receipt] of Object.entries(state.receipts)) {
      assert.ok(transactions.has(id), "FUND_GOALS_ORIGINAL_SIGNED_JOURNAL_MISSING");
      assert.equal(receipt.txHash, signedEntries[id].txHash, "FUND_GOALS_RECORDED_RECEIPT_CHANGED");
    }
    if (state.status === "Applied") assert.equal(Object.keys(state.receipts).length, plans.length, "FUND_GOALS_APPLIED_RECEIPTS_MISSING");
    for (const plan of plans) if (signedEntries[plan.id]) validateSignedGoalFunding(signedEntries[plan.id], plan, source.address, BigInt(bootstrap.chainId), cap);
    const remaining = plans.filter(plan => !state.receipts[plan.id]);
    const fees = await provider.getFeeData();
    assert.ok(fees.maxFeePerGas && fees.maxFeePerGas <= cap && (fees.maxPriorityFeePerGas ?? 0n) <= cap, "FUND_GOALS_FEE_CEILING_EXCEEDED");
    let requiredMon = 0n, requiredToken = 0n;
    for (const plan of remaining) {
      // An existing signed intent may already be mined. Do not reserve/send it
      // twice; its original canonical receipt is checked in the loop below.
      if (transactions.has(plan.id)) {
        const signed = Transaction.from(signedEntries[plan.id].rawTransaction);
        const receipt = await provider.getTransactionReceipt(signedEntries[plan.id].txHash);
        if (receipt) { assert.equal(receipt.status, 1); assert.equal((await provider.getBlock(receipt.blockNumber))?.hash, receipt.blockHash, "FUND_GOALS_RECEIPT_NOT_CANONICAL"); }
        else { requiredMon += BigInt(plan.value) + signed.gasLimit * (signed.maxFeePerGas ?? signed.gasPrice ?? cap); if (plan.asset === "test-USDC") requiredToken += BigInt(plan.amount); }
        continue;
      }
      const request: TransactionRequest = { to: plan.target, data: plan.data, value: BigInt(plan.value), chainId: BigInt(bootstrap.chainId) };
      if (plan.asset === "MON") assert.equal(await provider.getCode(plan.to), "0x", "FUND_GOALS_RECIPIENT_MUST_BE_EOA");
      const estimate = await provider.estimateGas({ ...request, from: source.address });
      const gasLimit = plan.asset === "MON" ? estimate : (estimate * 13n + 9n) / 10n;
      assert.ok(gasLimit <= (plan.asset === "MON" ? 21000n : 2000000n), "FUND_GOALS_GAS_CEILING_EXCEEDED");
      estimates.set(plan.id, gasLimit); requiredMon += BigInt(plan.value) + gasLimit * cap; if (plan.asset === "test-USDC") requiredToken += BigInt(plan.amount);
    }
    assert.ok(await provider.getBalance(source.address) >= requiredMon, "FUND_GOALS_SOURCE_MON_INSUFFICIENT");
    assert.ok(await token.getFunction("balanceOf").staticCall(source.address) >= requiredToken, "FUND_GOALS_SOURCE_TEST_USDC_INSUFFICIENT");
    let writes = 0;
    for (const plan of plans) {
      if (!transactions.has(plan.id)) {
        assert.equal(await provider.getTransactionCount(source.address, "latest"), await provider.getTransactionCount(source.address, "pending"), "FUND_GOALS_OPERATOR_TRANSACTION_PENDING");
        await transactions.send(plan.id, signer, { to: plan.target, data: plan.data, value: BigInt(plan.value), chainId: BigInt(bootstrap.chainId), gasLimit: estimates.get(plan.id)!, maxFeePerGas: cap, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n }); writes++;
      }
      const signedEntry = (await optionalJson(signedFile))[plan.id]; validateSignedGoalFunding(signedEntry, plan, source.address, BigInt(bootstrap.chainId), cap);
      await operator.write({ directory: fundingDirectory, hash: signedEntry.txHash });
      const receipt = await transactions.receipt(plan.id), transaction = await provider.getTransaction(receipt.hash);
      assert.equal(receipt.status, 1); assert.equal(receipt.hash, signedEntry.txHash); assert.equal((await provider.getBlock(receipt.blockNumber))?.hash, receipt.blockHash, "FUND_GOALS_RECEIPT_NOT_CANONICAL");
      assert.ok(transaction && transaction.to && same(transaction.from, source.address) && same(transaction.to, plan.target)); assert.equal(transaction.value, BigInt(plan.value)); assert.equal(transaction.data, plan.data);
      if (plan.asset === "test-USDC") {
        const transfers = receipt.logs.filter(log => same(log.address, bootstrap.asset.address)).flatMap(log => { try { const event = tokenInterface.parseLog(log); return event?.name === "Transfer" ? [event] : []; } catch { return []; } });
        assert.equal(transfers.length, 1); assert.ok(same(transfers[0].args.from, source.address) && same(transfers[0].args.to, plan.to)); assert.equal(String(transfers[0].args.value), plan.amount);
      }
      state.receipts[plan.id] = { id: plan.id, case: plan.case, asset: plan.asset, from: source.address, to: plan.to, amount: plan.amount, txHash: receipt.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: 1 }; await stateStore.write(state);
    }
    state.status = "Applied"; await stateStore.write(state); await operator.write({});
    return { applied: true, chainId: bootstrap.chainId, chainWrites: writes, receipts: Object.values(state.receipts) };
  } finally { if (operatorHeld) await operator.close(); if (stateHeld) await stateStore.close(); connection?.close(); }
}

export function validateSignedGoalFunding(entry: { from: string; txHash: string; rawTransaction: string }, plan: FundingPlan, from: string, chainId: bigint, maxFee: bigint) {
  const signed = Transaction.from(entry.rawTransaction);
  assert.ok(signed.from && same(signed.from, from) && same(entry.from, from) && signed.to && same(signed.to, plan.target), "FUND_GOALS_SIGNED_RECIPIENT_CHANGED");
  assert.equal(signed.hash, entry.txHash); assert.equal(keccak256(entry.rawTransaction), entry.txHash); assert.equal(signed.chainId, chainId);
  assert.equal(signed.data, plan.data); assert.equal(signed.value, BigInt(plan.value));
  assert.ok((signed.maxFeePerGas ?? signed.gasPrice ?? 0n) <= maxFee && (signed.maxPriorityFeePerGas ?? 0n) <= maxFee, "FUND_GOALS_SIGNED_FEE_CHANGED");
  assert.ok(signed.gasLimit <= (plan.asset === "MON" ? 21000n : 2000000n), "FUND_GOALS_SIGNED_GAS_CHANGED");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const runtime = value("--runtime"), output = value("--out"), mode = value("--mode") ?? "inspect", caseName = value("--case");
  if (!runtime || !output || !["inspect", "apply", "recover"].includes(mode) || caseName !== undefined && !["fallback-recheck", "fallback-fresh"].includes(caseName)) throw new Error("Usage: monad-collaboration-fund-goals.ts --runtime ABS_PRIVATE_RUNTIME --out ABS_ORIGINAL_GOAL_ACCEPTANCE --mode inspect|apply|recover [--case fallback-recheck|fallback-fresh] [--native-wei WEI_PER_AGENT --external-usdc-raw 60000 --fallback-usdc-raw 50000] [--rpc-transport direct|system-https-proxy]");
  fundMonadCollaborationGoals({ runtime: resolve(runtime), output: resolve(output), mode: mode as FundingMode, rpcTransport: value("--rpc-transport") as RpcTransport | undefined, caseName: caseName as CollaborationFundingOptions["caseName"], nativeAmountWei: value("--native-wei"), externalUsdcRaw: value("--external-usdc-raw"), fallbackUsdcRaw: value("--fallback-usdc-raw") }).then(summary => console.log(JSON.stringify(summary))).catch(error => { reportDemoFailure(error); process.exitCode = 1; });
}
