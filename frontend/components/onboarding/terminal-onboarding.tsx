"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useHostedAgents } from "../../lib/hosted-agents-provider";
import { validateAgentSettings, type AgentSettingsDraft } from "../../lib/agent-settings";
import { inputUsdc, strategyLabel, usdcRaw, type AgentSettings } from "../../lib/hosted-client";
import { TerminalHeader } from "../terminal/terminal-header";
import styles from "./onboarding.module.css";

type Line = { text: string; style: "cmd" | "out" | "ok" | "dim" | "accent" };
const bannerRow = (text: string) => `║${text.padStart(Math.floor((32 + text.length) / 2), " ").padEnd(32, " ")}║`;
const boot: Line[] = [
  { text: "$ agentfuel init --hosted", style: "cmd" },
  { text: "", style: "out" },
  { text: [`╔${"═".repeat(32)}╗`, bannerRow("A G E N T F U E L"), bannerRow("Hosted Agent Terminal"), `╚${"═".repeat(32)}╝`].join("\n"), style: "accent" },
  { text: "", style: "out" },
  { text: "target: 你的钱包 → 独立托管 Agent", style: "dim" },
  { text: "钱包签名登录 / 六项运行配置 / 确认创建", style: "out" },
];
const labels = ["名称", "模型", "策略", "单次推理预算（USDC）", "累计推理预算（USDC）", "允许任务授信"];
const keys = ["name", "model", "strategy", "per-run-budget", "total-budget", "allow-credit"];

/** Port of Agora Mesh's terminal-onboarding: boot transcript, typewriter, one
 * command prompt at a time, review and launch. All facts come from the hosted API. */
