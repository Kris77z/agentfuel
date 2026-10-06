import "server-only";
import { loadDeployment } from "./config";
import { readDashboard } from "./read";
import type { Dashboard } from "./types";

export async function dashboard(): Promise<Dashboard> {
  if (process.env.FRONTEND_MODE === "fixture") {
    const { fixtureDashboard } = await import("./fixture");
    return fixtureDashboard();
  }
  if (process.env.FRONTEND_MODE && process.env.FRONTEND_MODE !== "chain") throw new Error("FRONTEND_MODE 只能是 chain 或 fixture。");
  const config = await loadDeployment();
  if (!config) return { mode: "chain", configured: false,
    message: "尚未配置部署清单。填写 FRONTEND_MANIFEST_PATH 后，这里会读取真实合约与 Underwriter 信用资料。",
    profiles: [], openTasks: [], updatedAt: new Date().toISOString() };
  return readDashboard(config);
}
