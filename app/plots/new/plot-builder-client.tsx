"use client";
// 플롯 빌더(모바일-온리): 세계관·오프닝·태그 + 캐스트 선택(각자 '나와의 관계') → 제작.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { IcBack } from "@/components/icons";

export type PickChar = {
  id: string;
  name: string;
  persona: string;
  age: number;
  isCustom: boolean;
  avatarUrl: string | null;
};

export function PlotBuilderClient({ chars }: { chars: PickChar[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [world, setWorld] = useState("");
  const [opening, setOpening] = useState("");
  const [tags, setTags] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({}); // botId → relationship
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickedIds = Object.keys(picked);
  function toggle(id: string) {
    setPicked((p) => {
      const n = { ...p };
      if (id in n) delete n[id];
      else n[id] = "";
      return n;
    });
  }

  async function create() {
    if (busy) return;
    setErr(null);
    if (!title.trim() || !world.trim() || pickedIds.length < 2) {
      return setErr("제목·세계관·캐릭터 2명 이상은 필수예요.");
    }
    setBusy(true);
    try {
      const members = pickedIds.map((id) => ({ botProfileId: id, relationship: picked[id] }));
      const r = await fetch("/api/plot/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          world,
          opening,
          tags: tags.split(/[,#\s]+/).map((t) => t.trim()).filter(Boolean),
          members,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.plotId) {
        router.push(`/plot/${j.plotId}`);
        return;
      }
      setBusy(false);
      setErr(j.message || "제작에 실패했어요.");
    } catch {
      setBusy(false);
      setErr("제작에 실패했어요.");
    }
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[480px] bg-bg pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-3 pt-safe py-3 backdrop-blur">
        <Link href="/plots" className="-m-2 p-2 text-muted hover:text-text">
          <IcBack />
        </Link>
        <div className="text-sm font-semibold">플롯 만들기</div>
      </header>

      <div className="space-y-5 px-4 py-5">
        <Field label="제목">
          <input className="input" value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} placeholder="예: 옥탑방 삼각관계" />
        </Field>
        <Field label="세계관 · 상황">
          <textarea className="input min-h-[90px] resize-none" value={world} maxLength={2000} onChange={(e) => setWorld(e.target.value)} placeholder="배경·상황·인물 관계를 설명하세요. 주인공(사용자)이 이 이야기 속 어떤 위치인지도." />
        </Field>
        <Field label="오프닝 지문 (선택) — 첫 장면">
          <textarea className="input min-h-[64px] resize-none" value={opening} maxLength={1500} onChange={(e) => setOpening(e.target.value)} placeholder={"예: *좁은 옥탑방에 셋이 둘러앉는다.*\n강하린: 왔어? 늦었네."} />
        </Field>
        <Field label="태그 (쉼표로 구분)">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="여성향, 삼각관계, 여름밤" />
        </Field>

        <section>
          <h2 className="mb-1 text-xs font-semibold text-muted">등장인물 선택 ({pickedIds.length}명 · 2~6명)</h2>
          <p className="mb-2 text-[11px] text-subtle">캐릭터를 탭해 캐스트에 넣고, 각자 &lsquo;나와의 관계&rsquo;를 적으면 그대로 반영돼요.</p>
          <ul className="space-y-2">
            {chars.map((c) => {
              const on = c.id in picked;
              return (
                <li key={c.id} className={"rounded-xl border p-2.5 " + (on ? "border-primary bg-primary/5" : "border-border bg-surface")}>
                  <button onClick={() => toggle(c.id)} className="flex w-full items-center gap-3 text-left">
                    <Avatar name={c.name} size={40} src={c.avatarUrl ?? undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {c.name} <span className="text-[11px] text-subtle">· {c.age}세{c.isCustom ? " · 내 캐릭터" : ""}</span>
                      </div>
                      <p className="line-clamp-1 text-xs text-muted">{c.persona}</p>
                    </div>
                    <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] " + (on ? "bg-primary text-white" : "border border-border text-muted")}>{on ? "선택됨" : "추가"}</span>
                  </button>
                  {on && (
                    <input
                      className="input mt-2"
                      value={picked[c.id]}
                      maxLength={300}
                      onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.value }))}
                      placeholder={`${c.name}와 나(주인공)의 관계 — 예: 소꿉친구, 은근히 들이댐`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {chars.length === 0 && <p className="text-sm text-muted">쓸 수 있는 캐릭터가 없어요. &lsquo;만들기&rsquo;에서 캐릭터를 먼저 만들어보세요.</p>}
        </section>

        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[480px] border-t border-line bg-bg/95 px-4 py-3 pb-safe backdrop-blur">
        <button onClick={create} disabled={busy} className="btn-primary w-full">
          {busy ? "플롯을 만드는 중…" : "플롯 만들기"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
