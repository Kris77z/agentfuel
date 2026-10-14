import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet, Transaction } from "ethers";
import { prepareExternalProvider } from "../prepare-external-provider.js";
import { fixture, startAnvil, stopAnvil, key, tx } from "../../services/underwriter/test/fixture.js";
import { SessionStore } from "../../packages/pi-loop/src/session.js";

test("read-only admission check and journaled apply reuse registered opponent; replay has zero new nonce and preserves old bootstrap", { timeout: 90000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tabby-prepare-external-"))), anvil = await startAnvil();
  const f = await fixture(anvil.rpc, join(root, "credit"), 6);
  const write = async (name: string, value: unknown) => { const file = join(root, name); await writeFile(file, typeof value === "string" ? value : JSON.stringify(value), { mode: 0o600 }); return file; };
  const guardian = await write("guardian.key", key(1)), opponent = await write("opponent.key", key(2)), rpcUrlFile = await write("rpc.txt", anvil.rpc);
  const bootstrap = { version: 1, chainId: "31337", identity: await f.identity.getAddress(), payTo: f.payee,
    contracts: { account: await f.account.getAddress(), manager: await f.manager.getAddress(), adapter: await f.adapter.getAddress() },
    rpcUrlFile, rpcTransport: "direct", maxFeePerGas: "100000000000", roleKeyFiles: { guardian, opponent },
    opponentBinding: { chainId: "31337", agentId: "1", wallet: f.agentAddress }, tasks: [{ taskId: "stable-existing-task", deadline: 12345678 }], unrelated: { immutable: true } };
  const bootstrapFile = await write("bootstrap.json", bootstrap), directory = join(root, "runtime");
  let stoppedChecks = 0;
  const deps = { provider: f.provider, allowLocalChain: true, assertRuntimeStopped: async () => { stoppedChecks++; } };
  try {
    const original = await readFile(bootstrapFile, "utf8"), beforeNonce = await f.provider.getTransactionCount(await f.admin.getAddress());
    const checked = await prepareExternalProvider({ bootstrapFile, directory }, deps);
    assert.equal(checked.readOnly, true); assert.equal(checked.whitelisted, false); assert.equal(checked.chainWrites, 0); assert.equal(checked.ready, false);
    assert.ok("requiredAction" in checked); assert.equal(checked.requiredAction, "whitelist");
    assert.equal(await readFile(bootstrapFile, "utf8"), original); assert.equal(stoppedChecks, 0);
    await assert.rejects(stat(directory), { code: "ENOENT" }); assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), beforeNonce);
    const applied = await prepareExternalProvider({ bootstrapFile, directory, mode: "apply" }, deps);
    assert.equal(applied.applied, true); assert.equal(applied.chainWrites, 1); assert.equal(applied.ready, true); assert.equal(applied.whitelisted, true);
    assert.ok("receipt" in applied); assert.match(applied.receipt!.txHash, /^0x[a-f0-9]{64}$/); assert.equal(applied.receipt!.status, 1);
    const updated = JSON.parse(await readFile(bootstrapFile, "utf8")); const { externalProvider, ...rest } = updated;
    assert.deepEqual(rest, bootstrap); assert.deepEqual(externalProvider, { ...bootstrap.opponentBinding, registry: bootstrap.identity });
    assert.equal((await stat(bootstrapFile)).mode & 0o777, 0o600);
    assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), beforeNonce + 1);
    const journal = JSON.parse(await readFile(join(directory, "external-provider-preparation/transactions.json"), "utf8"));
    assert.equal(Object.keys(journal).length, 1); assert.equal(Object.values(journal).map((v: any) => v.txHash)[0], applied.receipt!.txHash);
    const afterNonce = await f.provider.getTransactionCount(await f.admin.getAddress());
    const repeated = await prepareExternalProvider({ bootstrapFile, directory, mode: "apply", recover: true }, deps);
    assert.equal(repeated.cached, true); assert.equal(repeated.chainWrites, 0); assert.deepEqual(repeated.receipt, applied.receipt);
    assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), afterNonce);
    assert.deepEqual(JSON.parse(await readFile(bootstrapFile, "utf8")), updated); assert.equal(stoppedChecks, 2);
    const slot = JSON.parse(await readFile(join(directory, "wallets/operator", (await f.admin.getAddress()).toLowerCase(), "session.json"), "utf8"));
    assert.deepEqual(slot, {});
    const ready = await prepareExternalProvider({ bootstrapFile, directory }, deps); assert.equal(ready.ready, true); assert.equal(ready.chainWrites, 0);
    // Existing runtime operator intent blocks this separate nonce writer.
    const operator = new SessionStore<{ directory: string }>(join(directory, "wallets/operator", (await f.admin.getAddress()).toLowerCase()));
    await operator.start(); await operator.write({ directory: join(root, "unreconciled-old-run") }); await operator.close();
    await assert.rejects(prepareExternalProvider({ bootstrapFile, directory, mode: "apply", recover: true }, deps), /HOSTED_GUARDIAN_RECOVERY_REQUIRED/);
    assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), afterNonce);
  } finally { await f.close(); await stopAnvil(anvil.child); await rm(root, { recursive: true, force: true }); }
});

