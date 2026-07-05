// POST /api/plot/session — 플롯(멀티 캐릭터)으로 세션 시작. 사용자 주인공(이름/성별/소개) 설정.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { plotId, protagonist } = await req.json().catch(() => ({}));
  if (!plotId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: plot } = await admin
    .from("plots")
    .select("id, is_published, created_by, opening, cover_bot_profile_id")
    .eq("id", plotId)
    .single();
  if (!plot || (!plot.is_published && plot.created_by !== gate.userId))
    return NextResponse.json({ error: "plot_not_found" }, { status: 404 });

  const proto = {
    name: String(protagonist?.name ?? "").trim().slice(0, 30) || "나",
    gender: (protagonist?.gender as string) || null,
    intro: String(protagonist?.intro ?? "").trim().slice(0, 1000) || null,
  };

  // sessions.bot_profile_id(NOT NULL 호환)는 대표 캐릭터로. 없으면 첫 멤버.
  let coverBot = plot.cover_bot_profile_id as string | null;
  if (!coverBot) {
    const { data: m } = await admin
      .from("plot_members")
      .select("bot_profile_id")
      .eq("plot_id", plotId)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    coverBot = m?.bot_profile_id ?? null;
  }
  if (!coverBot) return NextResponse.json({ error: "plot_empty" }, { status: 400 });

  const { data: session, error } = await admin
    .from("sessions")
    .insert({ user_id: gate.userId, plot_id: plotId, bot_profile_id: coverBot, protagonist: proto })
    .select("id")
    .single();
  if (error || !session) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  // 오프닝 지문을 첫 assistant 메시지로 시드(스토리 시작점).
  if (plot.opening)
    await admin.from("messages").insert({ session_id: session.id, role: "assistant", content: plot.opening });

  return NextResponse.json({ sessionId: session.id });
}
