// POST /api/session — 봇 선택 → 세션 생성 (S4→S5).
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinPersonaSnapshot } from "@/lib/persona/core";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { botProfileId } = await req.json().catch(() => ({}));
  if (!botProfileId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  // published 봇만 세션 시작 허용.
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("id")
    .eq("id", botProfileId)
    .eq("is_published", true)
    .single();
  if (!bot) return NextResponse.json({ error: "bot_not_found" }, { status: 404 });

  const { data: session, error } = await admin
    .from("sessions")
    .insert({ user_id: gate.userId, bot_profile_id: botProfileId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  // 캐논을 세션에 고정(일관성 핀). 미성년 캐논이면 assertAdultCanon이 throw → 세션 폐기.
  try {
    await pinPersonaSnapshot(session.id, botProfileId);
  } catch {
    await admin.from("sessions").delete().eq("id", session.id);
    return NextResponse.json({ error: "persona_rejected" }, { status: 422 });
  }

  return NextResponse.json({ sessionId: session.id });
}
