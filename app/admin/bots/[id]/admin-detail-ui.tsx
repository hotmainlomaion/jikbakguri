"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function useReload() {
  const router = useRouter();
  return () => router.refresh();
}

// ---------- 프로필 편집 (canon SSOT 포함) ----------
export function BotEditForm({ bot }: { bot: any }) {
  const reload = useReload();
  const c = bot.canon ?? {};
  const id = c.identity ?? {};
  const voice = c.voice ?? {};
  const [f, setF] = useState({
    name: bot.name ?? "",
    persona: bot.persona ?? "",
    appearance_desc: bot.appearance_desc ?? "",
    system_prompt: bot.system_prompt ?? "",
    character_age: bot.character_age ?? 18,
    tags: (bot.tags ?? []).join(", "),
    backstory: id.backstory ?? "",
    relationships: id.relationships ?? "",
    register: voice.register ?? "",
    language: voice.language ?? "ko",
    tics: (voice.tics ?? []).join("; "),
    boundaries: (c.boundaries ?? []).join("\n"),
    canon_facts: (c.canon_facts ?? []).join("\n"),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    const age = Number(f.character_age);
    const canon = {
      identity: { name: f.name, age, backstory: f.backstory, relationships: f.relationships },
      voice: {
        register: f.register,
        language: f.language,
        tics: f.tics.split(";").map((s: string) => s.trim()).filter(Boolean),
      },
      appearance: f.appearance_desc,
      boundaries: f.boundaries.split("\n").map((s: string) => s.trim()).filter(Boolean),
      canon_facts: f.canon_facts.split("\n").map((s: string) => s.trim()).filter(Boolean),
    };
    const res = await fetch("/api/admin/bots", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: bot.id,
        name: f.name,
        persona: f.persona,
        appearance_desc: f.appearance_desc,
        system_prompt: f.system_prompt,
        character_age: age,
        tags: f.tags.split(",").map((t: string) => t.trim()).filter(Boolean),
        canon,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("저장됨 (진행 중 세션은 스냅샷으로 보호되어 영향 없음)");
      reload();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error === "underage" ? "나이/캐논이 18세 미만입니다." : "저장 실패");
    }
  }

  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <form onSubmit={save} className="card space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-muted">이름
          <input required className="input mt-1" value={f.name} onChange={set("name")} />
        </label>
        <label className="text-sm text-muted">캐릭터 나이 (18+)
          <input required type="number" min={18} className="input mt-1" value={f.character_age} onChange={set("character_age")} />
        </label>
      </div>
      <label className="block text-sm text-muted">한줄 소개(카드 표시)
        <input className="input mt-1" value={f.persona} onChange={set("persona")} />
      </label>
      <label className="block text-sm text-muted">태그(쉼표)
        <input className="input mt-1" value={f.tags} onChange={set("tags")} />
      </label>
      <label className="block text-sm text-muted">외형(이미지 프롬프트 베이스 = canon.appearance)
        <input className="input mt-1" value={f.appearance_desc} onChange={set("appearance_desc")} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-muted">배경(backstory)
          <input className="input mt-1" value={f.backstory} onChange={set("backstory")} />
        </label>
        <label className="text-sm text-muted">관계(relationships)
          <input className="input mt-1" value={f.relationships} onChange={set("relationships")} />
        </label>
        <label className="text-sm text-muted">말투(voice.register)
          <input className="input mt-1" value={f.register} onChange={set("register")} />
        </label>
        <label className="text-sm text-muted">언어(voice.language)
          <input className="input mt-1" value={f.language} onChange={set("language")} />
        </label>
      </div>
      <label className="block text-sm text-muted">버릇(tics, 세미콜론 구분)
        <input className="input mt-1" value={f.tics} onChange={set("tics")} />
      </label>
      <label className="block text-sm text-muted">경계(boundaries, 줄바꿈)
        <textarea className="input mt-1" rows={3} value={f.boundaries} onChange={set("boundaries")} />
      </label>
      <label className="block text-sm text-muted">불변 사실(canon_facts, 줄바꿈)
        <textarea className="input mt-1" rows={3} value={f.canon_facts} onChange={set("canon_facts")} />
      </label>
      <label className="block text-sm text-muted">시스템 프롬프트
        <textarea required className="input mt-1" rows={3} value={f.system_prompt} onChange={set("system_prompt")} />
      </label>

      {msg && <p className="text-sm text-primary">{msg}</p>}
      <button disabled={saving} className="btn-primary">{saving ? "저장 중…" : "프로필 저장"}</button>
    </form>
  );
}

