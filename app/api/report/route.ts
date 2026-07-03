// POST /api/report — 사용자 신고 (섹션 6, 컴플라이언스 필수).
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { sessionId, messageId, reason } = await req.json().catch(() => ({}));
  if (typeof reason !== "string" || !reason.trim())
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("reports").insert({
    reporter_id: gate.userId,
    session_id: sessionId ?? null,
    message_id: messageId ?? null,
    reason: reason.slice(0, 1000),
  });
  return NextResponse.json({ ok: true });
}
