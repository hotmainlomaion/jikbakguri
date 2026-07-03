// 운영자 봇 CRUD. character_age >= 18 은 DB CHECK가 강제(7-C).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.name || !b.system_prompt) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (Number(b.character_age) < 18) return NextResponse.json({ error: "underage" }, { status: 422 });

  const admin = createAdminClient();
  const { error } = await admin.from("bot_profiles").insert({
    name: b.name,
    persona: b.persona ?? "",
    appearance_desc: b.appearance_desc ?? "",
    system_prompt: b.system_prompt,
    character_age: Number(b.character_age),
    is_published: false,
    created_by: gate.userId,
  });
  // DB CHECK 위반 등도 여기서 걸린다(우회 불가).
  if (error) return NextResponse.json({ error: "underage" }, { status: 422 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, is_published } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("bot_profiles").update({ is_published: !!is_published }).eq("id", id);
  return NextResponse.json({ ok: true });
}
