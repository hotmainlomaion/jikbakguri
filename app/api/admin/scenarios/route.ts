// 운영자 시나리오 CRUD (스토리라인). 봇당 다중 시나리오.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const s = await req.json().catch(() => ({}));
  if (!s.botProfileId || !s.title || !s.scenario || !s.greeting)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("scenarios").insert({
    bot_profile_id: s.botProfileId,
    title: String(s.title).slice(0, 120),
    description: String(s.description ?? "").slice(0, 500),
    scenario: String(s.scenario).slice(0, 4000),
    greeting: String(s.greeting).slice(0, 2000),
    is_published: false,
  });
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, is_published } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("scenarios").update({ is_published: !!is_published }).eq("id", id);
  return NextResponse.json({ ok: true });
}
