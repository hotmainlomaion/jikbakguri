// DELETE /api/session/[sessionId] — 대화(세션) 삭제. 본인 소유만.
// messages/images DB 행은 FK on delete cascade로 함께 삭제되나, 스토리지 객체(생성 이미지)는
// 캐스케이드 대상이 아니므로 먼저 수동 삭제한다(7-D 완전 삭제 원칙).
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "generated-images";

export async function DELETE(_req: Request, { params }: { params: { sessionId: string } }) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const sessionId = params.sessionId;
  if (!sessionId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  // 소유권 확인(남의 세션 삭제 방지).
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== gate.userId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 1) 스토리지 생성 이미지 삭제(DB 캐스케이드가 지우지 않음).
  const { data: imgs } = await admin.from("images").select("storage_path").eq("session_id", sessionId);
  const paths = (imgs ?? []).map((i: any) => i.storage_path).filter(Boolean);
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);

  // 2) 세션 삭제 → messages / images DB 행 on delete cascade.
  const { error } = await admin.from("sessions").delete().eq("id", sessionId).eq("user_id", gate.userId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
