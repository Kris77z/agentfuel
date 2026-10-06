import { dashboard } from "../lib/dashboard";
import DashboardApp from "../components/dashboard-app";
import type { Dashboard } from "../lib/types";
import { frontendTransport } from "../lib/server-transport";
export const dynamic = "force-dynamic";
export default async function Page() {
  let initial: Dashboard;
  let arenaTimeoutMs = 15_000;
  try { arenaTimeoutMs = frontendTransport().arenaTimeoutMs; initial = await dashboard(); }
  catch {
    initial = { mode: "chain", configured: false, profiles: [], openTasks: [], updatedAt: new Date().toISOString(),
      message: "部署数据暂时无法读取。请检查 FRONTEND_MANIFEST_PATH、RPC 与 Underwriter，或稍后重试。" };
  }
  return <DashboardApp initial={initial} arenaTimeoutMs={arenaTimeoutMs} />;
}
