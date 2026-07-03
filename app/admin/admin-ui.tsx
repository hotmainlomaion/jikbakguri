"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function useReload() {
  const router = useRouter();
  return () => router.refresh();
}

export function BotForm() {
  const reload = useReload();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", persona: "", appearance_desc: "", system_prompt: "", character_age: 18, tags: "" });
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/admin/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    });
    if (res.ok) {
      setOpen(false);
      setF({ name: "", persona: "", appearance_desc: "", system_prompt: "", character_age: 18, tags: "" });
      reload();
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error === "underage" ? "character_age는 18 이상이어야 합니다." : "등록 실패");
    }
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary">봇 추가</button>;

  return (
    <form onSubmit={submit} className="card space-y-3">
      <input required placeholder="이름" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input required placeholder="성격/말투 (persona)" className="input" value={f.persona} onChange={(e) => setF({ ...f, persona: e.target.value })} />
      <input required placeholder="외형 설명 (이미지 프롬프트 베이스)" className="input" value={f.appearance_desc} onChange={(e) => setF({ ...f, appearance_desc: e.target.value })} />
      <input placeholder="태그 (쉼표 구분, 예: 다정,연상,오피스)" className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
      <textarea required placeholder="시스템 프롬프트" className="input" value={f.system_prompt} onChange={(e) => setF({ ...f, system_prompt: e.target.value })} />
      <label className="block text-sm text-muted">캐릭터 나이 (18+)
        <input required type="number" min={18} className="input mt-1" value={f.character_age} onChange={(e) => setF({ ...f, character_age: Number(e.target.value) })} />
      </label>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary">등록</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">취소</button>
      </div>
    </form>
  );
}

export function PublishToggle({ id, published }: { id: string; published: boolean }) {
  const reload = useReload();
  async function toggle() {
    await fetch("/api/admin/bots", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, is_published: !published }),
    });
    reload();
  }
  return <button onClick={toggle} className="btn-ghost text-xs">{published ? "비공개로" : "공개로"}</button>;
}

export function ScenarioForm({ botId }: { botId: string }) {
  const reload = useReload();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", scenario: "", greeting: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botProfileId: botId, ...f }),
    });
    if (res.ok) {
      setOpen(false);
      setF({ title: "", description: "", scenario: "", greeting: "" });
      reload();
    }
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost text-xs">
        + 시나리오
      </button>
    );

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg border border-border bg-surface2 p-3">
      <input required placeholder="시나리오 제목" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <input required placeholder="요약 (선택 UI 표시)" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <textarea required placeholder="세계관/상황 (시스템 프롬프트 주입, 성인 설정)" className="input" value={f.scenario} onChange={(e) => setF({ ...f, scenario: e.target.value })} />
      <textarea required placeholder="첫 인사 (오프닝 봇 메시지로 시드)" className="input" value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} />
      <div className="flex gap-2">
        <button className="btn-primary text-xs">등록</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">취소</button>
      </div>
    </form>
  );
}

export function ScenarioToggle({ id, published }: { id: string; published: boolean }) {
  const reload = useReload();
  async function toggle() {
    await fetch("/api/admin/scenarios", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, is_published: !published }),
    });
    reload();
  }
  return (
    <button onClick={toggle} className="btn-ghost text-xs">
      {published ? "비공개로" : "공개로"}
    </button>
  );
}

export function ReportActions({ id }: { id: string }) {
  const reload = useReload();
  async function resolve() {
    await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: "resolved" }),
    });
    reload();
  }
  return <button onClick={resolve} className="btn-ghost text-xs">처리 완료</button>;
}

export function UserActions({ id, status }: { id: string; status: string }) {
  const reload = useReload();
  async function set(next: string) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    reload();
  }
  return (
    <div className="flex gap-2">
      {status !== "banned" && <button onClick={() => set("banned")} className="btn-ghost text-xs text-red-400">차단</button>}
      {status !== "active" && <button onClick={() => set("active")} className="btn-ghost text-xs">복구</button>}
    </div>
  );
}
