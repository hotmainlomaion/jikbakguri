"use client";
// 커스텀 캐릭터: 내 목록 + 생성 폼. A안 — 사진 업로드 없이 텍스트로 설정 → AI가 새 얼굴 생성.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export type CustomBot = {
  id: string;
  name: string;
  persona: string;
  age: number;
  style: string;
  avatarUrl: string | null;
};

const ERR: Record<string, string> = {
  underage: "캐릭터는 만 18세 이상이어야 합니다.",
  blocked: "미성년·불법을 암시하는 설정은 만들 수 없습니다.",
  limit: "커스텀 캐릭터 개수 한도에 도달했어요.",
  invalid_input: "이름·외모·성격은 필수예요.",
  create_failed: "생성에 실패했어요. 잠시 후 다시 시도해주세요.",
};

export function CharacterClient({ items }: { items: CustomBot[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(items.length === 0); // 목록 없으면 폼 먼저
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState("");
  const [persona, setPersona] = useState("");
  const [scenario, setScenario] = useState("");
  const [style, setStyle] = useState<"photoreal" | "anime">("photoreal");
  const [age, setAge] = useState(25);

  async function create() {
    if (busy) return;
    if (!name.trim() || !appearance.trim() || !persona.trim()) return setErr(ERR.invalid_input);
    if (age < 18) return setErr(ERR.underage);
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/character/custom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, appearance, persona, scenario, style, characterAge: age }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        return setErr(data.message || ERR[data.error] || "생성에 실패했어요.");
      }
      // 생성 성공 → 바로 세션 시작 후 채팅으로.
      const s = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botProfileId: data.botId }),
      });
      const sj = await s.json().catch(() => ({}));
      if (s.ok && sj.sessionId) {
        router.push(`/chat/${sj.sessionId}`);
        return;
      }
      // 세션 시작 실패 시 목록 새로고침.
      router.refresh();
      setBusy(false);
      setOpen(false);
    } catch {
      setBusy(false);
      setErr("생성에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  async function startChat(botId: string) {
    const s = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botProfileId: botId }),
    });
    const sj = await s.json().catch(() => ({}));
    if (s.ok && sj.sessionId) router.push(`/chat/${sj.sessionId}`);
  }

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6 sm:py-10 lg:pb-10">
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-semibold sm:text-2xl">내 캐릭터 만들기</h1>
          {!open && (
            <button onClick={() => setOpen(true)} className="btn-primary">
              ✨ 새로 만들기
            </button>
          )}
        </header>

        {open && (
          <div className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <p className="mb-3 text-xs leading-relaxed text-muted">
              사진 업로드 없이 <span className="text-text">텍스트로 설정</span>하면 AI가 <span className="text-text">새 얼굴</span>을 생성해요(실존 인물 아님). 캐릭터는 <span className="text-text">만 18세 이상</span>만 만들 수 있어요.
            </p>
            <div className="space-y-3">
              <Field label="이름">
                <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="예: 서연" />
              </Field>
              <Field label="외모 (머리·눈·체형·분위기)">
                <textarea className="input min-h-[64px] resize-none" value={appearance} maxLength={600} onChange={(e) => setAppearance(e.target.value)} placeholder="예: 긴 웨이브 흑발에 갈색 눈, 20대 후반의 차분한 분위기의 여성" />
              </Field>
              <Field label="성격·말투">
                <textarea className="input min-h-[64px] resize-none" value={persona} maxLength={800} onChange={(e) => setPersona(e.target.value)} placeholder="예: 다정하고 장난기 있는 성격, 반말로 살갑게 다가옴" />
              </Field>
              <Field label="상황·시나리오 (선택)">
                <textarea className="input min-h-[48px] resize-none" value={scenario} maxLength={600} onChange={(e) => setScenario(e.target.value)} placeholder="예: 늦은 밤 단둘이 있는 방" />
              </Field>
              <div className="flex flex-wrap items-center gap-4">
                <Field label="스타일" inline>
                  <div className="flex gap-2">
                    {(["photoreal", "anime"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStyle(s)}
                        className={
                          "rounded-full px-3 py-1.5 text-xs " +
                          (style === s ? "bg-primary text-white" : "border border-border text-muted")
                        }
                      >
                        {s === "photoreal" ? "실사" : "애니"}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="나이 (18+)" inline>
                  <input
                    type="number"
                    min={18}
                    max={80}
                    value={age}
                    onChange={(e) => setAge(Math.max(18, Math.min(80, Number(e.target.value) || 18)))}
                    className="input w-20"
                  />
                </Field>
              </div>
            </div>

            {err && <p className="mt-3 text-xs text-red-400">{err}</p>}

            <div className="mt-4 flex gap-2">
              {items.length > 0 && (
                <button className="btn-ghost flex-1" disabled={busy} onClick={() => { setOpen(false); setErr(null); }}>
                  취소
                </button>
              )}
              <button className="btn-primary flex-1" disabled={busy} onClick={create}>
                {busy ? "AI가 캐릭터를 그리는 중… (~10초)" : "캐릭터 만들고 대화 시작"}
              </button>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-2.5">
            {items.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => startChat(b.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface2"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface2">
                    {b.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-subtle">
                        {b.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{b.name}</span>
                      <span className="shrink-0 rounded-full border border-border bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
                        {b.style === "anime" ? "애니" : "실사"} · {b.age}세
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{b.persona}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomTabBar />
    </>
  );
}

function Field({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <label className={inline ? "flex flex-col gap-1" : "block"}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
