import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { landingLocale } from "../../components/landing/landing-locale";
import { TabbyLogo } from "../../components/tabby-brand";
import { VideoPlayer } from "../../components/watch/video-player";
import { projectVideoHref, projectVideos } from "../../lib/project-videos";
import styles from "../../components/watch/watch.module.css";

const sans = localFont({ src: "../../components/landing/fonts/InterVariable.woff2", variable: "--watch-sans", weight: "100 900", display: "swap", adjustFontFallback: false });
const mono = localFont({ src: "../../components/hosted/fonts/GeistMono-Variable.woff2", variable: "--watch-mono", weight: "100 900", display: "swap", adjustFontFallback: false });
type Props = { searchParams: Promise<{ lang?: string | string[]; video?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = landingLocale((await searchParams).lang);
  return locale === "zh" ? { title: "观看 Tabby · 项目短片与技术演示", description: "观看 Tabby 的 49 秒项目短片与 111 秒技术演示。" }
    : { title: "Watch Tabby · Pitch & technical demo", description: "Watch Tabby’s 49-second pitch and 111-second technical demo." };
}

export default async function WatchPage({ searchParams }: Props) {
  const query = await searchParams, locale = landingLocale(query.lang), zh = locale === "zh";
  const selected = projectVideos.find(video => video.id === query.video) ?? projectVideos[0];
  const source = selected.source;
  const youtubeUrl = selected.youtubeUrl ?? (source?.kind === "youtube" ? `https://www.youtube.com/watch?v=${source.videoId}` : undefined);
  return <div className={`${styles.watch} ${sans.variable} ${mono.variable}`} lang={zh ? "zh-CN" : "en"}>
    <header className={styles.header}>
      <Link href={`/?lang=${locale}`} className={styles.brand} aria-label={zh ? "Tabby 首页" : "Tabby home"}><TabbyLogo /></Link>
      <div className={styles.navigation}>
        <nav className={styles.languages} aria-label={zh ? "语言" : "Language"}>
          <Link href={projectVideoHref(selected.id, "en")} hrefLang="en" lang="en" aria-current={!zh ? "page" : undefined} prefetch={false}>EN</Link><span aria-hidden="true">/</span>
          <Link href={projectVideoHref(selected.id, "zh")} hrefLang="zh-CN" lang="zh-CN" aria-current={zh ? "page" : undefined} prefetch={false}>中文</Link>
        </nav>
        <Link href="/dashboard" className={styles.workspace}>{zh ? "进入工作台 ↗" : "WORKSPACE ↗"}</Link>
      </div>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}>
        <div><span className={styles.eyebrow}><span>02</span><b>{zh ? "项目视频" : "TWO FILMS"}</b></span></div>
        <div className={styles.heading}><h1>{zh ? "观看 Tabby。" : "Watch Tabby."}</h1><p>{zh ? "先看项目短片，再看技术演示。" : "Start with the pitch. Then watch the technical demo."}</p></div>
      </div>
      <section aria-label={zh ? "视频播放器" : "Video player"}>
        <div className={styles.viewer}>
          <VideoPlayer key={selected.id} video={selected} locale={locale} />
          <div className={styles.caption}>
            <div className={styles.captionTitle}>{selected.title[locale]}<span>{selected.durationSeconds}{zh ? " 秒" : " SEC"}</span></div>
            <div className={styles.externalLinks}>
              {source?.kind === "mp4" ? <a href={source.url} target="_blank" rel="noopener noreferrer">{zh ? "打开原视频 ↗" : "Open video ↗"}</a> : null}
              {youtubeUrl ? <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">{zh ? "在 YouTube 观看 ↗" : "Watch on YouTube ↗"}</a> : null}
            </div>
          </div>
        </div>
        <nav className={styles.clips} aria-label={zh ? "选择视频" : "Choose a video"}>
          {projectVideos.map((video, index) => <Link key={video.id} href={projectVideoHref(video.id, locale)} className={styles.clip} aria-current={selected.id === video.id ? "page" : undefined} scroll={false} prefetch={false}>
            <span className={styles.clipNumber}>0{index + 1}</span><div><h2>{video.title[locale]}</h2><p>{video.description[locale]}</p></div><span className={styles.duration}>{video.durationSeconds}{zh ? " 秒" : " SEC"}</span>
          </Link>)}
        </nav>
      </section>
      <footer className={styles.footer}><Link href={`/?lang=${locale}`}>{zh ? "← 返回产品介绍" : "← Back to the product"}</Link><span>TABBY / INFERCREDIT</span></footer>
    </main>
  </div>;
}
