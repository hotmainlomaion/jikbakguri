"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type GalleryBot = {
  id: string;
  name: string;
  persona: string;
  characterAge: number;
  tags: string[];
  scenarios: { id: string; title: string; description: string }[];
};

// 이름 기반 결정론적 그라데이션 대표컷 플레이스홀더(실제 대표 이미지 연동 전까지).
function avatarStyle(name: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${h} 45% 32%), hsl(${(h + 40) % 360} 50% 22%))`,
  };
}

export function GalleryClient({ bots }: { bots: GalleryBot[] }) {
  const router = useRouter();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [picker, setPicker] = useState<GalleryBot | null>(null);
  const [loading, setLoading] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    bots.forEach((b) => b.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [bots]);

  const visible = activeTag ? bots.filter((b) => b.tags.includes(activeTag)) : bots;

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

  // 카드 클릭: 시나리오 여러 개면 선택 모달, 하나면 바로, 없으면 시나리오 없이 시작.
  function onPick(bot: GalleryBot) {
    if (bot.scenarios.length > 1) setPicker(bot);
    else start(bot.id, bot.scenarios[0]?.id);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">캐릭터 갤러리</h1>
        <nav className="flex gap-4 text-sm text-muted">
          <a href="/history">히스토리</a>
          <a href="/settings">설정</a>
        </nav>
      </header>

      {/* 태그 필터 */}
      {allTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={
              "rounded-full px-3 py-1 text-xs " +
              (!activeTag ? "bg-primary text-white" : "border border-border text-muted hover:bg-surface2")
            }
          >
            전체
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(t === activeTag ? null : t)}
              className={
                "rounded-full px-3 py-1 text-xs " +
                (t === activeTag ? "bg-primary text-white" : "border border-border text-muted hover:bg-surface2")
              }
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b)}
            disabled={loading}
            className="card flex flex-col text-left transition-colors hover:border-primary disabled:opacity-60"
          >
            <div
              className="mb-3 flex aspect-[4/3] items-center justify-center rounded-lg text-3xl font-bold text-white/80"
              style={avatarStyle(b.name)}
              aria-hidden
            >
              {b.name.slice(0, 1)}
            </div>
            <h2 className="text-lg font-medium">{b.name}</h2>
            <p className="mt-1 flex-1 text-sm text-muted line-clamp-2">{b.persona}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {b.tags.slice(0, 4).map((t) => (
                <span key={t} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-muted">
                  #{t}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              성인 캐릭터 · {b.characterAge}세
              {b.scenarios.length > 0 && ` · 시나리오 ${b.scenarios.length}`}
            </p>
          </button>
        ))}
        {visible.length === 0 && <p className="text-muted">해당 태그의 캐릭터가 없습니다.</p>}
      </div>

      {/* 시나리오 선택 모달 */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => !loading && setPicker(null)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-medium">{picker.name} · 시나리오 선택</h3>
            <p className="mb-4 text-sm text-muted">어떤 이야기로 시작할까요?</p>
            <div className="space-y-2">
              {picker.scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => start(picker.id, s.id)}
                  disabled={loading}
                  className="w-full rounded-lg border border-border bg-surface2 px-4 py-3 text-left hover:border-primary disabled:opacity-60"
                >
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-muted line-clamp-2">{s.description}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setPicker(null)} disabled={loading} className="btn-ghost mt-4 w-full">
              취소
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
