// Server-only: this module owns Node RPC transport and is never imported by client components.
import { JsonRpcProvider } from "ethers";
import { readRpcUrlFile, rpcRequest, systemHttpsProxy } from "../../scripts/demo-rpc";

export function frontendTransport(value = process.env.FRONTEND_RPC_TRANSPORT ?? "direct") {
  if (value !== "direct" && value !== "system-https-proxy") throw new Error("FRONTEND_RPC_TRANSPORT_INVALID");
  return { transport: value, creditTimeoutMs: value === "direct" ? 12_000 : 120_000, arenaTimeoutMs: value === "direct" ? 15_000 : 90_000 };
}

export async function createServerRpc(rpcUrl: string, resolveProxy = systemHttpsProxy) {
  const { transport } = frontendTransport();
  const file = process.env.FRONTEND_RPC_URL_FILE;
  const effectiveRpcUrl = file ? await readRpcUrlFile(file) : rpcUrl;
  const proxyUrl = transport === "system-https-proxy" ? await resolveProxy() : undefined;
  const connection = rpcRequest(effectiveRpcUrl, proxyUrl, 30_000, transport === "system-https-proxy");
  const provider = new JsonRpcProvider(connection.request, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
  return { provider, close() { try { provider.destroy(); } finally { connection.close(); } } };
}