test("identity mismatch, provider collision, unauthorized guardian and active runtime never whitelist or mutate bootstrap", { timeout: 90000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tabby-prepare-external-reject-"))), anvil = await startAnvil();
  const f = await fixture(anvil.rpc, join(root, "credit"), 6);
  const guardian = join(root, "guardian.key"), opponent = join(root, "opponent.key"), rpcUrlFile = join(root, "rpc.txt"), bootstrapFile = join(root, "bootstrap.json"), directory = join(root, "runtime");
  await writeFile(guardian, key(1), { mode: 0o600 }); await writeFile(opponent, key(2), { mode: 0o600 }); await writeFile(rpcUrlFile, anvil.rpc, { mode: 0o600 });
  const bootstrap = { version: 1, chainId: "31337", identity: await f.identity.getAddress(), payTo: f.payee,
    contracts: { account: await f.account.getAddress(), manager: await f.manager.getAddress(), adapter: await f.adapter.getAddress() }, rpcUrlFile, rpcTransport: "direct", maxFeePerGas: "100000000000",
    roleKeyFiles: { guardian, opponent }, opponentBinding: { chainId: "31337", agentId: "1", wallet: f.agentAddress } };
  const put = () => writeFile(bootstrapFile, JSON.stringify(bootstrap), { mode: 0o600 }); await put();
  const deps = { provider: f.provider, allowLocalChain: true, assertRuntimeStopped: async () => {} };
  try {
    // CLI/public handler permits Monad only, even if a caller supplies local RPC.
    await assert.rejects(prepareExternalProvider({ bootstrapFile, directory }, { provider: f.provider }), /EXTERNAL_PREPARE_BOOTSTRAP_INVALID/);
    const before = await readFile(bootstrapFile, "utf8"), nonce = await f.provider.getTransactionCount(await f.admin.getAddress());
    await assert.rejects(prepareExternalProvider({ bootstrapFile, directory, mode: "apply" }, { ...deps, assertRuntimeStopped: async () => { throw new Error("MONAD_RUNTIME_STOP_REQUIRED"); } }), /MONAD_RUNTIME_STOP_REQUIRED/);
    assert.equal(await readFile(bootstrapFile, "utf8"), before);
    await writeFile(guardian, key(9)); await assert.rejects(prepareExternalProvider({ bootstrapFile, directory, mode: "apply" }, deps), /EXTERNAL_PREPARE_GUARDIAN_OWNER_REQUIRED/); await writeFile(guardian, key(1));
    assert.equal(await f.account.getFunction("providerWhitelist").staticCall(f.agentAddress), false); assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), nonce);
    await writeFile(bootstrapFile, JSON.stringify({ ...bootstrap, payTo: f.agentAddress })); await assert.rejects(prepareExternalProvider({ bootstrapFile, directory }, deps), /EXTERNAL_PREPARE_PROVIDER_COLLISION/); await put();
    f.admin.reset(); await tx(f.identity, f.admin, "cheatSetWalletOnly", [1n, new Wallet(key(9)).address]);
    await assert.rejects(prepareExternalProvider({ bootstrapFile, directory, mode: "apply" }, deps), /EXTERNAL_PREPARE_IDENTITY_CHANGED/);
    assert.equal(await readFile(bootstrapFile, "utf8"), before); assert.equal(await f.account.getFunction("providerWhitelist").staticCall(f.agentAddress), false);
  } finally { await f.close(); await stopAnvil(anvil.child); await rm(root, { recursive: true, force: true }); }
});

