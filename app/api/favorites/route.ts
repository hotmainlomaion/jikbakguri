// POST /api/favorites — 즐겨찾기 토글 (F39).
// 게이트 → published 봇 확인 → 있으면 삭제/없으면 추가. 본인 소유만 조작(명시적 user_id).
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { botProfileId } = await req.json().catch(() => ({}));
  if (!botProfileId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("id")
    .eq("id", botProfileId)
    .eq("is_published", true)
    .single();
  if (!bot) return NextResponse.json({ error: "bot_not_found" }, { status: 404 });

  // 현재 상태 확인 후 토글.
  const { data: existing } = await admin
    .from("favorites")
    .select("bot_profile_id")
    .eq("user_id", gate.userId)
    .eq("bot_profile_id", botProfileId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("favorites")
      .delete()
      .eq("user_id", gate.userId)
      .eq("bot_profile_id", botProfileId);
    return NextResponse.json({ favorited: false });
  }
  await admin.from("favorites").insert({ user_id: gate.userId, bot_profile_id: botProfileId });
  return NextResponse.json({ favorited: true });
}
