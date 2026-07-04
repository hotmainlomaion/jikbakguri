// DELETE /api/account — 탈퇴 시 데이터 완전 삭제 (7-D).
// 스토리지 이미지 → auth 사용자 순으로 삭제. public 테이블은 on delete cascade로 함께 삭제됨.
// 감사 #1: 스토리지 삭제를 페이지네이션으로 전량 수집하고 remove 결과를 검사한 뒤에만
//          deleteUser를 실행한다(스토리지 성공 → DB/auth 삭제). 부분 실패 시 500 + 미실행.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "generated-images";
const PAGE = 1000;

export async function DELETE() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const admin = createAdminClient();

  // 1) 사용자의 생성 이미지 스토리지 경로를 전량 수집(1000행 기본 한도 → range로 반복).
  const paths: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("images")
      .select("storage_path, sessions!inner(user_id)")
      .eq("sessions.user_id", gate.userId)
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    const batch = (data ?? []) as any[];
    for (const i of batch) if (i.storage_path) paths.push(i.storage_path);
    if (batch.length < PAGE) break;
  }

  // 2) 스토리지 객체 삭제(청크). 실패 시 중단 → deleteUser 미실행(고아 방지). 성공해야 다음 단계.
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + PAGE));
    if (error) return NextResponse.json({ error: "storage_delete_failed" }, { status: 500 });
  }

  // 3) auth 사용자 삭제 → public.users cascade → sessions/messages/images/favorites/user_settings/
  //    image_quota/age_verifications 삭제(모두 on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(gate.userId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
