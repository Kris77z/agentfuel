import { amount } from "../../lib/format";
import { accountingReason } from "../../lib/hosted-accounting";
import type { useHostedAccounting } from "../../lib/use-hosted-accounting";
import shared from "./hosted.module.css";
import styles from "./finance.module.css";

const time = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });
const usdc = (raw: string) => `${amount(raw, 6)} USDC`;
export function AccountingPanel({ accounting }: { accounting: ReturnType<typeof useHostedAccounting> }) {
  const value = accounting.value, totals = value?.totals, coverage = value?.coverage;
  const confirmed = coverage ? Math.max(0, coverage.entryCount - coverage.pendingCount - coverage.incompleteCount) : 0;
  const checked = coverage?.entryCount ? `${confirmed}/${coverage.entryCount}（${Math.floor(confirmed * 100 / coverage.entryCount)}%）` : "暂无条目";
  const unresolved = coverage ? [...new Set(coverage.reasons.map(reason => accountingReason[reason] ?? "部分历史待核对"))] : [];
  return <section className={styles.panel} aria-label="经营账" data-testid="hosted-accounting">
    <div className={styles.accountingHeader}><h2>经营账</h2><button type="button" className={shared.textButton} disabled={accounting.loading} onClick={() => void accounting.refresh()} aria-label="刷新经营账">{accounting.loading ? "读取中…" : "刷新"}</button></div>
    {accounting.error ? <p role="status">经营账暂时无法读取。{value ? " 以下保留上次结果，金额尚未刷新。" : "收入、支出和经营净额均待核对。"}</p> : accounting.stale ? <p role="status">正在刷新，以下为上次结果。</p> : null}
    {value && totals && coverage ? <>
      <dl className={styles.accountingGrid}>
        <div><dt>已确认任务收入</dt><dd>{usdc(totals.taskRevenueRaw)}</dd></div>
        <div><dt>已确认推理支出</dt><dd>{usdc(totals.inferenceCostRaw)}</dd></div>
        <div><dt>已确认借款费</dt><dd>{usdc(totals.borrowingFeeRaw)}</dd></div>
        <div><dt>经营净额</dt><dd>{totals.netOperatingRaw === null ? "待核算" : usdc(totals.netOperatingRaw)}</dd></div>
      </dl>
      <p>任务收入已扣协议费，尚未扣推理支出和借款费。经营净额＝任务收入 − 推理支出 − 借款费；推理支出已扣退款，不再重复扣减。</p>
      {value.status === "partial" ? <p className={styles.accountingWarning} role="status">账目尚不完整，已确认金额只包含可核对记录。待确认部分未按 0 计入经营净额。{unresolved.length ? ` ${unresolved.join("；")}。` : ""}</p> : null}
      {BigInt(coverage.uncoveredSpentRaw) > 0n ? <p>累计支出中有 {usdc(coverage.uncoveredSpentRaw)} 缺少历史记录。</p> : null}
      <details className={styles.accountingDetails}><summary>补贴、资本与 token</summary>
        <dl className={shared.factList}>
          <div><dt>游戏 USDC 补贴</dt><dd>{usdc(totals.gameSubsidyRaw)}</dd></div>
          <div><dt>充值入账</dt><dd>{usdc(totals.ownerCapitalRaw)}</dd></div>
          <div><dt>启动资金</dt><dd>{usdc(totals.startupCapitalRaw)}</dd></div>
          <div><dt>借款本金流入</dt><dd>{usdc(totals.loanPrincipalRaw)}</dd></div>
          <div><dt>已确认退款</dt><dd>{usdc(totals.refundsRaw)}</dd></div>
          <div><dt>获赠 token</dt><dd>{totals.creditsGranted.toLocaleString("zh-CN")}</dd></div>
          <div><dt>推理使用 token（含付费及补贴）</dt><dd>{totals.creditsUsed.toLocaleString("zh-CN")}</dd></div>
        </dl>
        <p>补贴、充值、启动资金和借款本金不计经营收入。token 只计已记录数量；使用量含付费及补贴，不能与获赠数量相减作为补贴余额。MON Gas 未纳入，未折算成 USDC。</p>
      </details>
      <p className={styles.hint}>范围：保留的托管历史，非全钱包账本{coverage.since ? ` · 自 ${time(coverage.since)}` : ""}。依据已记录财务证据，非实时链上审计。<br/>已核对条目 {checked} · {coverage.runCount} 个请求 · {coverage.pendingCount} 条处理中 · {coverage.incompleteCount} 条待核对。<br/>{accounting.stale ? "上次结果" : "读取时间"}：{time(value.observedAt)}</p>
    </> : <p>{accounting.loading ? "正在读取本 Agent 的经营记录。" : "等待经营账；收入、支出和经营净额尚不可用。"}</p>}
  </section>;
}
