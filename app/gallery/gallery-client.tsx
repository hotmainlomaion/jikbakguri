"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NavSidebar } from "@/components/nav-sidebar";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { CharacterCard, LockedCard, type CardBot } from "@/components/character-card";
import { gradientFor } from "@/components/ui";
import { IcSearch, IcCoin, IcChart } from "@/components/icons";

export type GalleryBot = CardBot & {
  characterAge: number;
  likes: number;
  rankScore: number;
  scenarios: { id: string; title: string; description: string }[];
};
export type ContinueItem = { sessionId: string; name: string; tag: string; lastActive: string; hasProactive?: boolean };

const ROW_LEN = 6;

export function GalleryClient({
  bots,
  favoriteIds = [],
  continueList = [],
}: {
  bots: GalleryBot[];
  favoriteIds?: string[];
  continueList?: ContinueItem[];
}) {
  const router = useRouter();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [picker, setPicker] = useState<GalleryBot | null>(null);
  const [loading, setLoading] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(() => new Set(favoriteIds));

  // F02(#9): 진입 시 선톡 tick — 하루 1회만 발사(sessionStorage) + StrictMode 이중 실행 ref 가드.
  // 서버도 claim_proactive로 원자 클레임하므로 중복 선톡/비용 남용을 이중 차단.
  const ticked = useRef(false);
  useEffect(() => {
    if (ticked.current) return;
    ticked.current = true;
    try {
      const key = `jb_proactive_tick_${new Date().toISOString().slice(0, 10)}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    fetch("/api/proactive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localHour: new Date().getHours() }),
    }).catch(() => {});
  }, []);

  async function toggleFav(botId: string) {
    // 낙관적 토글 후 서버 반영(실패 시 롤백).
    setFavs((prev) => {
      const n = new Set(prev);
      n.has(botId) ? n.delete(botId) : n.add(botId);
      return n;
    });
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botProfileId: botId }),
    });
    if (!res.ok) {
      setFavs((prev) => {
        const n = new Set(prev);
        n.has(botId) ? n.delete(botId) : n.add(botId);
        return n;
      });
    }
  }

  const allTags = useMemo(() => {
    const s = new Set<string>();
    bots.forEach((b) => b.tags.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [bots]);

  const filtered = activeTag ? bots.filter((b) => b.tags.includes(activeTag)) : bots;
  const popular = [...filtered].sort((a, b) => b.views - a.views);
  const fresh = [...filtered].sort((a, b) => Number(b.isNew) - Number(a.isNew));
  const trend = [...filtered].sort((a, b) => b.rankScore - a.rankScore);
  const favBots = filtered.filter((b) => favs.has(b.id));
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
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <NavSidebar ranking={ranking} />

      <main className="flex-1 overflow-y-auto">
        {/* 상단바 */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/90 px-3 py-3 backdrop-blur sm:gap-4 sm:px-6">
          <div className="relative mx-auto flex w-full items-center sm:max-w-xl">
            <IcSearch className="pointer-events-none absolute left-3 h-4 w-4 text-subtle" />
            <input
              className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-base text-text placeholder:text-subtle focus:border-primary focus:outline-none sm:py-2 sm:pr-14 sm:text-sm"
              placeholder="캐릭터, 태그, 작품 검색..."
            />
            <kbd className="absolute right-3 hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-subtle sm:block">
              Ctrl K
            </kbd>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button className="hidden items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-sm text-muted sm:flex">
              <IcChart className="h-4 w-4" /> 0
            </button>
            <button className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-gold">
              <IcCoin className="h-4 w-4" /> 2,000
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-3 pb-24 sm:px-6 lg:pb-16">
          <Hero bots={bots.slice(0, 5)} onSelect={onSelect} />

          {/* 공지 */}
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="rounded-md bg-danger/20 px-2 py-0.5 text-xs font-semibold text-danger">공지</span>
            <p className="flex-1 truncate text-sm text-text">🏆 사용자 랭킹 오픈 안내</p>
            <span className="text-xs text-subtle">5/5</span>
          </div>

          {/* 카테고리 칩 */}
          <div className="no-scrollbar -mx-3 mt-6 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
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

          {/* F39 이어하기 — 최근 대화 세션 원클릭 복귀 */}
          {continueList.length > 0 && (
            <ContinueRow items={continueList} onOpen={(sid) => router.push(`/chat/${sid}`)} />
          )}
          {/* F39 즐겨찾기 행 */}
          {favBots.length > 0 && (
            <Row title="즐겨찾기" emoji="♥" bots={favBots} onSelect={onSelect} favs={favs} onToggleFav={toggleFav} />
          )}

          <Row title="인기 캐릭터" emoji="🔥" bots={popular} onSelect={onSelect} favs={favs} onToggleFav={toggleFav} />
          <Row title="신규 캐릭터" emoji="✨" bots={fresh} onSelect={onSelect} favs={favs} onToggleFav={toggleFav} />
          <Row title="주간 트렌드" emoji="⚡" bots={trend} onSelect={onSelect} favs={favs} onToggleFav={toggleFav} />
          <Row
            title="익어야 제 맛"
            subtitle="깊을수록 짙어지는, 완숙美 그녀들"
            bots={popular}
            onSelect={onSelect}
            favs={favs}
            onToggleFav={toggleFav}
          />
        </div>
      </main>

      <BottomTabBar />

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
  favs,
  onToggleFav,
}: {
  title: string;
  emoji?: string;
  subtitle?: string;
  bots: GalleryBot[];
  onSelect: (b: CardBot) => void;
  favs?: Set<string>;
  onToggleFav?: (id: string) => void;
}) {
  // 즐겨찾기 행은 실제 개수만 노출(플레이스홀더로 채우지 않음).
  const pad = onToggleFav && title === "즐겨찾기" ? 0 : Math.max(0, ROW_LEN - bots.length);
  return (
    <section className="mt-8 sm:mt-9">
      <div className="mb-3">
        <h2 className="text-base font-bold text-text sm:text-lg">
          {title} {emoji}
        </h2>
        {subtitle && <p className="text-xs text-muted sm:text-sm">{subtitle}</p>}
      </div>
      <div className="no-scrollbar -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 pr-6 sm:mx-0 sm:gap-4 sm:px-0 sm:pr-0">
        {bots.map((b) => (
          <CharacterCard
            key={b.id}
            bot={b}
            onSelect={onSelect}
            favorited={favs?.has(b.id)}
            onToggleFav={onToggleFav}
          />
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <LockedCard key={i} seed={title + i} />
        ))}
      </div>
    </section>
  );
}

// F39 이어하기 — 최근 세션 카드(원클릭 복귀).
function ContinueRow({ items, onOpen }: { items: ContinueItem[]; onOpen: (sessionId: string) => void }) {
  return (
    <section className="mt-8 sm:mt-9">
      <div className="mb-3">
        <h2 className="text-base font-bold text-text sm:text-lg">이어하기 ▶</h2>
        <p className="text-xs text-muted sm:text-sm">보던 이야기, 바로 이어서</p>
      </div>
      <div className="no-scrollbar -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 pr-6 sm:mx-0 sm:gap-4 sm:px-0 sm:pr-0">
        {items.map((it) => (
          <button
            key={it.sessionId}
            onClick={() => onOpen(it.sessionId)}
            className="group w-36 shrink-0 text-left sm:w-44"
          >
            <div
              className="relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-white/5 transition-transform group-hover:-translate-y-1"
              style={{ background: gradientFor(it.name) }}
            >
              <span className="absolute inset-0 flex items-center justify-center text-6xl font-black text-white/15">
                {it.name.slice(0, 1)}
              </span>
              <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 to-transparent" />
              <span className="absolute left-2 top-2 z-10 rounded-md bg-primary/80 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                이어하기
              </span>
              {/* F02 선톡 대기 배지 */}
              {it.hasProactive && (
                <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                  💬 선톡
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 p-3">
                <h3 className="truncate text-[15px] font-bold text-white">{it.name}</h3>
                <p className="truncate text-[12px] text-white/70">
                  {it.hasProactive ? "새 메시지가 있어요" : new Date(it.lastActive).toLocaleDateString("ko-KR")}
                </p>
              </div>
            </div>
          </button>
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
    <div className="relative mt-5 h-40 overflow-hidden rounded-2xl sm:h-64" style={{ background: gradientFor(b.name) }}>
      {b.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.avatarUrl} alt={b.name} className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
      <button onClick={() => onSelect(b)} className="absolute inset-0 flex flex-col justify-end p-4 text-left sm:p-8">
        <div className="mb-2 flex gap-2">
          <span className="rounded bg-badgePurple px-2 py-0.5 text-xs font-semibold text-white">신규 시나리오</span>
          <span className="rounded bg-black/50 px-2 py-0.5 text-xs font-semibold text-white">인기 캐릭터</span>
        </div>
        <h2 className="line-clamp-2 max-w-md text-lg font-extrabold text-white sm:text-2xl">
          “{b.quote}”
        </h2>
        <p className="mt-1 text-xs text-white/70 sm:text-sm">{b.name} · 성인 캐릭터 {b.characterAge}세</p>
      </button>
      <div className="absolute bottom-4 right-4 flex gap-1.5 sm:right-6">
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 animate-fadeIn sm:items-center sm:px-4" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl border border-border bg-surface p-4 pb-safe animate-slideUp sm:max-w-md sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />
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
              <div className="line-clamp-2 text-xs text-muted">{s.description}</div>
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
