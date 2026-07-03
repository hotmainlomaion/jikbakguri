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
  const [f, setF] = useState({ name: "", persona: "", appearance_desc: "", system_prompt: "", character_age: 18 });
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/admin/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(f),
    });
    if (res.ok) {
      setOpen(false);
      setF({ name: "", persona: "", appearance_desc: "", system_prompt: "", character_age: 18 });
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
