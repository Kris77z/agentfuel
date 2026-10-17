import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Wallet, getBytes, toUtf8String } from "ethers";
import { HostedWalletNetworkError, hostedError, signedLogin, switchHostedWalletToMonad } from "../lib/hosted-client.js";
type Call = { method: string; params?: unknown[] };
const owner = new Wallet(`0x${"1".repeat(64)}`);
function mockWindow(t: TestContext, provider: { request(call: Call): Promise<unknown> }) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { ethereum: provider, location: { origin: "https://monad.tabbyai.xyz" } } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else delete (globalThis as any).window; });
}

test("wallet network recovery switches Monad explicitly and never signs, logs in or sends a transaction", async () => {
  const calls: Call[] = [];
  await switchHostedWalletToMonad({ request: async call => { calls.push(call); return call.method === "eth_chainId" ? "0x279f" : null; } });
  assert.deepEqual(calls, [{ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] }, { method: "eth_chainId" }]);
});

test("only unknown chain 4902 adds the approved public Monad configuration, then checks the real selected chain", async () => {
  const calls: Call[] = []; let switches = 0;
  await switchHostedWalletToMonad({ request: async call => {
    calls.push(call); if (call.method === "wallet_switchEthereumChain" && switches++ === 0) throw { code: 4902 };
    return call.method === "eth_chainId" ? "0x279f" : null;
  } });
  assert.deepEqual(calls.map(call => call.method), ["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain", "eth_chainId"]);
  assert.deepEqual(calls[1].params, [{ chainId: "0x279f", chainName: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: ["https://testnet-rpc.monad.xyz"], blockExplorerUrls: ["https://testnet.monadexplorer.com"] }]);
});

test("rejected, pending and unsupported switch requests remain safe failures without adding a chain", async t => {
  for (const code of [4001, -32002, 4200, -32601]) await t.test(String(code), async () => {
    const calls: Call[] = [];
    await assert.rejects(switchHostedWalletToMonad({ request: async call => { calls.push(call); throw { code, message: "PRIVATE_PROVIDER_DIAGNOSTIC" }; } }), error => {
      assert.equal(hostedError(error).startsWith("钱包"), true); assert.equal(hostedError(error).includes("PRIVATE_PROVIDER_DIAGNOSTIC"), false); return true;
    });
    assert.deepEqual(calls.map(call => call.method), ["wallet_switchEthereumChain"]);
  });
  const calls: Call[] = [];
  await assert.rejects(switchHostedWalletToMonad({ request: async call => {
    calls.push(call); if (call.method === "wallet_switchEthereumChain") throw { code: 4902 }; throw { code: 4001 };
  } }), /钱包切换已取消/);
  assert.deepEqual(calls.map(call => call.method), ["wallet_switchEthereumChain", "wallet_addEthereumChain"]);
});

test("a wallet's successful switch response cannot replace checking eth_chainId", async () => {
  await assert.rejects(switchHostedWalletToMonad({ request: async call => call.method === "eth_chainId" ? "0x1" : null }), /钱包尚未切换/);
});

async function loginFixture(t: TestContext, options: { invalidChallenge?: boolean; changeAfterSign?: boolean } = {}) {
  const calls: Call[] = [], apiCalls: { path: string; body: any }[] = []; let chain = "0x1";
  const provider = { request: async (call: Call) => {
    calls.push(call);
    if (["eth_requestAccounts", "eth_accounts"].includes(call.method)) return [owner.address];
    if (call.method === "eth_chainId") return chain;
    if (call.method === "wallet_switchEthereumChain") { chain = "0x279f"; return null; }
    if (call.method === "personal_sign") {
      const encoded = String(call.params?.[0]); const message = encoded.startsWith("0x") ? toUtf8String(getBytes(encoded)) : encoded;
      if (options.changeAfterSign) chain = "0x1"; return owner.signMessage(message);
    }
    throw new Error(`Forbidden wallet method: ${call.method}`);
  } };
  mockWindow(t, provider);
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), body = JSON.parse(String(init?.body ?? "{}")); apiCalls.push({ path, body });
    if (path.endsWith("/auth/challenge")) {
      const id = "network-unit-challenge", expiresAt = Date.now() + 300000;
      return Response.json({ id, expiresAt, message: `AgentFuel hosted agent login\nOrigin: ${options.invalidChallenge ? "https://other.invalid" : "https://monad.tabbyai.xyz"}\nWallet: ${owner.address}\nChain: 10143\nNonce: ${id}\nExpires: ${new Date(expiresAt).toISOString()}\nThis signature authenticates your platform account. It authorizes no blockchain transaction.` });
    }
    if (path.endsWith("/auth/login")) return Response.json({ authenticated: true });
    throw new Error(`Forbidden API path: ${path}`);
  });
  return { provider, calls, apiCalls, setChain: (value: string) => { chain = value; } };
}

test("wrong-network sign-in exposes typed recovery without silently switching; explicit switch then fresh sign-in succeeds", async t => {
  const f = await loginFixture(t);
  await assert.rejects(signedLogin(), error => error instanceof HostedWalletNetworkError && error.expectedChainId === "10143");
  assert.equal(f.calls.some(call => call.method.startsWith("wallet_") || call.method === "personal_sign"), false);
  assert.equal(f.apiCalls.some(call => call.path.endsWith("/auth/login")), false);
  await switchHostedWalletToMonad(f.provider);
  assert.equal(f.apiCalls.some(call => call.path.endsWith("/auth/login")), false, "Switching alone cannot authenticate an owner");
  assert.equal(await signedLogin(), owner.address);
  assert.equal(f.calls.filter(call => call.method === "personal_sign").length, 1);
  assert.equal(f.apiCalls.filter(call => call.path.endsWith("/auth/login")).length, 1);
  assert.equal(f.calls.some(call => ["eth_sendTransaction", "eth_signTransaction"].includes(call.method)), false);
});

test("a malformed challenge cannot produce an actionable wrong-network error", async t => {
  const f = await loginFixture(t, { invalidChallenge: true });
  await assert.rejects(signedLogin(), error => error instanceof Error && !(error instanceof HostedWalletNetworkError) && /挑战/.test(error.message));
  assert.equal(f.calls.some(call => call.method.startsWith("wallet_") || call.method === "personal_sign"), false);
});

test("a chain change during personal signing still blocks authentication", async t => {
  const f = await loginFixture(t, { changeAfterSign: true }); f.setChain("0x279f");
  await assert.rejects(signedLogin(), /钱包账号或网络已变化/);
  assert.equal(f.apiCalls.some(call => call.path.endsWith("/auth/login")), false);
});
