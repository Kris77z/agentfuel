import type { LandingLocale } from "../components/landing/landing-locale";

export type ProjectVideoId = "pitch" | "technical-demo";
export interface ProjectVideo {
  id: ProjectVideoId;
  durationSeconds: number;
  title: Record<LandingLocale, string>;
  description: Record<LandingLocale, string>;
  source: { kind: "mp4"; url: string } | { kind: "youtube"; videoId: string };
  youtubeUrl?: string;
}

/** Published clips only; supplier links remain separate from product and evidence APIs. */
export const projectVideos: readonly ProjectVideo[] = [
  {
    id: "pitch", durationSeconds: 49,
    title: { en: "Pitch", zh: "项目短片" },
    description: { en: "Start here: the idea in 49 seconds.", zh: "从这里开始：49 秒了解项目。" },
    source: { kind: "youtube", videoId: "pOUE6yWpGg4" },
    youtubeUrl: "https://youtu.be/pOUE6yWpGg4",
  },
  {
    id: "technical-demo", durationSeconds: 111,
    title: { en: "Technical demo", zh: "技术演示" },
    description: { en: "Take a closer look in 1 minute 51 seconds.", zh: "用 1 分 51 秒进一步了解。" },
    source: { kind: "youtube", videoId: "Hgs1R7LrMZU" },
    youtubeUrl: "https://youtu.be/Hgs1R7LrMZU",
  },
];

export function projectVideoHref(id: ProjectVideoId, locale: LandingLocale) {
  return `/watch?lang=${locale}&video=${id}`;
}
