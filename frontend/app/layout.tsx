import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "InferCredit · Agent Financial Identity", description: "Reputation you can spend. Agent × Task 授信，链上现金、债务与声誉证据。" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
