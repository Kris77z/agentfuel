"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dashboard } from "../lib/types";
import { short } from "../lib/format";
import { explainError } from "../lib/errors";
import { connectWallet, type WalletSession } from "../lib/wallet";
import { ProfileView } from "./profile";
import { DemoPanel } from "./demo-panel";
import { Icon, Mark } from "./icons";

export default function DashboardApp({ initial, arenaTimeoutMs = 15_000 }: { initial: Dashboard; arenaTimeoutMs?: number }) {
  const [data, setData] = useState(initial), [selected, setSelected] = useState(initial.profiles[0]?.agent.id || "");
  const [tab, setTab] = useState<"profile" | "demo">("profile"), [task, setTask] = useState("");
  const [wallet, setWallet] = useState<WalletSession | null>(null), [walletError, setWalletError] = useState("");
  const [operationBusy, setOperationBusy] = useState(false);
  const [readError, setReadError] = useState(""), [refreshing, setRefreshing] = useState(false), [connecting, setConnecting] = useState(false);
  const refreshInFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.message || "读取失败。");
      setData(next);
      setSelected(id => next.profiles.some((p: { agent: { id: string } }) => p.agent.id === id) ? id : next.profiles[0]?.agent.id || "");
      setReadError("");
    } catch (error) { setReadError(explainError(error).message); }
    finally { refreshInFlight.current = false; setRefreshing(false); }
  }, []);
  useEffect(() => {
    if (!data.configured || data.mode !== "chain") return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20_000);
    return () => clearInterval(timer);
  }, [data.configured, data.mode, refresh]);
  useEffect(() => {
    if (!wallet) return;
    const changed = () => { setWallet(null); setWalletError("钱包账号或网络已变化，请重新连接。"); };
    wallet.injected.on?.("accountsChanged", changed); wallet.injected.on?.("chainChanged", changed);
    return () => { wallet.injected.removeListener?.("accountsChanged", changed); wallet.injected.removeListener?.("chainChanged", changed); };
  }, [wallet]);
  const profile = data.profiles.find(p => p.agent.id === selected) || data.profiles[0];
  const config = data.config;
  async function connect() {
    if (!config || data.mode === "fixture") return;
    setConnecting(true); setWalletError("");
    try { setWallet(await connectWallet(config)); } catch (error) { setWalletError(explainError(error).message); }
    finally { setConnecting(false); }
  }
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="/"><Mark small /><span>InferCredit</span></a><div className="sidebar-caption">REPUTATION YOU CAN SPEND.</div>
    <nav className="primary-nav" aria-label="主导航"><button disabled={operationBusy} className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><Icon name="identity" />信用档案<span>01</span></button><button disabled={operationBusy} className={tab === "demo" ? "active" : ""} onClick={() => setTab("demo")}><Icon name="routing" />演示面板<span>02</span></button><a className="nav-link" href="/arena"><Icon name="routing" />游戏 Arena<span>03</span></a></nav>
    <div className="agents-heading"><span>AGENT DIRECTORY</span><span>{data.profiles.length.toString().padStart(2, "0")}</span></div><div className="agent-directory">{data.profiles.map(p => <button className={`agent-option${p.agent.id === selected ? " selected" : ""}`} key={p.agent.id} disabled={operationBusy} onClick={() => { setSelected(p.agent.id); setTask(""); }}><span className={`mini-avatar tier-${p.credit.terms.tier.toLowerCase()}`}>{p.agent.name.charAt(0)}</span><span className="agent-option-text"><strong>{p.agent.name.split(" · ")[0]}</strong><small>#{p.agent.id} · Score {p.credit.terms.score}</small></span><span className={`directory-tier tier-${p.credit.terms.tier.toLowerCase()}`}>{p.credit.terms.tier}</span></button>)}</div>
    <div className="sidebar-footer"><div className="sidebar-network"><span className="dot" />{data.mode === "fixture" ? "本地视觉演示" : config?.network || "网络未配置"}</div><p>Agent × Task<br />Compute underwriting</p><div className="sidebar-bottom">ERC-8004 <span>↗ Monad</span></div></div>
  </aside><div className="main-shell"><header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>{tab === "profile" ? "Financial identity" : "Live demo"}</strong></div><div className="topbar-actions"><button className="refresh-button" onClick={() => void refresh()} disabled={refreshing} aria-label="刷新链上数据"><Icon name="refresh" size={16} /><span>{refreshing ? "读取中" : "刷新"}</span></button><button className="wallet-button" onClick={() => wallet ? setWallet(null) : void connect()} disabled={!data.configured || data.mode === "fixture" || connecting || operationBusy}><Icon name="wallet" size={16} />{wallet ? short(wallet.address, 4) : connecting ? "连接中…" : "连接钱包"}</button></div></header>
    <main id="main-content">
      {data.mode === "fixture" ? <div className="fixture-banner"><span className="tag warning">本地演示 · FIXTURE</span><span>合成数据用于视觉验收。地址、余额与交易均为示例，钱包广播已关闭。</span></div> : null}
      {readError ? <div className="read-error" role="alert">{readError} {data.configured ? "下方保留上次成功快照。" : ""}</div> : null}
      {walletError ? <div className="read-error" role="alert">{walletError}</div> : null}
      {profile && config ? <>{tab === "profile" ? <ProfileView profile={profile} config={config} onTask={id => { setTask(id); setTab("demo"); }} /> : <DemoPanel key={`${config.chainId}:${config.contracts.account}:${profile.agent.id}`} onBusyChange={setOperationBusy} profile={profile} config={config} openTasks={data.openTasks} taskId={task} onTask={setTask} wallet={wallet} fixture={data.mode === "fixture"} refresh={refresh} arenaTimeoutMs={arenaTimeoutMs} />}
        <footer className="data-footer"><span><span className="dot" />{readError ? "保留快照" : data.mode === "fixture" ? "Fixture snapshot" : "链上快照"} · Block {profile.credit.block.number.toLocaleString("en-US")} · {short(profile.credit.block.hash, 4)}</span><span>{data.history ? `近期资金流（最多 2000 块）${data.history.fromBlock}–${data.history.toBlock} · 余额、债务按完整账本读取 · ` : ""}每 20 秒尝试刷新 · 读取中不重复请求</span></footer></> : <div className="unconfigured"><Mark /><span className="eyebrow">AGENT FINANCIAL IDENTITY</span><h1>信用档案，等待链上身份。</h1><p>{data.message || "尚未配置真实部署。"}</p><div className="config-instructions"><strong>连接真实部署</strong><p>1. 在部署清单填入四合约、资产与至少 3 个 Agent IDs。</p><p>2. 配置 <code>FRONTEND_MANIFEST_PATH</code>，启动 Underwriter。</p><p>3. 重启前端后刷新，读取真实余额与交易证据。</p></div><span className="unconfigured-note">当前没有已验证的网络数字。视觉验收可显式运行 npm run dev:fixture。</span></div>}
    </main>
  </div></div>;
}
