"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NavSidebar } from "@/components/nav-sidebar";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { CharacterCard, LockedCard, type CardBot } from "@/components/character-card";
import { gradientFor } from "@/components/ui";
import { IcSearch, IcChart } from "@/components/icons";
import { CreditBadge, type WalletClient } from "@/components/credit-badge";

export type GalleryScenario = {
  id: string;
  title: string;
  description: string;
  detail?: string | null;
  tags?: string[];
  intensity?: number;
};
export type GalleryBot = CardBot & {
  characterAge: number;
  likes: number;
  rankScore: number;
  scenarios: GalleryScenario[];
  heroUrl?: string | null; // 히어로 배너 전용 와이드 이미지(없으면 아바타 폴백)
  heroHook?: string | null; // 히어로 배너 티저 문구(없으면 persona 폴백)
};
export type ContinueItem = { sessionId: string; name: string; tag: string; lastActive: string; hasProactive?: boolean; thumb?: string | null };

const ROW_LEN = 6;

export function GalleryClient({
  bots,
  favoriteIds = [],
  continueList = [],
  wallet: initialWallet,
}: {
  bots: GalleryBot[];
  favoriteIds?: string[];
  continueList?: ContinueItem[];
  wallet: WalletClient;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view"); // null(홈) | explore | favorites | ranking | collection | attendance
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [picker, setPicker] = useState<GalleryBot | null>(null);
  const [loading, setLoading] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(() => new Set(favoriteIds));
  const [wallet, setWallet] = useState<WalletClient>(initialWallet);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // 검색 단축키: Ctrl/Cmd+K → 검색창 포커스, Esc → 검색어 지우고 해제.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // 검색: 이름·한줄·태그·시나리오(제목/상황)를 대소문자 무시 부분일치. 태그칩과 함께 좁혀진다.
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const searchResults = useMemo(() => {
    if (!q) return [];
    return filtered.filter((b) => {
      const hay = [
        b.name,
        b.quote,
        (b as any).heroHook ?? "",
        b.tags.join(" "),
        b.scenarios.map((s) => `${s.title} ${s.description ?? ""} ${(s.tags ?? []).join(" ")}`).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [q, filtered]);
  // 탐색 그리드: 전체(태그 필터 적용)를 최신순으로. 랭킹 뷰는 rankScore 순.
  const exploreBots = [...filtered].sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.views - a.views);

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
    // 시나리오가 있으면 항상 선택 모달(간략+구체적 상황을 보고 고르게). 없으면 바로 시작.
    if (full.scenarios.length >= 1) setPicker(full);
    else start(full.id);
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
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              aria-label="캐릭터·태그·시나리오 검색"
              className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-9 text-base text-text placeholder:text-subtle focus:border-primary focus:outline-none sm:py-2 sm:pr-14 sm:text-sm"
              placeholder="캐릭터, 태그, 작품 검색..."
            />
            {query ? (
              <button
                onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                aria-label="검색어 지우기"
                className="absolute right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-border/70 text-xs text-muted hover:text-text"
              >
                ✕
              </button>
            ) : (
              <kbd className="absolute right-3 hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-subtle sm:block">
                ⌘K
              </kbd>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button className="hidden items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-sm text-muted sm:flex">
              <IcChart className="h-4 w-4" /> 0
            </button>
            <CreditBadge wallet={wallet} onWallet={setWallet} />
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-3 pb-24 sm:px-6 lg:pb-16">
          {searching ? (
            /* 검색 결과 — 이름·태그·시나리오 부분일치(태그칩과 함께 좁혀짐) */
            <section className="mt-6">
              <h2 className="mb-4 text-base font-bold text-text sm:text-lg">
                ‘{query.trim()}’ 검색 결과 <span className="text-muted">{searchResults.length}</span>
              </h2>
              {searchResults.length ? (
                <Grid bots={searchResults} onSelect={onSelect} favs={favs} onToggleFav={toggleFav} />
              ) : (
                <EmptyState icon="🔍" text={`‘${query.trim()}’에 맞는 캐릭터를 찾지 못했어요.`} hint="이름·태그·시나리오 키워드로 검색해 보세요." />
              )}
            </section>
          ) : view === "explore" ? (
            /* 탐색 — 전체 캐릭터를 태그로 둘러보는 그리드 */
            <section className="mt-5">
              <div className="mb-3">
                <h2 className="text-base font-bold text-text sm:text-lg">탐색 🧭</h2>
                <p className="text-xs text-muted sm:text-sm">모든 캐릭터를 태그로 둘러보세요</p>
              </div>
              <TagChips allTags={allTags} activeTag={activeTag} onPick={setActiveTag} />
              <div className="mt-5">
                {exploreBots.length ? (
                  <Grid bots={exploreBots} onSelect={onSelect} favs={favs} onToggleFav={toggleFav} />
                ) : (
                  <EmptyState icon="🧭" text="이 태그에 해당하는 캐릭터가 없어요." hint="다른 태그를 선택해 보세요." />
                )}
              </div>
            </section>
          ) : view === "favorites" ? (
            /* 즐겨찾기 */
            <section className="mt-5">
              <div className="mb-4">
                <h2 className="text-base font-bold text-text sm:text-lg">즐겨찾기 ♥</h2>
                <p className="text-xs text-muted sm:text-sm">하트를 누른 그녀들</p>
              </div>
              {favBots.length ? (
                <Grid bots={favBots} onSelect={onSelect} favs={favs} onToggleFav={toggleFav} />
              ) : (
                <EmptyState icon="♡" text="아직 즐겨찾기한 캐릭터가 없어요." hint="카드의 하트를 눌러 추가하세요." />
              )}
            </section>
          ) : view === "ranking" ? (
            /* 실시간 랭킹 */
            <section className="mt-5">
              <div className="mb-4">
                <h2 className="text-base font-bold text-text sm:text-lg">실시간 캐릭터 랭킹 👑</h2>
                <p className="text-xs text-muted sm:text-sm">지금 가장 뜨거운 그녀들</p>
              </div>
              <RankingView bots={[...bots].sort((a, b) => b.rankScore - a.rankScore)} onSelect={onSelect} />
            </section>
          ) : view === "collection" || view === "attendance" ? (
            <EmptyState icon="🛠️" text="준비 중인 기능이에요." hint="곧 만나요!" />
          ) : (
            /* 홈 — 히어로 + 큐레이션 행 */
            <>
              <Hero bots={bots.slice(0, 5)} onSelect={onSelect} />

              {/* 공지 */}
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                <span className="rounded-md bg-danger/20 px-2 py-0.5 text-xs font-semibold text-danger">공지</span>
                <p className="flex-1 truncate text-sm text-text">🏆 사용자 랭킹 오픈 안내</p>
                <span className="text-xs text-subtle">5/5</span>
              </div>

              {/* 카테고리 칩 */}
              <div className="mt-6">
                <TagChips allTags={allTags} activeTag={activeTag} onPick={setActiveTag} />
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
            </>
          )}
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

// 태그 필터 칩(홈·탐색 공용).
function TagChips({ allTags, activeTag, onPick }: { allTags: string[]; activeTag: string | null; onPick: (t: string | null) => void }) {
  return (
    <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <button onClick={() => onPick(null)} className={!activeTag ? "chip-on" : "chip-off"}>전체</button>
      {allTags.map((t) => (
        <button key={t} onClick={() => onPick(t === activeTag ? null : t)} className={t === activeTag ? "chip-on" : "chip-off"}>
          #{t}
        </button>
      ))}
    </div>
  );
}

// 반응형 그리드(검색 결과·탐색·즐겨찾기 공용). CharacterCard(고정폭)를 flex-wrap으로 배치.
function Grid({
  bots,
  onSelect,
  favs,
  onToggleFav,
}: {
  bots: GalleryBot[];
  onSelect: (b: CardBot) => void;
  favs?: Set<string>;
  onToggleFav?: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 sm:gap-4">
      {bots.map((b) => (
        <CharacterCard key={b.id} bot={b} onSelect={onSelect} favorited={favs?.has(b.id)} onToggleFav={onToggleFav} />
      ))}
    </div>
  );
}

// 빈 상태 안내.
function EmptyState({ icon, text, hint }: { icon: string; text: string; hint?: string }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
      <span className="text-4xl opacity-80">{icon}</span>
      <p className="text-sm font-medium text-text">{text}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

// 실시간 랭킹 리스트(순위 + 아바타 + 이름/태그 + 점수).
function RankingView({ bots, onSelect }: { bots: GalleryBot[]; onSelect: (b: CardBot) => void }) {
  return (
    <ol className="flex flex-col gap-2">
      {bots.map((b, i) => (
        <li key={b.id}>
          <button
            onClick={() => onSelect(b)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/60"
          >
            <span className={"w-6 shrink-0 text-center text-lg font-black " + (i < 3 ? "text-gold" : "text-subtle")}>{i + 1}</span>
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10" style={{ background: gradientFor(b.name) }}>
              {b.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.avatarUrl} alt={b.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white/70">{b.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text">{b.name}</p>
              <p className="truncate text-xs text-muted">{b.tags[0] ? `#${b.tags[0]}` : ""} · 성인 {b.characterAge}세</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-primary">🔥 {b.rankScore}</span>
          </button>
        </li>
      ))}
    </ol>
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
              {it.thumb ? (
                // 세션 마지막 생성 이미지(없으면 대표컷). 얼굴 상단 우선 노출.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumb} alt={it.name} className="absolute inset-0 h-full w-full object-cover object-top" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-6xl font-black text-white/15">
                  {it.name.slice(0, 1)}
                </span>
              )}
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
  // 히어로 전용 와이드 이미지가 있으면 사용(얼굴이 배너 비율에 맞게 온전히 보임).
  // 없으면 세로 아바타로 폴백하되 object-top으로 얼굴(상단) 우선 노출.
  const src = b.heroUrl ?? b.avatarUrl ?? null;
  // 히어로 전용컷은 얼굴이 세로 중앙 → object-center. 폴백(세로 아바타)은 얼굴이 상단 1/4 지점이라
  // object-top(정수리)도 center(턱 잘림)도 아닌 상단 25% 앵커로 얼굴을 프레임에 담는다.
  const fit = b.heroUrl ? "object-cover object-center" : "object-cover object-[center_25%]";
  return (
    <div className="relative mt-5 h-40 overflow-hidden rounded-2xl sm:h-64" style={{ background: gradientFor(b.name) }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={b.name} className={"absolute inset-0 h-full w-full " + fit} />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
      <button onClick={() => onSelect(b)} className="absolute inset-0 flex flex-col justify-end p-4 text-left sm:p-8">
        <div className="mb-2 flex gap-2">
          <span className="rounded bg-badgePurple px-2 py-0.5 text-xs font-semibold text-white">신규 시나리오</span>
          <span className="rounded bg-black/50 px-2 py-0.5 text-xs font-semibold text-white">인기 캐릭터</span>
        </div>
        <h2 className="line-clamp-2 max-w-md text-lg font-extrabold leading-snug text-white drop-shadow sm:max-w-lg sm:text-2xl">
          {b.heroHook ?? `“${b.quote}”`}
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
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 animate-fadeIn sm:items-center sm:px-4" onClick={onClose}>
      <div
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-border bg-surface animate-slideUp sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />
          <div className="flex items-center gap-2">
            <span className="badge-19">19</span>
            <h3 className="text-lg font-bold text-text">{bot.name}</h3>
            <span className="text-sm text-muted">· 성인 캐릭터 {bot.characterAge}세</span>
          </div>
          <p className="mb-3 mt-1 text-sm text-muted">어떤 밤으로 시작할까요?</p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-2 sm:px-5">
          {bot.scenarios.map((s) => {
            const open = openId === s.id;
            return (
              <div
                key={s.id}
                className="overflow-hidden rounded-xl border border-border bg-surface2 transition-colors hover:border-primary/60"
              >
                <button
                  onClick={() => onPick(s.id)}
                  disabled={loading}
                  className="block w-full px-4 py-3 text-left disabled:opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text">{s.title}</span>
                    <span className="text-xs text-danger" title={`수위 ${s.intensity ?? 2}/3`}>
                      {"🔥".repeat(Math.max(1, Math.min(3, s.intensity ?? 2)))}
                    </span>
                  </div>
                  {/* 간략한 상황(훅) */}
                  <p className="mt-1 text-[13px] leading-snug text-subtle">{s.description}</p>
                  {/* 페티쉬/무드 태그 칩 */}
                  {!!s.tags?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.tags.slice(0, 5).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* 구체적 상황(펼치기) */}
                  {s.detail && (
                    <p className={"mt-2 text-xs leading-relaxed text-muted " + (open ? "" : "line-clamp-2")}>
                      {s.detail}
                    </p>
                  )}
                </button>
                <div className="flex items-center justify-between border-t border-border/60 px-4 py-2">
                  {s.detail ? (
                    <button
                      onClick={() => setOpenId(open ? null : s.id)}
                      className="text-[11px] font-medium text-subtle hover:text-text"
                    >
                      {open ? "접기 ▴" : "자세히 보기 ▾"}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => onPick(s.id)}
                    disabled={loading}
                    className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {loading ? "시작 중…" : "이 이야기로 시작 ▶"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 px-4 pb-safe pt-2 sm:px-5 sm:pb-4">
          <button onClick={onClose} disabled={loading} className="btn-ghost w-full">
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
