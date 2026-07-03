// 운영자 시나리오 CRUD (스토리라인). 봇당 다중 시나리오 + 편집/삭제/정렬.
// 텍스트 필드는 시스템 프롬프트로 주입되므로 변경 시 heuristicScan 백스톱.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { heuristicScan } from "@/lib/moderation/categories";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const s = await req.json().catch(() => ({}));
  if (!s.botProfileId || !s.title || !s.scenario || !s.greeting)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const blob = `${s.title} ${s.description ?? ""} ${s.scenario} ${s.greeting}`;
  if (heuristicScan(blob)) return NextResponse.json({ error: "blocked" }, { status: 422 });

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("scenarios")
    .select("sort_order")
    .eq("bot_profile_id", s.botProfileId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("scenarios").insert({
    bot_profile_id: s.botProfileId,
    title: String(s.title).slice(0, 120),
    description: String(s.description ?? "").slice(0, 500),
    scenario: String(s.scenario).slice(0, 4000),
    greeting: String(s.greeting).slice(0, 2000),
    is_published: false,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  // 정렬 배치 업데이트.
  if (Array.isArray(b.items)) {
    for (const it of b.items) {
      if (it?.id) await admin.from("scenarios").update({ sort_order: Number(it.sort_order) | 0 }).eq("id", it.id);
    }
    return NextResponse.json({ ok: true });
  }

  if (!b.id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const patch: Record<string, any> = {};
  if (b.title !== undefined) patch.title = String(b.title).slice(0, 120);
  if (b.description !== undefined) patch.description = String(b.description).slice(0, 500);
  if (b.scenario !== undefined) patch.scenario = String(b.scenario).slice(0, 4000);
  if (b.greeting !== undefined) patch.greeting = String(b.greeting).slice(0, 2000);
  if (b.is_published !== undefined) patch.is_published = !!b.is_published;
  if (b.sort_order !== undefined) patch.sort_order = Number(b.sort_order) | 0;

  // 텍스트 변경 시 백스톱.
  const textBlob = [patch.title, patch.description, patch.scenario, patch.greeting]
    .filter(Boolean)
    .join(" ");
  if (textBlob && heuristicScan(textBlob))
    return NextResponse.json({ error: "blocked" }, { status: 422 });

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { error } = await admin.from("scenarios").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // 진행 세션은 scenario_snapshot(0004)으로 고정이라 삭제 안전.
  const admin = createAdminClient();
  await admin.from("scenarios").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