export function TerminalOnboarding() {
  const state = useHostedAgents(), router = useRouter();
  const [phase, setPhase] = useState<"boot" | "auth" | "config" | "review">("boot");
  const [step, setStep] = useState(0), [input, setInput] = useState("");
  const [draft, setDraft] = useState<AgentSettingsDraft>({ name: "", modelId: "", strategy: "balanced", perRun: "0.12", total: "1", allowCredit: false });
  const [review, setReview] = useState<AgentSettings | null>(null), [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>(boot), [typed, setTyped] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null), mounted = useRef(true);
  const models = state.snapshot?.models ?? [], authenticated = state.access === "authenticated" && !!state.owner;
  const blocked = state.busy || !!state.pending || !authenticated || !models.length;
  const pendingCreate = state.pending?.kind === "create" ? state.pending : null;
  const identity = authenticated ? state.owner!.toLowerCase() : null, previousIdentity = useRef(identity);
  const allText = lines.map(line => line.text).join("\n"), typing = typed < allText.length;
  useEffect(() => { mounted.current = true; setReducedMotion(matchMedia("(prefers-reduced-motion: reduce)").matches); return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (previousIdentity.current && previousIdentity.current !== identity) {
      setDraft({ name: "", modelId: "", strategy: "balanced", perRun: "0.12", total: "1", allowCredit: false });
      setReview(null); setInput(""); setStep(0); setError(""); setLines(boot); setTyped(0); setPhase("auth");
    }
    previousIdentity.current = identity;
  }, [identity]);
  useEffect(() => {
    if (reducedMotion) { setTyped(allText.length); return; }
    if (!typing) return;
    const timer = setTimeout(() => setTyped(value => Math.min(allText.length, value + 8)), 12);
    return () => clearTimeout(timer);
  }, [allText.length, typed, typing, reducedMotion]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [typed, phase, step, state.error, state.pending]);
  useEffect(() => { if (!typing && phase === "config") inputRef.current?.focus(); }, [typing, phase, step]);
  useEffect(() => {
    if (phase === "auth" && authenticated && !state.pending && models.length) {
      setLines(current => [...current, { text: `✓ owner ${state.owner}\n✓ 平台模型目录已读取：${models.length} 项\n\n$ agent configure`, style: "ok" }]);
      setDraft(current => ({ ...current, modelId: current.modelId || models[0].id }));
      setPhase("config");
    }
  }, [phase, authenticated, state.owner, state.pending, models]);
  const append = (text: string, style: Line["style"] = "cmd") => setLines(current => [...current, { text, style }]);
  function start() { append("\n$ wallet sign-in\n个人消息签名只用于平台登录，不发送链上交易。", "out"); setPhase("auth"); }
  async function login() { setError(""); await state.login(); }
  function next(event: FormEvent) {
    event.preventDefault(); if (blocked) return; setError("");
    try {
      let value = input.trim();
      const nextDraft = { ...draft };
      if (step === 0) { if (!value || value.length > 80 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("名称须为 1–80 个字符。"); nextDraft.name = value; }
      if (step === 1) { value = draft.modelId; if (!models.some(model => model.id === value)) throw new Error("请选择平台提供的模型。"); }
      if (step === 2) value = strategyLabel[draft.strategy];
      if (step === 3) { usdcRaw(value); nextDraft.perRun = value; }
      if (step === 4) { if (BigInt(usdcRaw(value)) < BigInt(usdcRaw(draft.perRun))) throw new Error("累计预算不能小于单次预算。"); nextDraft.total = value; }
      if (step === 5) value = draft.allowCredit ? "允许申请" : "关闭";
      setDraft(nextDraft); append(`$ agent set --${keys[step]} ${value}`);
      if (step === 5) {
        setReview(validateAgentSettings(nextDraft, models)); setPhase("review"); append("\n$ agent create --review\n请核对下方参数；确认后由平台生成独立钱包并初始化链上身份。", "out");
      } else { setStep(step + 1); setInput(step === 2 ? draft.perRun : step === 3 ? draft.total : ""); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "设置无效。"); }
  }
  async function create() {
    if (!review || blocked) return;
    append("\n$ agent create --confirm\n等待服务器确认；请求 ID 和原参数已由托管客户端保存。", "out");
    if (await state.create(review) && mounted.current) router.push("/dashboard");
  }
  async function recover() {
    if (await state.retryPending() && mounted.current) router.push("/dashboard");
  }
  function edit() { setPhase("config"); setStep(0); setInput(draft.name); setError(""); append("\n$ agent configure --edit"); }
  const effectiveReview = pendingCreate?.input ?? review;
  let offset = 0;
  const status = state.access === "loading" ? "CONNECTING" : state.access === "unavailable" ? "UNAVAILABLE" : authenticated ? state.busy ? "WAITING" : "AUTHENTICATED" : "SIGN IN REQUIRED";
  return <div className={styles.shell} data-testid="onboarding-terminal-shell">
    <TerminalHeader workspace="onboarding" title="创建你的 Agent" testId="onboarding-terminal-header" status={status} actions={<Link className={styles.headerLink} href="/dashboard">进入工作台 →</Link>} />
    <main ref={scrollRef} className={styles.terminal} aria-label="Agent 创建终端">
      <div className={styles.transcript} data-testid="onboarding-transcript" aria-hidden={typing ? true : undefined}>{lines.map((line, index) => {
        const text = line.text.slice(0, Math.max(0, typed - offset)); offset += line.text.length + 1;
        return <div key={index} className={styles[line.style]}>{text || "\u00a0"}</div>;
      })}{typing && <span className={styles.cursor} aria-hidden="true">▋</span>}</div>
      {!typing && phase === "boot" && !state.pending && <div className={styles.prompt}><span>按 Enter 开始创建你的 Agent</span><button autoFocus onClick={start}>开始创建 ↵</button></div>}
      {!typing && (phase === "auth" || !authenticated && phase !== "boot") && <div className={styles.prompt}>
        <p>› wallet sign-in <span className={styles.dim}>连接你的钱包，签署平台登录消息。</span></p>
        <button onClick={() => void login()} disabled={state.busy || state.access === "loading" || state.access === "unavailable"}>{state.busy ? "等待钱包…" : "签名登录"}</button>
        {state.access === "unavailable" && <button disabled={state.refreshing || state.busy} onClick={() => void state.refresh()}>重新读取平台状态</button>}
        {authenticated && !models.length && <p role="status">平台模型目录尚不可用，无法配置或创建。</p>}
      </div>}
      {!typing && phase === "config" && authenticated && !state.pending && <form className={styles.commandForm} onSubmit={next}>
        <p className={styles.dim}>配置 {String(step + 1).padStart(2, "0")} / 06</p>
        <label htmlFor="terminal-value">› {labels[step]} <span className={styles.cursor} aria-hidden="true">▋</span></label>
        {step === 1 ? <select id="terminal-value" aria-label={labels[step]} ref={element => { inputRef.current = element; }} value={draft.modelId} disabled={blocked} onChange={event => setDraft({ ...draft, modelId: event.target.value })}>{models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
          : step === 2 ? <select id="terminal-value" aria-label={labels[step]} ref={element => { inputRef.current = element; }} value={draft.strategy} disabled={blocked} onChange={event => setDraft({ ...draft, strategy: event.target.value as AgentSettings["strategy"] })}>{Object.entries(strategyLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          : step === 5 ? <select id="terminal-value" aria-label={labels[step]} ref={element => { inputRef.current = element; }} value={draft.allowCredit ? "yes" : "no"} disabled={blocked} onChange={event => setDraft({ ...draft, allowCredit: event.target.value === "yes" })}><option value="no">关闭</option><option value="yes">允许申请</option></select>
          : <input id="terminal-value" aria-label={labels[step]} ref={element => { inputRef.current = element; }} value={input} maxLength={step === 0 ? 80 : undefined} inputMode={step >= 3 ? "decimal" : "text"} required disabled={blocked} autoComplete="off" onChange={event => setInput(event.target.value)} />}
        {step === 5 && <p className={styles.dim}>任务授信须经平台核验。推理预算与 cash、gas、借款手续费分别记录。</p>}
        <button type="submit" disabled={blocked}>{step === 5 ? "检查配置 ↵" : "下一项 ↵"}</button>
      </form>}
      {!typing && effectiveReview && authenticated && (phase === "review" || !!pendingCreate) && <section className={styles.review} aria-label="确认 Agent 配置">
        <p className={styles.accent}>{pendingCreate ? "原请求等待确认 · 已保存原参数" : "review / 确认运行配置"}</p>
        <dl><div><dt>名称</dt><dd>{effectiveReview.name}</dd></div><div><dt>模型</dt><dd>{models.find(model => model.id === effectiveReview.modelId)?.label ?? effectiveReview.modelId}</dd></div><div><dt>策略</dt><dd>{strategyLabel[effectiveReview.strategy]}</dd></div><div><dt>单次推理预算</dt><dd>{inputUsdc(effectiveReview.perRunBudgetRaw)} USDC</dd></div><div><dt>累计推理预算</dt><dd>{inputUsdc(effectiveReview.totalBudgetRaw)} USDC</dd></div><div><dt>任务授信</dt><dd>{effectiveReview.allowCredit ? "允许申请" : "关闭"}</dd></div></dl>
        {pendingCreate ? <><code className={styles.requestId}>{pendingCreate.input.requestId}</code><button disabled={state.busy} onClick={() => void recover()}>继续确认原请求</button></> : <div className={styles.reviewActions}><button disabled={state.busy} onClick={edit}>返回编辑</button><button disabled={blocked} onClick={() => void create()}>{state.busy ? "等待服务器…" : "确认创建"}</button></div>}
      </section>}
      {state.pending?.kind === "run" && authenticated && <p role="status">已有未确认的操作。请先<Link href="/dashboard">进入工作台</Link>，查看或恢复原请求。</p>}
      {error && <p className={styles.error} role="alert">✗ {error}</p>}
      {state.error && <p className={styles.error} role="alert">✗ {state.error}</p>}
      {state.access === "unavailable" && phase === "boot" && <p className={styles.dim}>平台服务尚不可用；连接恢复前无法登录或创建 Agent。</p>}
    </main>
    <footer className={styles.footer}><span>agentfuel@onboarding:~$</span><span>{status}</span><span>模型目录 {state.snapshot ? models.length : "未读取"}</span></footer>
  </div>;
}
