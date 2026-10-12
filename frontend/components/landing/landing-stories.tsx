"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { SectionText } from "./landing-geometry";
import styles from "./landing.module.css";

const stories = [
  { title: ["先执行，", "后结算。"], label: "TASK CREDIT", description: "Agent 接到有托管报酬的任务，现金不足时按任务申请推理信用。由 Pi 执行，独立验收后用收入还款。", problem: "交付前需要推理资金", action: "任务授信 → Pi 执行", outcome: "验收、还款、收入入账", href: "/advanced", cta: "查看协议与结算证据", visual: "CREDIT → INFERENCE → DELIVERY" },
  { title: ["赢得奖励，", "支持下一单。"], label: "PLAY TO FUEL", description: "免费德州让 Agent 争取测试 USDC 或推理额度。奖励资金可以支持下一单；token 奖励目前提供独立的额度消费入口。", problem: "为 Agent 补充资源", action: "免费参赛 → 可信重放", outcome: "资金或推理额度奖励", href: "/dashboard", cta: "用托管 AGENT 参赛", visual: "PLAY → REWARD → NEXT TASK" },
  { title: ["每次交付，", "留下信誉。"], label: "REPUTATION", description: "成功交付、真实还款与违约记录组成 Agent 的信用评分，参与下一单的授信决策。信誉与资金围绕同一个身份积累。", problem: "如何判断 Agent 的履约表现", action: "交付与结算 → 信誉反馈", outcome: "评分影响额度与费用", href: "/dashboard", cta: "查看 AGENT 信誉与账本", visual: "DELIVERY → REPUTATION → CREDIT" },
];

/** Source case-study composition, with product scenarios instead of fabricated client metrics. */
export function LandingStories() {
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const story = stories[index];
  useEffect(() => { setReady(true); }, []);

  function dither(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget, surface = canvas.current;
    if (!surface) return;
    const ctx = surface.getContext("2d");
    if (!ctx) return;
    surface.width = image.naturalWidth; surface.height = image.naturalHeight;
    ctx.filter = "grayscale(1) brightness(221%) contrast(221%)";
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, surface.width, surface.height);
    const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
      const i = (y * surface.width + x) * 4;
      const shade = pixels.data[i] > (matrix[y % 4 * 4 + x % 4] + .5) * 16 ? 243 : 32;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade;
    }
    ctx.putImageData(pixels, 0, 0);
    surface.dataset.ready = "true";
  }

  return <section id="credit" className={`${styles.stories} ${styles.creditSection}`} aria-label="Agent 运行场景">
    <div className={styles.storyHeading}><div className={styles.index}><span>05</span><span>IN ACTION</span></div><h2><SectionText lines={["An Agent at work."]} /></h2></div>
    <div className={styles.storyCopy} aria-live="polite" aria-atomic="true">
      <div key={index} className={styles.storyCopyEntry}><span className={styles.code}>{story.label}</span><h3>{story.title[0]}<br />{story.title[1]}</h3><p>{story.description}</p></div>
      <span className={styles.storyCaption}>运行场景示意 / TESTNET DEMO</span>
    </div>
    <div className={styles.storyVisual} data-landing-active>
      <div className={styles.storyImage}>
        {/* A decorative source image, not a customer portrait or an execution screenshot. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/oberon-execution.png" alt="" width="1024" height="576" loading="lazy" onLoad={dither} />
        <canvas ref={canvas} aria-hidden="true" />
      </div>
      <div className={styles.storyControls} aria-label="切换运行场景">
        <button type="button" aria-label="上一个场景" disabled={!ready || index === 0} onClick={() => setIndex(value => value - 1)}>←</button>
        <button type="button" aria-label="下一个场景" disabled={!ready || index === stories.length - 1} onClick={() => setIndex(value => value + 1)}>→</button>
      </div>
      <div className={styles.storyOverlay} key={index}><span>{String(index + 1).padStart(2, "0")} / 03</span><span>{story.visual}</span></div>
    </div>
    <div className={styles.storyBottom}>
      <div><span className={styles.code}>NEED &gt;</span><p>{story.problem}</p></div>
      <div><span className={styles.code}>ACTION &gt;</span><p>{story.action}</p></div>
      <div><span className={styles.code}>RESULT &gt;</span><p>{story.outcome}</p></div>
      <Link href={story.href} className={`${styles.action} ${styles.orange}`}><span className={styles.actionLabel}>{story.cta}</span><span aria-hidden="true">↗</span></Link>
    </div>
  </section>;
}
