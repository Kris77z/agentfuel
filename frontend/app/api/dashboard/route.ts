import { dashboard } from "../../../lib/dashboard";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await dashboard(), { headers: { "Cache-Control": "no-store" } }); }
  catch {
    // Never send provider internals, RPC credentials or stack traces into the browser.
    return Response.json({ error: "READ_FAILED", message: "链上读取暂时失败，请检查部署清单、RPC 与 Underwriter 服务。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