test("interrupted whitelist submission resumes the original journaled signature and nonce before appending metadata", { timeout: 90000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tabby-prepare-external-recovery-"))), anvil = await startAnvil();
  const f = await fixture(anvil.rpc, join(root, "credit"), 6), directory = join(root, "runtime");
  const guardian = join(root, "guardian.key"), opponent = join(root, "opponent.key"), rpcUrlFile = join(root, "rpc.txt"), bootstrapFile = join(root, "bootstrap.json");
  await writeFile(guardian, key(1), { mode: 0o600 }); await writeFile(opponent, key(2), { mode: 0o600 }); await writeFile(rpcUrlFile, anvil.rpc, { mode: 0o600 });
  const bootstrap = { version: 1, chainId: "31337", identity: await f.identity.getAddress(), payTo: f.payee,
    contracts: { account: await f.account.getAddress(), manager: await f.manager.getAddress(), adapter: await f.adapter.getAddress() }, rpcUrlFile, rpcTransport: "direct", maxFeePerGas: "100000000000",
    roleKeyFiles: { guardian, opponent }, opponentBinding: { chainId: "31337", agentId: "1", wallet: f.agentAddress } };
  await writeFile(bootstrapFile, JSON.stringify(bootstrap), { mode: 0o600 });
  const deps = { provider: f.provider, allowLocalChain: true, assertRuntimeStopped: async () => {} };
  const broadcast = f.provider.broadcastTransaction.bind(f.provider), originalBootstrap = await readFile(bootstrapFile, "utf8");
  try {
    const nonce = await f.provider.getTransactionCount(await f.admin.getAddress());
    f.provider.broadcastTransaction = async () => { throw new Error("controlled failed acknowledgement before broadcast"); };
    await assert.rejects(prepareExternalProvider({ bootstrapFile, directory, mode: "apply" }, deps), /RECORDED_TRANSACTION_UNCONFIRMED_USE_SAME_OUTPUT/);
    const journalPath = join(directory, "external-provider-preparation/transactions.json"), originalJournal = await readFile(journalPath, "utf8");
    const entries = JSON.parse(originalJournal), entry = Object.values(entries)[0] as { txHash: string; rawTransaction: string };
    assert.equal(Transaction.from(entry.rawTransaction).nonce, nonce); assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), nonce);
    assert.equal(await readFile(bootstrapFile, "utf8"), originalBootstrap); assert.equal(await f.account.getFunction("providerWhitelist").staticCall(f.agentAddress), false);
    assert.equal(JSON.parse(await readFile(join(directory, "external-provider-preparation/session.json"), "utf8")).status, "Intent");
    f.provider.broadcastTransaction = broadcast;
    const resumed = await prepareExternalProvider({ bootstrapFile, directory, mode: "apply", recover: true }, deps);
    assert.equal(resumed.ready, true); assert.equal(resumed.receipt!.txHash, entry.txHash); assert.equal(await readFile(journalPath, "utf8"), originalJournal);
    assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), nonce + 1);
    const repeated = await prepareExternalProvider({ bootstrapFile, directory, mode: "apply", recover: true }, deps);
    assert.equal(repeated.chainWrites, 0); assert.equal(repeated.receipt!.txHash, entry.txHash); assert.equal(await f.provider.getTransactionCount(await f.admin.getAddress()), nonce + 1);
  } finally { f.provider.broadcastTransaction = broadcast; await f.close(); await stopAnvil(anvil.child); await rm(root, { recursive: true, force: true }); }
});