// ---------- 스토리라인 관리 ----------
export function ScenarioManager({ botId, scenarios }: { botId: string; scenarios: any[] }) {
  const reload = useReload();
  const [adding, setAdding] = useState(false);

  async function del(id: string) {
    if (!confirm("이 시나리오를 삭제할까요? (진행 중 세션은 영향 없음)")) return;
    await fetch("/api/admin/scenarios", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    reload();
  }
  async function togglePub(id: string, cur: boolean) {
    await fetch("/api/admin/scenarios", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, is_published: !cur }),
    });
    reload();
  }

  return (
    <div className="space-y-3">
      {scenarios.map((s) => (
        <ScenarioRow key={s.id} s={s} onDelete={() => del(s.id)} onTogglePub={() => togglePub(s.id, s.is_published)} />
      ))}
      {scenarios.length === 0 && <p className="text-muted">시나리오가 없습니다.</p>}

      {adding ? (
        <ScenarioAddForm botId={botId} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button onClick={() => setAdding(true)} className="btn-primary">+ 시나리오 추가</button>
      )}
    </div>
  );
}

function ScenarioRow({ s, onDelete, onTogglePub }: { s: any; onDelete: () => void; onTogglePub: () => void }) {
  const reload = useReload();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    title: s.title,
    description: s.description,
    detail: s.detail ?? "",
    tags: (s.tags ?? []).join(", "),
    intensity: s.intensity ?? 2,
    scenario: s.scenario,
    greeting: s.greeting,
  });

  async function save() {
    const body = {
      id: s.id,
      title: f.title,
      description: f.description,
      detail: f.detail,
      tags: f.tags.split(",").map((t: string) => t.trim()).filter(Boolean),
      intensity: Number(f.intensity),
      scenario: f.scenario,
      greeting: f.greeting,
    };
    const res = await fetch("/api/admin/scenarios", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { setEdit(false); reload(); }
  }

  if (edit) {
    return (
      <div className="card space-y-2">
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="제목" />
        <input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="간략 훅(요약)" />
        <textarea className="input" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="구체적 상황(선택 카드 노출)" />
        <div className="flex gap-2">
          <input className="input flex-1" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="태그(쉼표 구분)" />
          <select className="input w-24" value={f.intensity} onChange={(e) => setF({ ...f, intensity: Number(e.target.value) })}>
            <option value={1}>🔥 1</option>
            <option value={2}>🔥 2</option>
            <option value={3}>🔥 3</option>
          </select>
        </div>
        <textarea className="input" value={f.scenario} onChange={(e) => setF({ ...f, scenario: e.target.value })} placeholder="세계관/상황(시스템 주입)" />
        <textarea className="input" value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} placeholder="첫 인사" />
        <div className="flex gap-2">
          <button onClick={save} className="btn-primary text-xs">저장</button>
          <button onClick={() => setEdit(false)} className="btn-ghost text-xs">취소</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <span className="font-medium">{s.title}</span>{" "}
        <span className="text-xs text-muted">· {s.is_published ? "공개" : "비공개"}</span>
        <p className="truncate text-xs text-muted">{s.description}</p>
      </div>
      <div className="flex shrink-0 gap-2 text-xs">
        <button onClick={() => setEdit(true)} className="btn-ghost">편집</button>
        <button onClick={onTogglePub} className="btn-ghost">{s.is_published ? "비공개" : "공개"}</button>
        <button onClick={onDelete} className="btn-ghost text-danger">삭제</button>
      </div>
    </div>
  );
}

