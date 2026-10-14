import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JsonRpcProvider } from "ethers";
import { taskPrivateFile } from "../packages/pi-loop/src/task-runner/config.js";
import { SessionStore } from "@agentfuel/pi-loop/session";
import { loadConfig } from "../services/provider-relay/src/config.js";
import { Refunder } from "../services/provider-relay/src/refunder.js";
import { ExternalSpecialistRelay, createExternalServiceServer } from "../services/hosted-agents/src/external/service.js";
import { validateExternalHiringConfig, type ExternalServiceTrust } from "../services/hosted-agents/src/external/registry.js";
import { monadProvider, proxyUpstreamFetch, readRpcUrlFile, systemHttpsProxy } from "./demo-rpc.js";

/** Start one real HTTP specialist and registry. Startup performs reads only;
 * model execution begins after the hosted Agent's verified Account payment. */
export async function startExternalSpecialist(env: NodeJS.ProcessEnv, injected?: { provider: JsonRpcProvider; modelFetch: typeof fetch }) {
  const path = env.EXTERNAL_SERVICE_CONFIG_FILE;
  if (!path) throw new Error("EXTERNAL_SERVICE_CONFIG_FILE_REQUIRED");
  const raw = JSON.parse(await taskPrivateFile(resolve(path))) as { service: ExternalServiceTrust; reputation?: { score: number | null; samples: number } };
  const trust = validateExternalHiringConfig({ version: 1, registryUrl: new URL("/services", raw.service.endpoint).href, services: [raw.service] }).services[0];
  const configured = { ...env, ...(env.RPC_URL_FILE ? { RPC_URL: await readRpcUrlFile(env.RPC_URL_FILE) } : {}) };
  const config = loadConfig(configured);
  if (config.host !== "127.0.0.1" || ![31337n, 10143n].includes(config.chainId) || new URL(trust.endpoint).hostname !== "127.0.0.1" ||
    new URL(trust.endpoint).port !== String(config.port)) throw new Error("EXTERNAL_LOCAL_OPERATOR_ONLY");
  const rpcTransport = env.RPC_TRANSPORT ?? "direct", upstreamTransport = env.UPSTREAM_TRANSPORT ?? "direct";
  if (!["direct", "system-https-proxy"].includes(rpcTransport) || !["direct", "system-https-proxy"].includes(upstreamTransport)) throw new Error("INVALID_TRANSPORT");
  if (config.chainId === 31337n && (rpcTransport !== "direct" || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(config.rpcUrl).hostname))) throw new Error("LOCAL_RPC_REQUIRED");
  let connection: Awaited<ReturnType<typeof monadProvider>> | undefined;
  let transport: ReturnType<typeof proxyUpstreamFetch> | undefined;
  let provider: JsonRpcProvider | undefined, relay: ExternalSpecialistRelay | undefined;
  let server: ReturnType<typeof createExternalServiceServer> | undefined;
  const owner = new SessionStore(resolve(config.dataDir, "service-owner"));
  const close = async () => {
    if (server?.listening) await new Promise<void>(done => { server!.close(() => done()); server!.closeIdleConnections(); });
    relay?.close(); transport?.close(); if (!injected) { if (connection) connection.close(); else provider?.destroy(); }
    await owner.close();
  };
  try {
    await owner.start(env.EXTERNAL_RECOVER_LOCK === "1");
    provider = injected?.provider;
    if (!provider) {
      if (config.chainId === 10143n) { connection = await monadProvider(config.rpcUrl, rpcTransport as "direct" | "system-https-proxy"); provider = connection.provider; }
      else provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
    }
    if (!injected && upstreamTransport === "system-https-proxy") transport = proxyUpstreamFetch(await systemHttpsProxy(), config.upstreamTimeout);
    relay = new ExternalSpecialistRelay(config, trust, { provider, upstreamFetch: injected?.modelFetch ?? transport?.fetch });
    const refunder = new Refunder(relay);
    await relay.initialize(); await refunder.initialize(); await refunder.recover(); await relay.recover();
    server = createExternalServiceServer(relay, refunder, raw.reputation); server.listen(config.port, config.host); await once(server, "listening");
    return { server, close };
  } catch (error) { await close(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startExternalSpecialist(process.env).then(runtime => {
    console.log(JSON.stringify({ ready: true, service: "external-specialist", port: (runtime.server.address() as { port: number }).port }));
    let closing = false; const stop = () => { if (!closing) { closing = true; void runtime.close(); } };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
  }).catch(() => { console.error("EXTERNAL_SPECIALIST_START_FAILED"); process.exitCode = 1; });
}
