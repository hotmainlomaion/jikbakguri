"use client";
import { gradientFor, formatCount } from "./ui";
import { IcEye, IcChatBubble } from "./icons";

export type CardBot = {
  id: string;
  name: string;
  quote: string;
  tags: string[];
  views: number;
  comments: number;
  isNew: boolean;
  scenarioCount: number;
};

export function CharacterCard({
  bot,
  onSelect,
  width = 176,
}: {
  bot: CardBot;
  onSelect: (b: CardBot) => void;
  width?: number;
}) {
  return (
    <button
      onClick={() => onSelect(bot)}
      style={{ width }}
      className="group shrink-0 text-left"
    >
      <div
        className="relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-white/5 transition-transform group-hover:-translate-y-1"
        style={{ background: gradientFor(bot.name) }}
      >
        {bot.isNew && (
          <span className="pill absolute left-2 top-2 z-10 bg-badgePink">NEW</span>
        )}
        {bot.tags[0] && (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur">
            #{bot.tags[0]}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center text-6xl font-black text-white/15">
          {bot.name.slice(0, 1)}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="truncate text-[15px] font-bold text-white">{bot.name}</h3>
          <p className="truncate text-[12px] text-white/70">“{bot.quote}”</p>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3 px-0.5 text-[11px] text-subtle">
        <span className="flex items-center gap-1">
          <IcEye className="h-3.5 w-3.5" /> {formatCount(bot.views)}
        </span>
        <span className="flex items-center gap-1">
          <IcChatBubble className="h-3.5 w-3.5" /> {formatCount(bot.comments)}
        </span>
      </div>
    </button>
  );
}

// 행을 채우는 잠금 플레이스홀더(준비 중). 클릭 불가 — 실제 캐릭터 아님.
export function LockedCard({ seed, width = 176 }: { seed: string; width?: number }) {
  return (
    <div style={{ width }} className="shrink-0">
      <div
        className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/5"
        style={{ background: gradientFor(seed) }}
      >
        <span className="absolute inset-0 bg-black/40" />
        <div className="relative flex flex-col items-center gap-1 text-white/50">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span className="text-[11px]">준비 중</span>
        </div>
      </div>
      <div className="mt-1.5 h-3" />
    </div>
  );
}
