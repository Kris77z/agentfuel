// Server-only: this module owns Node RPC transport and is never imported by client components.
import { JsonRpcProvider } from "ethers";
import { setTimeout as delay } from "node:timers/promises";
import { readRpcUrlFile, rpcRequest, systemHttpsProxy } from "../../scripts/demo-rpc";

export function frontendTransport(value = process.env.FRONTEND_RPC_TRANSPORT ?? "direct") {
  if (value !== "direct" && value !== "system-https-proxy") throw new Error("FRONTEND_RPC_TRANSPORT_INVALID");
  return { transport: value, creditTimeoutMs: value === "direct" ? 12_000 : 120_000, arenaTimeoutMs: value === "direct" ? 15_000 : 90_000 };
}

export async function createServerRpc(rpcUrl: string, resolveProxy = systemHttpsProxy) {
  const { transport } = frontendTransport();
  const interval = Number(process.env.AGENTFUEL_RPC_INTERVAL_MS ?? "0");
  if (!Number.isInteger(interval) || interval < 0 || interval > 5000) throw new Error("RPC_INTERVAL_INVALID");
  const callGasValue = process.env.AGENTFUEL_RPC_CALL_GAS_LIMIT;
  let callGas: string | undefined;
  if (callGasValue !== undefined) {
    const units = Number(callGasValue);
    if (!/^[1-9][0-9]*$/.test(callGasValue) || !Number.isSafeInteger(units) || units < 21000 || units > 1000000) throw new Error("RPC_CALL_GAS_LIMIT_INVALID");
    callGas = `0x${units.toString(16)}`;
  }
  const file = process.env.FRONTEND_RPC_URL_FILE;
  const effectiveRpcUrl = file ? await readRpcUrlFile(file) : rpcUrl;
  const proxyUrl = transport === "system-https-proxy" ? await resolveProxy() : undefined;
  // The shared adapter retries only its existing read allowlist; direct opt-in also owns a keep-alive pool.
  const retryRead503 = transport === "system-https-proxy" || process.env.AGENTFUEL_RPC_RETRY_READ_503 === "1";
  const connection = rpcRequest(effectiveRpcUrl, proxyUrl, 30_000, retryRead503);
  const provider = new JsonRpcProvider(connection.request, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
  let closed = false, nextAt = 0, queue = Promise.resolve();
  const originalSend = provider.send.bind(provider);
  const send: typeof provider.send = (method, params) => {
    // Match the backend's operator cap: preserve explicit gas, estimates, and broadcasts.
    if (callGas !== undefined && method === "eth_call" && Array.isArray(params) && params[0] !== null
      && typeof params[0] === "object" && !Array.isArray(params[0]) && params[0].gas === undefined) {
      return originalSend(method, [{ ...params[0], gas: callGas }, ...params.slice(1)]);
    }
    return originalSend(method, params);
  };
  if (callGas !== undefined) provider.send = send;
  if (interval > 0) provider.send = (method, params) => {
    const result = queue.then(async () => {
      if (closed) throw new Error("RPC_CONNECTION_CLOSED");
      const wait = Math.max(0, nextAt - Date.now());
      if (wait) await delay(wait);
      if (closed) throw new Error("RPC_CONNECTION_CLOSED");
      nextAt = Date.now() + interval;
      return send(method, params);
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  return { provider, close() { closed = true; try { provider.destroy(); } finally { connection.close(); } } };
}
