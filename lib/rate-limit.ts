// 서버단 rate limit / 일일 상한 (CLAUDE.md 4-D). 클라이언트 신뢰 금지.
// Supabase 테이블 기반(별도 Redis 불필요, 10명 규모).
import { createAdminClient } from "@/lib/supabase/admin";

// 채팅: 분당 요청 수 제한. (moderation_logs 대신 messages 카운트로 근사)
export async function checkChatRate(userId: string): Promise<boolean> {
  const perMin = Number(process.env.CHAT_RATE_PER_MIN ?? 20);
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("messages")
    .select("id, sessions!inner(user_id)", { count: "exact", head: true })
    .eq("role", "user")
    .eq("sessions.user_id", userId)
    .gte("created_at", since);
  return (count ?? 0) < perMin;
}

// 이미지: 사용자당 일일 상한 — 원자 예약(감사 #3·#4).
// 시도(attempt) 단위로 소모한다. 생성 성공분(images 행)이 아니라 예약을 세므로
// 차단/실패 프롬프트도 쿼터를 소모하고(비용 가드), consume_image_quota RPC의
// 조건부 원자 증가로 동시 요청 TOCTOU도 제거된다. 생성 전에 호출해 예약할 것.
// 반환 true=예약 성공(진행), false=한도 도달(차단).
export async function reserveImageQuota(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  // 무제한 화이트리스트(데모/테스트 계정) — 프로덕션 사용자엔 무영향. IMAGE_UNLIMITED_EMAILS=a@x,b@y.
  const unlimited = (process.env.IMAGE_UNLIMITED_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (unlimited.length) {
    const { data: u } = await admin.from("users").select("email").eq("id", userId).maybeSingle();
    if (u?.email && unlimited.includes(u.email.toLowerCase())) return true; // 상한 소모 없이 통과
  }
  const limit = Number(process.env.DAILY_IMAGE_LIMIT ?? 5);
  const { data, error } = await admin.rpc("consume_image_quota", { p_user: userId, p_limit: limit });
  if (error) return false; // 예약 실패 시 fail-closed(차단)
  return data === true;
}
