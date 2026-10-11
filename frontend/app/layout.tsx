import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AgentFuel · 托管 Agent 工作台", description: "创建平台托管 Agent，配置模型、策略与预算，运行任务赚取收入，参加免费德州赢赞助 USDC 或 LLM credits。" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
