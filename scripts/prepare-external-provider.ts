import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Contract, Interface, Transaction, Wallet, getAddress, keccak256, ZeroAddress, type JsonRpcProvider } from "ethers";
import { IDENTITY_ABI } from "@agentfuel/erc8004";
import { SessionStore } from "../packages/pi-loop/src/session.js";
import { taskPrivateDirectory, taskPrivateFile } from "../packages/pi-loop/src/task-runner/config.js";
import { DemoJournal } from "./demo-journal.js";
import { reportDemoFailure, saveJson } from "./demo-common.js";
import { MONAD_IDENTITY } from "./demo-monad-config.js";
import { monadProvider, readRpcUrlFile, type RpcTransport } from "./demo-rpc.js";

interface ProviderIdentity { chainId: string; registry: string; agentId: string; wallet: string }
interface Bootstrap {
  version: 1; chainId: string; identity: string; payTo: string;
  contracts: { account: string; manager: string; adapter: string }; rpcUrlFile: string; rpcTransport: RpcTransport;
  roleKeyFiles: { guardian: string; opponent: string }; opponentBinding: { chainId: string; agentId: string; wallet: string };
  externalProvider?: ProviderIdentity; maxFeePerGas: string;
}
interface PreparedState {
  version: 1; binding: string; operation: string; status: "Intent" | "Applied"; provider: ProviderIdentity;
  receipt?: { txHash: string; blockNumber: number; blockHash: string; status: 1 };
}
interface OperatorSlot { directory?: string; hash?: string }
export interface PrepareExternalProviderOptions {
  bootstrapFile: string; directory: string; mode?: "check" | "apply"; recover?: boolean; rpcTransport?: RpcTransport;
}
export interface PrepareExternalProviderDependencies {
  /** Injection is only for an owned Anvil conformance test. CLI never permits 31337. */
  provider: JsonRpcProvider; allowLocalChain?: boolean;
  assertRuntimeStopped?: () => Promise<void>;
}
export interface ExternalProviderPreparationSummary {
  checked: true; readOnly: boolean; chainId: string; externalProvider: ProviderIdentity; whitelisted: boolean;
  metadataReady: boolean; blockNumber: number; blockHash: string; ready: boolean; chainWrites: number;
  requiredAction?: "whitelist" | "append-metadata"; applied?: true; cached?: boolean; receipt?: PreparedState["receipt"];
}
function fail(code: string): never { throw new Error(code); }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a: string, b: string) => getAddress(a) === getAddress(b);
const absolute = (value: string) => { if (!isAbsolute(value) || resolve(value) !== value) fail("EXTERNAL_PREPARE_ABSOLUTE_PATH_REQUIRED"); return value; };
const accountABI = ["function owner() view returns(address)", "function providerWhitelist(address) view returns(bool)", "function setProviderWhitelist(address,bool)", "event ProviderWhitelisted(address indexed provider,bool allowed)"];
const accountInterface = new Interface(accountABI);
async function listening(port: number) {
  return new Promise<boolean>(done => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (active: boolean) => { socket.destroy(); done(active); };
    socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.setTimeout(1000, () => finish(true));
  });
}
async function assertStopped(directory: string) {
  let journal: { ports?: Record<string, number>; ipcDirectory?: string } | undefined;
  try { journal = JSON.parse(await readFile(join(directory, "runtime-journal/session.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  for (const port of new Set([8792, ...Object.values(journal?.ports ?? {})])) if (await listening(port)) fail("MONAD_RUNTIME_STOP_REQUIRED");
  if (journal?.ipcDirectory) {
    try {
      const pid = Number((await readFile(join(journal.ipcDirectory, "settler.owner"), "utf8")).trim());
      if (!Number.isSafeInteger(pid) || pid < 1) fail("MONAD_SETTLER_OWNER_INVALID");
      try { process.kill(pid, 0); fail("MONAD_RUNTIME_STOP_REQUIRED"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
function validateBootstrap(b: Bootstrap, allowLocal: boolean) {
  if (!b || b.version !== 1 || !(b.chainId === "10143" || allowLocal && b.chainId === "31337") ||
    b.opponentBinding?.chainId !== b.chainId || !/^[1-9][0-9]{0,29}$/.test(b.opponentBinding.agentId) ||
    !/^[1-9][0-9]{0,29}$/.test(b.maxFeePerGas) || !["direct", "system-https-proxy"].includes(b.rpcTransport)) fail("EXTERNAL_PREPARE_BOOTSTRAP_INVALID");
  for (const value of [b.identity, b.payTo, b.opponentBinding.wallet, b.contracts.account, b.contracts.manager, b.contracts.adapter]) if (getAddress(value) === ZeroAddress) fail("EXTERNAL_PREPARE_BOOTSTRAP_INVALID");
  if (b.chainId === "10143" && !same(b.identity, MONAD_IDENTITY)) fail("EXTERNAL_PREPARE_IDENTITY_REGISTRY_INVALID");
  if (same(b.opponentBinding.wallet, b.payTo)) fail("EXTERNAL_PREPARE_PROVIDER_COLLISION");
  for (const path of [b.rpcUrlFile, b.roleKeyFiles.guardian, b.roleKeyFiles.opponent]) absolute(path);
  if (b.externalProvider && (Object.keys(b.externalProvider).sort().join(",") !== "agentId,chainId,registry,wallet" ||
    b.externalProvider.chainId !== b.chainId || b.externalProvider.agentId !== b.opponentBinding.agentId ||
    !same(b.externalProvider.registry, b.identity) || !same(b.externalProvider.wallet, b.opponentBinding.wallet))) fail("EXTERNAL_PREPARE_METADATA_CHANGED");
}

/** Default check is read-only. Explicit apply admits only the pre-existing,
 * independently registered opponent wallet; it never creates or funds Agents.
 * A persisted signature is replayed byte-for-byte until canonically confirmed. */
export async function prepareExternalProvider(options: PrepareExternalProviderOptions, deps?: PrepareExternalProviderDependencies): Promise<ExternalProviderPreparationSummary> {
  const bootstrapFile = absolute(options.bootstrapFile), directory = absolute(options.directory), apply = options.mode === "apply";
  if (options.mode !== undefined && !["check", "apply"].includes(options.mode)) fail("EXTERNAL_PREPARE_MODE_INVALID");
  if (options.rpcTransport !== undefined && !["direct", "system-https-proxy"].includes(options.rpcTransport)) fail("EXTERNAL_PREPARE_TRANSPORT_INVALID");
  const raw = JSON.parse(await taskPrivateFile(bootstrapFile)) as Bootstrap;
  validateBootstrap(raw, deps?.allowLocalChain === true);
  const externalProvider: ProviderIdentity = { chainId: raw.chainId, registry: raw.identity, agentId: raw.opponentBinding.agentId, wallet: raw.opponentBinding.wallet };
  let connection: Awaited<ReturnType<typeof monadProvider>> | undefined;
  const runtimeLock = new SessionStore(join(directory, "runtime-journal")), stateStore = new SessionStore<PreparedState>(join(directory, "external-provider-preparation"));
  let runtimeHeld = false, stateHeld = false, operator: SessionStore<OperatorSlot> | undefined, operatorHeld = false;
  try {
    const rpc = deps?.provider ?? (connection = await monadProvider(await readRpcUrlFile(raw.rpcUrlFile), options.rpcTransport ?? raw.rpcTransport)).provider;
    if (BigInt(await rpc.send("eth_chainId", [])) !== BigInt(raw.chainId)) fail("EXTERNAL_PREPARE_NETWORK_MISMATCH");
    const head = await rpc.getBlock("latest"); if (!head?.hash) fail("EXTERNAL_PREPARE_HEAD_UNCONFIRMED");
    const identity = new Contract(raw.identity, IDENTITY_ABI, rpc), account = new Contract(raw.contracts.account, accountABI, rpc);
    const adapter = new Contract(raw.contracts.adapter, ["function identity() view returns(address)", "function resolveAgent(uint256) view returns(address owner,address wallet)", "function identityChanged(uint256) view returns(bool)"], rpc);
    const manager = new Contract(raw.contracts.manager, ["function guardian() view returns(address)"], rpc);
    const [wallet, owner, resolved, changed, identityRegistry, protocolOwner, guardian, whitelisted] = await Promise.all([
      identity.getFunction("getAgentWallet").staticCall(externalProvider.agentId, { blockTag: head.number }),
      identity.getFunction("ownerOf").staticCall(externalProvider.agentId, { blockTag: head.number }),
      adapter.getFunction("resolveAgent").staticCall(externalProvider.agentId, { blockTag: head.number }),
      adapter.getFunction("identityChanged").staticCall(externalProvider.agentId, { blockTag: head.number }),
      adapter.getFunction("identity").staticCall({ blockTag: head.number }), account.getFunction("owner").staticCall({ blockTag: head.number }),
      manager.getFunction("guardian").staticCall({ blockTag: head.number }), account.getFunction("providerWhitelist").staticCall(externalProvider.wallet, { blockTag: head.number }),
    ]);
    const opponent = new Wallet((await taskPrivateFile(raw.roleKeyFiles.opponent)).trim());
    if (!same(wallet, externalProvider.wallet) || !same(resolved.wallet, wallet) || !same(resolved.owner, owner) || changed ||
      !same(identityRegistry, raw.identity) || !same(opponent.address, externalProvider.wallet) || getAddress(owner) === ZeroAddress) fail("EXTERNAL_PREPARE_IDENTITY_CHANGED");
    if ((await rpc.getBlock(head.number))?.hash !== head.hash) fail("EXTERNAL_PREPARE_HEAD_UNCONFIRMED");
    const checked = { checked: true as const, readOnly: !apply, chainId: raw.chainId, externalProvider, whitelisted: Boolean(whitelisted),
      metadataReady: !!raw.externalProvider, blockNumber: head.number, blockHash: head.hash };
    if (!apply) return { ...checked, ready: !!whitelisted && !!raw.externalProvider,
      ...(whitelisted ? raw.externalProvider ? {} : { requiredAction: "append-metadata" } : { requiredAction: "whitelist" }), chainWrites: 0 };
    await (deps?.assertRuntimeStopped ?? (() => assertStopped(directory)))();
    await taskPrivateDirectory(directory);
    await runtimeLock.start(options.recover); runtimeHeld = true;
    await stateStore.start(options.recover); stateHeld = true;
    const signer = new Wallet((await taskPrivateFile(raw.roleKeyFiles.guardian)).trim(), rpc);
    if (!same(signer.address, guardian) || !same(signer.address, protocolOwner)) fail("EXTERNAL_PREPARE_GUARDIAN_OWNER_REQUIRED");
    const binding = hash({ externalProvider, account: raw.contracts.account, guardian: signer.address, maxFeePerGas: raw.maxFeePerGas });
    const operation = `whitelist-external-${binding}`, state = await stateStore.read() ?? { version: 1 as const, binding, operation, status: "Intent" as const, provider: externalProvider };
    if (state.version !== 1 || state.binding !== binding || state.operation !== operation || hash(state.provider) !== hash(externalProvider)) fail("EXTERNAL_PREPARE_BINDING_CHANGED");
    const journalFile = join(stateStore.directory, "transactions.json"), journal = new DemoJournal(rpc, journalFile); await journal.load();
    let writes = 0;
    if (!whitelisted || journal.has(operation)) {
      if (state.status === "Applied" && !whitelisted) fail("EXTERNAL_PREPARE_WHITELIST_REVOKED");
      operator = new SessionStore<OperatorSlot>(join(directory, "wallets", "operator", signer.address.toLowerCase()));
      await operator.start(options.recover); operatorHeld = true;
      const active = await operator.read(); if (active?.directory && active.directory !== stateStore.directory) fail("HOSTED_GUARDIAN_RECOVERY_REQUIRED");
      await operator.write({ directory: stateStore.directory, ...(active?.hash ? { hash: active.hash } : {}) });
      await stateStore.write(state);
      if (!journal.has(operation)) {
        if (await rpc.getTransactionCount(signer.address, "latest") !== await rpc.getTransactionCount(signer.address, "pending")) fail("EXTERNAL_PREPARE_OPERATOR_TRANSACTION_PENDING");
        const fees = await rpc.getFeeData(), cap = BigInt(raw.maxFeePerGas);
        if (!fees.maxFeePerGas || fees.maxFeePerGas > cap || (fees.maxPriorityFeePerGas ?? 0n) > cap) fail("EXTERNAL_PREPARE_FEE_CEILING_EXCEEDED");
        const request = { to: raw.contracts.account, data: accountInterface.encodeFunctionData("setProviderWhitelist", [externalProvider.wallet, true]), value: 0n, chainId: BigInt(raw.chainId) };
        const estimate = await rpc.estimateGas({ ...request, from: signer.address }), gasLimit = (estimate * 13n + 9n) / 10n;
        if (gasLimit > 200000n) fail("EXTERNAL_PREPARE_GAS_CEILING_EXCEEDED");
        await journal.send(operation, signer, { ...request, gasLimit, maxFeePerGas: cap, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n }); writes++;
      }
      const entry = (JSON.parse(await taskPrivateFile(journalFile)) as Record<string, { from: string; txHash: string; rawTransaction: string }>)[operation];
      const signed = Transaction.from(entry.rawTransaction);
      if (!signed.from || !same(signed.from, signer.address) || !same(entry.from, signer.address) || signed.hash !== entry.txHash || keccak256(entry.rawTransaction) !== entry.txHash ||
        !signed.to || !same(signed.to, raw.contracts.account) || signed.chainId !== BigInt(raw.chainId) || signed.value !== 0n ||
        signed.data !== accountInterface.encodeFunctionData("setProviderWhitelist", [externalProvider.wallet, true]) || (signed.maxFeePerGas ?? signed.gasPrice ?? 0n) > BigInt(raw.maxFeePerGas)) fail("EXTERNAL_PREPARE_SIGNED_BINDING_CHANGED");
      await operator.write({ directory: stateStore.directory, hash: entry.txHash });
      const receipt = await journal.receipt(operation), transaction = await rpc.getTransaction(receipt.hash);
      const events = receipt.logs.filter(log => same(log.address, raw.contracts.account)).flatMap(log => { try { const event = accountInterface.parseLog(log); return event?.name === "ProviderWhitelisted" ? [event] : []; } catch { return []; } });
      if (receipt.status !== 1 || receipt.hash !== entry.txHash || (await rpc.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash ||
        !transaction?.to || !same(transaction.to, raw.contracts.account) || !same(transaction.from, signer.address) || transaction.data !== signed.data ||
        events.length !== 1 || !same(events[0].args.provider, externalProvider.wallet) || events[0].args.allowed !== true ||
        !await account.getFunction("providerWhitelist").staticCall(externalProvider.wallet, { blockTag: receipt.blockNumber })) fail("EXTERNAL_PREPARE_RECEIPT_UNCONFIRMED");
      state.receipt = { txHash: receipt.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: 1 };
    }
    // Recheck the original identity and admission together at a canonical head
    // before appending local metadata, including after an interrupted intent.
    const admitted = await rpc.getBlock("latest"); if (!admitted?.hash) fail("EXTERNAL_PREPARE_HEAD_UNCONFIRMED");
    const [admittedWallet, admittedChanged, admittedWhitelist] = await Promise.all([
      identity.getFunction("getAgentWallet").staticCall(externalProvider.agentId, { blockTag: admitted.number }),
      adapter.getFunction("identityChanged").staticCall(externalProvider.agentId, { blockTag: admitted.number }),
      account.getFunction("providerWhitelist").staticCall(externalProvider.wallet, { blockTag: admitted.number }),
    ]);
    if (!same(admittedWallet, externalProvider.wallet) || admittedChanged) fail("EXTERNAL_PREPARE_IDENTITY_CHANGED");
    if (!admittedWhitelist || (await rpc.getBlock(admitted.number))?.hash !== admitted.hash) fail("EXTERNAL_PREPARE_HEAD_UNCONFIRMED");
    if (!raw.externalProvider) await saveJson(bootstrapFile, { ...raw, externalProvider });
    state.status = "Applied"; await stateStore.write(state);
    const summary: ExternalProviderPreparationSummary = { ...checked, blockNumber: admitted.number, blockHash: admitted.hash, whitelisted: true, metadataReady: true, ready: true, applied: true, cached: writes === 0, chainWrites: writes,
      ...(state.receipt ? { receipt: state.receipt } : {}) };
    await saveJson(join(stateStore.directory, "summary.json"), summary);
    if (operatorHeld) await operator!.write({});
    return summary;
  } finally { if (operatorHeld) await operator!.close(); if (stateHeld) await stateStore.close(); if (runtimeHeld) await runtimeLock.close(); connection?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const bootstrapFile = value("--bootstrap"), directory = value("--out") ?? (bootstrapFile ? join(dirname(resolve(bootstrapFile)), "runtime") : undefined);
  if (!bootstrapFile || !directory || args.includes("--apply") && args.includes("--check") ||
    args.some((arg, index) => arg.startsWith("--") && !["--bootstrap", "--out", "--apply", "--check", "--recover", "--rpc-transport"].includes(arg))) {
    console.error("USAGE: prepare-external-provider --bootstrap ABS_FILE [--out ABS_RUNTIME_DIR] [--check|--apply] [--recover] [--rpc-transport direct|system-https-proxy]"); process.exitCode = 1;
  } else {
    prepareExternalProvider({ bootstrapFile: resolve(bootstrapFile), directory: resolve(directory), mode: args.includes("--apply") ? "apply" : "check", recover: args.includes("--recover"),
      ...(value("--rpc-transport") ? { rpcTransport: value("--rpc-transport") as RpcTransport } : {}) }).then(summary => console.log(JSON.stringify(summary))).catch(error => { reportDemoFailure(error); process.exitCode = 1; });
  }
}
