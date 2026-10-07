import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { hostedAgentsRequest } from "../lib/hosted-agents-proxy.js";

const origin = "http://127.0.0.1:3000", upstreamUrl = "http://127.0.0.1:8791", token = "s".repeat(64);
const config = { origin, upstreamUrl }, cookie = `agentfuel_hosted_session=${token}`;
const settings = { name: "Hosted", modelId: "coder", strategy: "balanced", perRunBudgetRaw: "120000", totalBudgetRaw: "1000000", allowCredit: true };
function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/hosted${path}`, { method, headers: { host: "127.0.0.1:3000", origin, "content-type": "application/json", cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test("login keeps bearer only in HttpOnly Strict cookie; HTTPS adds Secure; logout clears it", async () => {
  const expiresAt = Date.now() + 3600000; let calls = 0;
  const fetcher = (async (url: URL | RequestInfo, options?: RequestInit) => {
    calls++; assert.equal(String(url), `${upstreamUrl}/auth/login`); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    const headers = new Headers(options?.headers); assert.equal(headers.get("authorization"), null); assert.equal(headers.get("cookie"), null); assert.equal(headers.get("origin"), upstreamUrl);
    return Response.json({ token, expiresAt, privateKey: "FAKE_PRIVATE_SENTINEL" });
  }) as typeof fetch;
  const response = await hostedAgentsRequest(request("/auth/login", "POST", { challengeId: "challenge", signature: "signature" }), { ...config, fetcher });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { authenticated: true, expiresAt });
  assert.match(response.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/); assert.match(response.headers.get("set-cookie")!, /Path=\/api\/hosted/); assert.doesNotMatch(response.headers.get("set-cookie")!, /Secure/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const secure = await hostedAgentsRequest(new Request("https://app.example/api/hosted/auth/login", { method: "POST", headers: { host: "app.example", origin: "https://app.example", "content-type": "application/json" }, body: "{}" }), { ...config, origin: "https://app.example", fetcher });
  assert.match(secure.headers.get("set-cookie")!, /; Secure/); assert.equal(calls, 2);
  const logout = await hostedAgentsRequest(request("/auth/logout", "POST", {}), { ...config, fetcher: (async (_url, options) => {
    assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${token}`); return Response.json({ authenticated: false });
  }) as typeof fetch });
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
});
test("bridge refuses owner/header injection, cross origin and unsafe upstream before fetch", async () => {
  let calls = 0; const fetcher = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  for (const [input, options, status] of [
    [request("/agents", "POST", { ...settings, requestId: "id", owner: "attacker" }), config, 400],
    [request("/agents", "GET", undefined, { authorization: "Bearer attacker" }), config, 403],
    [request("/agents", "GET", undefined, { "x-owner": "attacker" }), config, 403],
    [request("/agents", "GET", undefined, { origin: "https://evil.example" }), config, 403],
    [request("/agents", "GET", undefined, { host: "evil.example" }), config, 403],
    [request("/agents", "GET", undefined, { "sec-fetch-site": "same-site" }), config, 403],
    [request("/agents", "GET", undefined, { cookie: "" }), config, 401],
    [request("/agents", "GET", undefined, { cookie: `${cookie}; ${cookie}` }), config, 401],
    [request("/agents?owner=attacker"), config, 400],
    [request("/agents"), { ...config, upstreamUrl: "https://evil.example/" }, 503],
    [request("/agents"), { ...config, upstreamUrl: undefined }, 503],
    [request("/agents"), { ...config, origin: undefined }, 503],
    [request("/arbitrary"), config, 404],
    [request("/agents", "DELETE"), config, 405],
  ] as const) assert.equal((await hostedAgentsRequest(input, { ...options, fetcher })).status, status);
  const missingOrigin = request("/agents", "POST", { ...settings, requestId: "id" }); missingOrigin.headers.delete("origin");
  assert.equal((await hostedAgentsRequest(missingOrigin, { ...config, fetcher })).status, 403); assert.equal(calls, 0);
});
test("fixed paths use only cookie bearer and public projections; upstream errors never leak", async () => {
  let calls = 0;
  const fetcher = (async (url, options) => {
    calls++; assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${token}`);
    assert.equal(new Headers(options?.headers).get("x-owner"), null); assert.equal(new Headers(options?.headers).get("cookie"), null);
    const value = { ...settings, id: "agent-1", owner: "owner", wallet: "wallet", privateKey: "SECRET", keyFile: "/private/secret", binding: { chainId: "31337", agentId: "0", wallet: "wallet", rpcUrl: "SECRET" } };
    if (String(url).endsWith("/runs")) { const command = JSON.parse(options!.body as string); return Response.json({ requestId: "run", agentId: "agent-1", action: command.action, ...(command.amountRaw ? { amountRaw: command.amountRaw } : {}), status: "Queued", result: { phase: "done", chargedRaw: "120000", rawTransaction: "SECRET" }, token: "SECRET" }, { status: 202 }); }
    if (options?.method === "GET") return Response.json({ agents: [value], runs: [], models: [{ id: "coder", label: "Coder", apiKey: "SECRET" }], token: "SECRET" });
    return Response.json(value, { status: 202 });
  }) as typeof fetch;
  for (const input of [request("/agents"), request("/agents", "POST", { ...settings, requestId: "id" }), request("/agents/agent-1", "PATCH", settings), request("/agents/agent-1/pause", "POST", { paused: true }), request("/agents/agent-1/runs", "POST", { action: "task", requestId: "run" }), request("/agents/agent-1/runs", "POST", { action: "deposit", requestId: "deposit", amountRaw: "40000" })]) {
    const response = await hostedAgentsRequest(input, { ...config, fetcher }); assert.ok(response.ok); const text = await response.text(); assert.doesNotMatch(text, /SECRET|privateKey|keyFile|rawTransaction|apiKey|rpcUrl|token/);
    if (JSON.parse(text).action === "deposit") assert.equal(JSON.parse(text).amountRaw, "40000");
  }
  assert.equal(calls, 6);
  const unauthorized = await hostedAgentsRequest(request("/agents"), { ...config, fetcher: (async () => Response.json({ error: "HOSTED_SESSION_EXPIRED", secret: "SECRET" }, { status: 401 })) as typeof fetch });
  assert.equal(unauthorized.status, 401); assert.match(unauthorized.headers.get("set-cookie")!, /Max-Age=0/); assert.deepEqual(await unauthorized.json(), { error: "HOSTED_SESSION_EXPIRED" });
  for (const fetcher of [(async () => { throw new Error("SECRET URL credential"); }), (async () => Response.json({ error: "SECRET" }, { status: 502 }))] as typeof fetch[]) {
    const response = await hostedAgentsRequest(request("/agents"), { ...config, fetcher }); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "HOSTED_UNAVAILABLE" });
  }
});
test("JSON input/output is bounded and redirects are refused without retries", async () => {
  let calls = 0;
  const fetcher = (async (_url, options) => { calls++; assert.equal(options?.redirect, "error"); assert.ok(options?.signal); return new Response("x".repeat(1048577)); }) as typeof fetch;
  const large = await hostedAgentsRequest(request("/agents", "POST", { ...settings, name: "x".repeat(8192) }), { ...config, fetcher });
  assert.equal(large.status, 413); assert.equal(calls, 0);
  const output = await hostedAgentsRequest(request("/agents"), { ...config, fetcher }); assert.equal(output.status, 413); assert.equal(calls, 1);
  const login = await hostedAgentsRequest(request("/auth/login", "POST", {}), { ...config, fetcher: (async () => Response.json({ token: "bad; cookie", expiresAt: Date.now() + 3600000 })) as typeof fetch });
  assert.equal(login.status, 503); assert.equal(login.headers.get("set-cookie"), null);
});
test("real HTTP redirect never receives a session bearer and is attempted only once", async () => {
  let targetCalls = 0, upstreamCalls = 0, authorization: string | undefined;
  const target = createServer((_request, response) => { targetCalls++; response.end("{}"); }); target.listen(0, "127.0.0.1"); await once(target, "listening");
  const location = `http://127.0.0.1:${(target.address() as any).port}/agents`;
  const upstream = createServer((request, response) => { upstreamCalls++; authorization = request.headers.authorization; response.writeHead(302, { location }); response.end(); });
  try {
    upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
    const response = await hostedAgentsRequest(request("/agents"), { origin, upstreamUrl: `http://127.0.0.1:${(upstream.address() as any).port}` });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "HOSTED_UNAVAILABLE" });
    assert.equal(authorization, `Bearer ${token}`); assert.equal(upstreamCalls, 1); assert.equal(targetCalls, 0);
  } finally {
    await Promise.all([upstream, target].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  }
});
