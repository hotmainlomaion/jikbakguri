"use client";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NavSidebar } from "@/components/nav-sidebar";
import { CharacterCard, LockedCard, type CardBot } from "@/components/character-card";
import { gradientFor } from "@/components/ui";
import { IcSearch, IcCoin, IcChart } from "@/components/icons";

export type GalleryBot = CardBot & {
  characterAge: number;
  likes: number;
  rankScore: number;
  scenarios: { id: string; title: string; description: string }[];
};

const ROW_LEN = 6;

export function GalleryClient({ bots }: { bots: GalleryBot[] }) {
  const router = useRouter();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [picker, setPicker] = useState<GalleryBot | null>(null);
  const [loading, setLoading] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    bots.forEach((b) => b.tags.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [bots]);

  const filtered = activeTag ? bots.filter((b) => b.tags.includes(activeTag)) : bots;
  const popular = [...filtered].sort((a, b) => b.views - a.views);
  const fresh = [...filtered].sort((a, b) => Number(b.isNew) - Number(a.isNew));
  const trend = [...filtered].sort((a, b) => b.rankScore - a.rankScore);
  const ranking = [...bots]
    .sort((a, b) => b.rankScore - a.rankScore)
    .map((b) => ({ id: b.id, name: b.name, tag: b.tags[0] ?? "", score: b.rankScore }));

  const byId = new Map(bots.map((b) => [b.id, b]));
  async function start(botId: string, scenarioId?: string) {
    setLoading(true);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botProfileId: botId, scenarioId }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/chat/${data.sessionId}`);
    else setLoading(false);
  }
  function onSelect(b: CardBot) {
    const full = byId.get(b.id)!;
    if (full.scenarios.length > 1) setPicker(full);
    else start(full.id, full.scenarios[0]?.id);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <NavSidebar ranking={ranking} />

      <main className="flex-1 overflow-y-auto">
        {/* 상단바 */}
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-bg/90 px-6 py-3 backdrop-blur">
          <div className="relative mx-auto flex w-full max-w-xl items-center">
            <IcSearch className="pointer-events-none absolute left-3 h-4 w-4 text-subtle" />
            <input
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-14 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
              placeholder="캐릭터, 태그, 작품 검색..."
            />
            <kbd className="absolute right-3 rounded border border-border px-1.5 py-0.5 text-[10px] text-subtle">
              Ctrl K
            </kbd>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-sm text-muted">
              <IcChart className="h-4 w-4" /> 0
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-gold">
              <IcCoin className="h-4 w-4" /> 2,000
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-6 pb-16">
          <Hero bots={bots.slice(0, 5)} onSelect={onSelect} />

          {/* 공지 */}
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="rounded-md bg-danger/20 px-2 py-0.5 text-xs font-semibold text-danger">공지</span>
            <p className="flex-1 truncate text-sm text-text">🏆 사용자 랭킹 오픈 안내</p>
            <span className="text-xs text-subtle">5/5</span>
          </div>

          {/* 카테고리 칩 */}
          <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTag(null)}
              className={!activeTag ? "chip-on" : "chip-off"}
            >
              전체
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTag(t === activeTag ? null : t)}
                className={t === activeTag ? "chip-on" : "chip-off"}
              >
                #{t}
              </button>
            ))}
          </div>

          <Row title="인기 캐릭터" emoji="🔥" bots={popular} onSelect={onSelect} />
          <Row title="신규 캐릭터" emoji="✨" bots={fresh} onSelect={onSelect} />
          <Row title="주간 트렌드" emoji="⚡" bots={trend} onSelect={onSelect} />
          <Row
            title="익어야 제 맛"
            subtitle="깊을수록 짙어지는, 완숙美 그녀들"
            bots={popular}
            onSelect={onSelect}
          />
        </div>
      </main>

      {picker && (
        <ScenarioModal
          bot={picker}
          loading={loading}
          onPick={(sid) => start(picker.id, sid)}
          onClose={() => !loading && setPicker(null)}
        />
      )}
    </div>
  );
}

function Row({
  title,
  emoji,
  subtitle,
  bots,
  onSelect,
}: {
  title: string;
  emoji?: string;
  subtitle?: string;
  bots: GalleryBot[];
  onSelect: (b: CardBot) => void;
}) {
  const pad = Math.max(0, ROW_LEN - bots.length);
  return (
    <section className="mt-9">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-text">
          {title} {emoji}
        </h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
        {bots.map((b) => (
          <CharacterCard key={b.id} bot={b} onSelect={onSelect} />
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <LockedCard key={i} seed={title + i} />
        ))}
      </div>
    </section>
  );
}

function Hero({ bots, onSelect }: { bots: GalleryBot[]; onSelect: (b: CardBot) => void }) {
  const [i, setI] = useState(0);
  const n = Math.max(1, bots.length);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n]);
  if (!bots.length) return null;
  const b = bots[i % bots.length];
  return (
    <div className="relative mt-5 h-64 overflow-hidden rounded-2xl" style={{ background: gradientFor(b.name) }}>
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
      <button onClick={() => onSelect(b)} className="absolute inset-0 flex flex-col justify-end p-8 text-left">
        <div className="mb-2 flex gap-2">
          <span className="rounded bg-badgePurple px-2 py-0.5 text-xs font-semibold text-white">신규 시나리오</span>
          <span className="rounded bg-black/50 px-2 py-0.5 text-xs font-semibold text-white">인기 캐릭터</span>
        </div>
        <h2 className="max-w-md text-2xl font-extrabold text-white">
          “{b.quote}”
        </h2>
        <p className="mt-1 text-sm text-white/70">{b.name} · 성인 캐릭터 {b.characterAge}세</p>
      </button>
      <div className="absolute bottom-4 right-6 flex gap-1.5">
        {bots.map((_, k) => (
          <span
            key={k}
            className={"h-1.5 rounded-full transition-all " + (k === i % bots.length ? "w-5 bg-white" : "w-1.5 bg-white/40")}
          />
        ))}
      </div>
    </div>
  );
}

function ScenarioModal({
  bot,
  loading,
  onPick,
  onClose,
}: {
  bot: GalleryBot;
  loading: boolean;
  onPick: (scenarioId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 animate-fadeIn" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-bold text-text">{bot.name} · 시나리오 선택</h3>
        <p className="mb-4 text-sm text-muted">어떤 이야기로 시작할까요?</p>
        <div className="space-y-2">
          {bot.scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              disabled={loading}
              className="w-full rounded-lg border border-border bg-surface2 px-4 py-3 text-left transition-colors hover:border-primary disabled:opacity-60"
            >
              <div className="font-medium text-text">{s.title}</div>
              <div className="truncate text-xs text-muted">{s.description}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} disabled={loading} className="btn-ghost mt-4 w-full">
          취소
        </button>
      </div>
    </div>
  );
}
