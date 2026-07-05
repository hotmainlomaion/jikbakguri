// POST /api/session — 봇 선택 → 세션 생성 (S4→S5).
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinPersonaSnapshot } from "@/lib/persona/core";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { botProfileId, scenarioId } = await req.json().catch(() => ({}));
  if (!botProfileId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  // published 봇 또는 '소유자의 커스텀 봇'만 세션 시작 허용(커스텀은 비공개).
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("id, is_published, is_custom, created_by")
    .eq("id", botProfileId)
    .single();
  if (!bot || (!bot.is_published && !(bot.is_custom && bot.created_by === gate.userId)))
    return NextResponse.json({ error: "bot_not_found" }, { status: 404 });

  const { data: session, error } = await admin
    .from("sessions")
    .insert({ user_id: gate.userId, bot_profile_id: botProfileId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  // 캐논+시나리오를 세션에 고정(일관성 핀). 미성년 캐논이면 assertAdultCanon throw → 세션 폐기.
  let greeting: string | null = null;
  try {
    ({ greeting } = await pinPersonaSnapshot(session.id, botProfileId, scenarioId ?? null));
  } catch {
    await admin.from("sessions").delete().eq("id", session.id);
    return NextResponse.json({ error: "persona_rejected" }, { status: 422 });
  }

  // 오프닝: 운영자 큐레이션 greeting을 첫 assistant 메시지로 시드 → 스토리 안에서 시작.
  if (greeting) {
    await admin.from("messages").insert({
      session_id: session.id,
      role: "assistant",
      content: greeting,
    });
  }

  return NextResponse.json({ sessionId: session.id });
}
