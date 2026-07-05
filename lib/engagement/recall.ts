// ============================================================
// lib/engagement/recall.ts — F09 오늘의 회상(서버 전용).
// 기존 messages/images 로만 도출(신규 수집 없음, §7-D). 재진입 시 "우리의 추억" 카드로
// 과거를 감정적으로 재점화한다. requireVerifiedUser 게이트 뒤 서버에서만 호출.
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";

const GEN_BUCKET = "generated-images";
const RECALL_TTL = 300;

export type Recall = {
  daysSince: number; // 처음 만난 날로부터 경과일
  firstMetLabel: string; // "3일 전 처음 만난 날"
  messageCount: number;
  imageUrl: string | null; // 과거 생성 이미지 1장(있으면)
};

// 회상 카드 데이터. 히스토리가 충분치 않거나 방금 시작한 세션이면 null(카드 미노출).
export async function getRecall(sessionId: string): Promise<Recall | null> {
  const admin = createAdminClient();

  const { data: first } = await admin
    .from("messages")
    .select("created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first?.created_at) return null;

  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  const messageCount = count ?? 0;
  // 방금 만든 세션(오프닝 인사만/짧은 대화)엔 회상할 게 없다.
  if (messageCount < 6) return null;

  const firstMs = new Date(first.created_at).getTime();
  const daysSince = Math.max(0, Math.floor((Date.now() - firstMs) / 86_400_000));

  // 과거 생성 이미지 1장(가장 최근, 미만료). 없으면 텍스트 회상만.
  let imageUrl: string | null = null;
  const nowIso = new Date().toISOString();
  const { data: img } = await admin
    .from("images")
    .select("storage_path")
    .eq("session_id", sessionId)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (img?.storage_path) {
    const { data: signed } = await admin.storage
      .from(GEN_BUCKET)
      .createSignedUrl(img.storage_path, RECALL_TTL);
    imageUrl = signed?.signedUrl ?? null;
  }

  const firstMetLabel = daysSince <= 0 ? "오늘 처음 만난 날" : `${daysSince}일 전 처음 만난 날`;
  return { daysSince, firstMetLabel, messageCount, imageUrl };
}