function ScenarioAddForm({ botId, onDone, onCancel }: { botId: string; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: "", description: "", detail: "", tags: "", intensity: 2, scenario: "", greeting: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        botProfileId: botId,
        title: f.title,
        description: f.description,
        detail: f.detail,
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
        intensity: Number(f.intensity),
        scenario: f.scenario,
        greeting: f.greeting,
      }),
    });
    if (res.ok) onDone();
  }
  return (
    <form onSubmit={submit} className="card space-y-2">
      <input required className="input" placeholder="제목" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <input required className="input" placeholder="간략 훅(요약)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <textarea className="input" placeholder="구체적 상황(선택 카드 노출)" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="태그(쉼표 구분)" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        <select className="input w-24" value={f.intensity} onChange={(e) => setF({ ...f, intensity: Number(e.target.value) })}>
          <option value={1}>🔥 1</option>
          <option value={2}>🔥 2</option>
          <option value={3}>🔥 3</option>
        </select>
      </div>
      <textarea required className="input" placeholder="세계관/상황(성인 설정, 시스템 주입)" value={f.scenario} onChange={(e) => setF({ ...f, scenario: e.target.value })} />
      <textarea required className="input" placeholder="첫 인사(오프닝)" value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} />
      <div className="flex gap-2">
        <button className="btn-primary text-xs">등록</button>
        <button type="button" onClick={onCancel} className="btn-ghost text-xs">취소</button>
      </div>
    </form>
  );
}

// ---------- 이미지 DB 관리 ----------
const CATS = [
  { key: "avatar", label: "대표(아바타)" },
  { key: "collection", label: "컬렉션" },
  { key: "scene", label: "씬" },
] as const;

export function ImageManager({ botId, images }: { botId: string; images: any[] }) {
  const reload = useReload();
  const [cat, setCat] = useState<string>("avatar");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upload(file: File) {
    setMsg(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("botProfileId", botId);
    fd.append("category", cat);
    if (cat === "collection" && location.trim()) fd.append("location", location.trim());
    const res = await fetch("/api/admin/images", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) { setMsg("업로드됨 — 검수(승인) 후 노출됩니다."); reload(); }
    else {
      const d = await res.json().catch(() => ({}));
      setMsg({ unsupported_type: "png/jpeg/webp만 허용", content_mismatch: "파일 내용이 형식과 불일치", too_large: "8MB 초과", blocked_label: "파일명/라벨 차단" }[d.error as string] ?? "업로드 실패");
    }
  }

  async function patch(id: string, body: any) {
    await fetch("/api/admin/images", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    reload();
  }
  async function del(id: string) {
    if (!confirm("이미지를 삭제할까요?")) return;
    await fetch("/api/admin/images", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    reload();
  }

  return (
    <div className="space-y-5">
      {/* 업로드 */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {CATS.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)} className={cat === c.key ? "chip-on" : "chip-off"}>
              {c.label}
            </button>
          ))}
          {cat === "collection" && (
            <input className="input max-w-[160px]" placeholder="위치(예: 침실)" value={location} onChange={(e) => setLocation(e.target.value)} />
          )}
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }}
          className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-white"
        />
        <p className="text-xs text-subtle">png/jpeg/webp · 최대 8MB · SVG/GIF 금지. 업로드 후 <b>검수(승인)</b> 전까지 미노출.</p>
        {msg && <p className="text-sm text-primary">{msg}</p>}
      </div>

      {/* 카테고리별 그리드 */}
      {CATS.map((c) => {
        const list = images.filter((i) => i.category === c.key);
        if (!list.length) return null;
        return (
          <div key={c.key}>
            <h3 className="mb-2 text-sm font-semibold text-text">{c.label} ({list.length})</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {list.map((im) => (
                <div key={im.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" className="aspect-square w-full object-cover" />
                  <div className="space-y-1 p-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className={im.review_status === "approved" ? "text-green-400" : im.review_status === "rejected" ? "text-danger" : "text-gold"}>
                        {im.review_status}{im.is_primary ? " · 대표" : ""}{im.location ? ` · ${im.location}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {im.review_status !== "approved" && <button onClick={() => patch(im.id, { review_status: "approved" })} className="rounded bg-green-700/40 px-1.5 py-0.5 text-green-300">승인</button>}
                      {im.review_status !== "rejected" && <button onClick={() => patch(im.id, { review_status: "rejected" })} className="rounded bg-danger/30 px-1.5 py-0.5 text-red-300">반려</button>}
                      {c.key === "avatar" && im.review_status === "approved" && !im.is_primary && <button onClick={() => patch(im.id, { is_primary: true })} className="rounded bg-surface3 px-1.5 py-0.5">대표</button>}
                      <button onClick={() => del(im.id)} className="rounded bg-surface3 px-1.5 py-0.5 text-danger">삭제</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {images.length === 0 && <p className="text-muted">등록된 이미지가 없습니다.</p>}
    </div>
  );
}
