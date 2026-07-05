"use client";
// 플롯 상세(모바일-온리): 세계관·캐스트 소개 + 내 주인공 설정 → 대화 시작.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { IcBack } from "@/components/icons";

export type PlotCast = {
  name: string;
  age: number;
  persona: string;
  relationship: string | null;
  avatarUrl: string | null;
};

export function PlotDetailClient({
  plotId,
  title,
  world,
  tags,
  cast,
}: {
  plotId: string;
  title: string;
  world: string;
  tags: string[];
  cast: PlotCast[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"남성" | "여성" | "">("");
  const [intro, setIntro] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/plot/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plotId,
          protagonist: { name: name.trim() || "나", gender: gender || null, intro: intro.trim() || null },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.sessionId) {
        router.push(`/plot/chat/${j.sessionId}`);
        return;
      }
      setBusy(false);
      setErr("시작하지 못했어요. 다시 시도해주세요.");
    } catch {
      setBusy(false);
      setErr("시작하지 못했어요. 다시 시도해주세요.");
    }
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[480px] bg-bg pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-3 pt-safe py-3 backdrop-blur">
        <Link href="/plots" className="-m-2 p-2 text-muted hover:text-text">
          <IcBack />
        </Link>
        <div className="truncate text-sm font-semibold">{title}</div>
      </header>

      <div className="space-y-5 px-4 py-5">
        {/* 세계관 */}
        <section>
          <h2 className="mb-1.5 text-xs font-semibold text-muted">세계관</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{world}</p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[11px] text-muted">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 등장인물 */}
        <section>
          <h2 className="mb-2 text-xs font-semibold text-muted">등장인물 {cast.length}명</h2>
          <ul className="space-y-2">
            {cast.map((c) => (
              <li key={c.name} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                <Avatar name={c.name} size={44} src={c.avatarUrl ?? undefined} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {c.name} <span className="text-[11px] text-subtle">· {c.age}세</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">{c.persona}</p>
                  {c.relationship && <p className="mt-0.5 line-clamp-2 text-[11px] text-primary/90">나와의 관계 · {c.relationship}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 내 주인공 */}
        <section>
          <h2 className="mb-2 text-xs font-semibold text-muted">내 주인공 (이야기 속 나)</h2>
          <div className="space-y-2">
            <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 준호)" />
            <div className="flex gap-2">
              {(["남성", "여성"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender((v) => (v === g ? "" : g))}
                  className={"rounded-full px-3 py-1.5 text-xs " + (gender === g ? "bg-primary text-white" : "border border-border text-muted")}
                >
                  {g}
                </button>
              ))}
            </div>
            <textarea
              className="input min-h-[56px] resize-none"
              value={intro}
              maxLength={1000}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="나에 대한 소개 (선택) — 캐릭터들이 이걸 알고 반응해요"
            />
          </div>
        </section>

        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      {/* 시작 버튼(고정) */}
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[480px] border-t border-line bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
        <button onClick={start} disabled={busy} className="btn-primary w-full">
          {busy ? "이야기를 준비하는 중…" : "대화 시작"}
        </button>
      </div>
    </div>
  );
}
