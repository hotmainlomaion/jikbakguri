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

// 이미지: 사용자당 일일 상한.
export async function checkDailyImageLimit(userId: string): Promise<boolean> {
  const limit = Number(process.env.DAILY_IMAGE_LIMIT ?? 5);
  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from("images")
    .select("id, sessions!inner(user_id)", { count: "exact", head: true })
    .eq("sessions.user_id", userId)
    .gte("created_at", startOfDay.toISOString());
  return (count ?? 0) < limit;
}
