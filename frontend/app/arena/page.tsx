import { TerminalTheme } from "../../components/terminal/terminal-theme";
import type { Metadata } from "next";
import ArenaPlay from "../../components/arena-play";
import type { PlayGame, PlayMode } from "../../lib/play-types";
import { loadHoldemSnapshot } from "../../lib/holdem-report";
import "./holdem/holdem.css";
import "./arena-play.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "GameFi · Tabby", description: "真实模型德州对局、USDC 赞助奖励与推理消费证据，以及四种游戏的免费练习。" };
export default async function ArenaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, holdem] = await Promise.all([searchParams, loadHoldemSnapshot()]);
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const selected = value("game");
  const game: PlayGame | null = selected === "poker" || selected === "holdem" ? "holdem" : ["gomoku", "chess", "balatro"].includes(selected) ? selected as PlayGame : null;
  const mode: PlayMode = value("mode") === "practice" || value("mode") === "invite" ? "invite" : "challenge";
  return <TerminalTheme><ArenaPlay initialGame={game} initialMode={mode} initialMatchId={value("matchId")} initialInviteCode={value("inviteCode")} ranked={value("mode") === "ranked"} holdem={holdem} /></TerminalTheme>;
}
