"use client";

import { useEffect, useState } from "react";
import type { LandingLocale } from "../landing/landing-locale";
import type { ProjectVideo } from "../../lib/project-videos";
import { TabbyLogo } from "../tabby-brand";
import styles from "./watch.module.css";

/** No remote player is mounted until requested. Native video fetches media only after play. */
export function VideoPlayer({ video, locale }: { video: ProjectVideo; locale: LandingLocale }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    return () => { document.documentElement.lang = previous; };
  }, [locale]);
  const title = `Tabby · ${video.title[locale]}`;
  if (video.source.kind === "mp4") return <div className={styles.player}>
    <video controls playsInline preload="none" poster="/brand/tabby/logo-horizontal-white.svg" aria-label={title}>
      <source src={video.source.url} type="video/mp4" />
      <a href={video.source.url}>{locale === "zh" ? "打开视频" : "Open video"}</a>
    </video>
  </div>;
  if (video.source.kind === "youtube" && loaded) return <div className={styles.player}>
    <iframe src={`https://www.youtube-nocookie.com/embed/${video.source.videoId}?autoplay=0&rel=0&playsinline=1`} title={title}
      loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
  </div>;
  return <div className={`${styles.player} ${styles.playerCover}`}>
    <TabbyLogo tone="white" className={styles.playerLogo} />
    <button type="button" className={styles.loadButton} onClick={() => setLoaded(true)}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>
      <span>{locale === "zh" ? "加载视频播放器" : "Load video player"}</span>
    </button>
  </div>;
}
