// DELETE /api/account — 탈퇴 시 데이터 완전 삭제 (7-D).
// 스토리지 이미지 + auth 사용자 삭제. public 테이블은 on delete cascade로 함께 삭제됨.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const admin = createAdminClient();

  // 1) 사용자의 생성 이미지 스토리지 삭제.
  const { data: imgs } = await admin
    .from("images")
    .select("storage_path, sessions!inner(user_id)")
    .eq("sessions.user_id", gate.userId);
  const paths = (imgs ?? []).map((i: any) => i.storage_path);
  if (paths.length) await admin.storage.from("generated-images").remove(paths);

  // 2) auth 사용자 삭제 → public.users cascade → sessions/messages/images/age_verifications 삭제.
  const { error } = await admin.auth.admin.deleteUser(gate.userId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
