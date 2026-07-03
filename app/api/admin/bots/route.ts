// 운영자 봇 CRUD. character_age >= 18 은 DB CHECK + assertAdultCanon 이중 강제(7-C).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdultCanon } from "@/lib/persona/core";
import type { PersonaCanon } from "@/lib/persona/types";

// canon 조립(POST/PATCH 공용). character_age를 SSOT로 canon.identity.age에 강제 동기화 →
// 클라가 canon.identity.age를 미성년으로 조작해도 character_age(>=18 CHECK)가 덮어씀(우회 차단).
function buildCanon(b: any, age: number): PersonaCanon {
  const base: PersonaCanon =
    b.canon && typeof b.canon === "object"
      ? (b.canon as PersonaCanon)
      : {
          identity: { name: b.name, age, backstory: b.persona ?? "" },
          voice: { register: b.persona ?? "", tics: [], language: "ko" },
          appearance: b.appearance_desc ?? "",
          boundaries: ["성인(18+) 캐릭터로만 행동", "미성년 역할·묘사 금지", "비동의/착취 묘사 금지"],
          canon_facts: [`이름은 ${b.name}`, `성인(${age}세)`],
        };
  // 나이 SSOT 동기화(클라 canon 조작 방어).
  base.identity = { ...base.identity, age };
  return base;
}

function normTags(tags: unknown): string[] {
  return Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
    : [];
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.name || !b.system_prompt) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const age = Number(b.character_age);
  if (!Number.isFinite(age) || age < 18) return NextResponse.json({ error: "underage" }, { status: 422 });

  const canon = buildCanon(b, age);
  try {
    assertAdultCanon(canon); // 미성년 canon 주입 차단
  } catch {
    return NextResponse.json({ error: "underage" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("bot_profiles").insert({
    name: b.name,
    persona: b.persona ?? "",
    appearance_desc: b.appearance_desc ?? "",
    system_prompt: b.system_prompt,
    character_age: age,
    is_published: false,
    created_by: gate.userId,
    canon,
    tags: normTags(b.tags),
  });
  if (error) return NextResponse.json({ error: "underage" }, { status: 422 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();

  // 공개 토글만 온 경우(기존 동작 유지).
  const onlyPublish =
    Object.keys(b).filter((k) => k !== "id").length === 1 && "is_published" in b;
  if (onlyPublish) {
    await admin.from("bot_profiles").update({ is_published: !!b.is_published }).eq("id", b.id);
    return NextResponse.json({ ok: true });
  }

  // 필드 편집. 화이트리스트만 반영.
  const patch: Record<string, any> = {};
  if (b.name !== undefined) patch.name = String(b.name).slice(0, 120);
  if (b.persona !== undefined) patch.persona = String(b.persona).slice(0, 2000);
  if (b.appearance_desc !== undefined) patch.appearance_desc = String(b.appearance_desc).slice(0, 2000);
  if (b.system_prompt !== undefined) patch.system_prompt = String(b.system_prompt).slice(0, 8000);
  if (b.tags !== undefined) patch.tags = normTags(b.tags);
  if (b.is_published !== undefined) patch.is_published = !!b.is_published;

  // 나이/캐논 편집: character_age >= 18 강제 + canon 나이 동기화 + assertAdultCanon.
  let age: number | undefined;
  if (b.character_age !== undefined) {
    age = Number(b.character_age);
    if (!Number.isFinite(age) || age < 18) return NextResponse.json({ error: "underage" }, { status: 422 });
    patch.character_age = age;
  }

  if (b.canon !== undefined || age !== undefined) {
    // 현재 값 로드해 병합 기준 확보.
    const { data: cur } = await admin
      .from("bot_profiles")
      .select("canon, character_age, name, persona, appearance_desc")
      .eq("id", b.id)
      .single();
    if (!cur) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const effAge = age ?? cur.character_age;
    const canon = buildCanon(
      { canon: b.canon ?? cur.canon, name: patch.name ?? cur.name, persona: patch.persona ?? cur.persona, appearance_desc: patch.appearance_desc ?? cur.appearance_desc },
      effAge
    );
    try {
      assertAdultCanon(canon);
    } catch {
      return NextResponse.json({ error: "underage" }, { status: 422 });
    }
    patch.canon = canon;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // canon/system_prompt/appearance_desc 변경은 bump_persona_version 트리거가 자동 처리(수동 증가 금지).
  const { error } = await admin.from("bot_profiles").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "underage" }, { status: 422 });
  return NextResponse.json({ ok: true });
}
