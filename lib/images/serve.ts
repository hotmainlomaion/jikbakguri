// ============================================================
// lib/images/serve.ts — 캐릭터 이미지 서명URL 발급(서버 전용).
// service_role는 RLS를 우회하므로, 여기 쿼리의 approved + published 필터가 노출의 실질 통제선이다.
// (RLS는 심층 방어.) 반드시 requireVerifiedUser 게이트 뒤 서버에서만 호출 → 인증 전 노출 0.
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "character-images";
// 목록/아바타 서명URL TTL. 이전 300초(5분)는 너무 짧아, 챗→홈 소프트 내비 시 라우터 캐시된
// RSC의 서명URL이 만료되어 이미지가 안 뜨는 버그가 있었다(하드 새로고침해야 복구). 1시간으로 연장.
const AVATAR_TTL = 3600;

export type ServedImage = {
  id: string;
  category: "avatar" | "collection" | "scene";
  location: string | null;
  url: string;
  width: number | null;
  height: number | null;
};

// 여러 봇의 대표 아바타 서명URL 배치 발급 → Map<botId, url>. (갤러리 N+1 제거)
export async function signAvatars(botIds: string[], ttl = AVATAR_TTL): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!botIds.length) return out;
  const admin = createAdminClient();

  const { data } = await admin
    .from("character_images")
    .select("bot_profile_id, storage_path, bot_profiles!inner(is_published)")
    .in("bot_profile_id", botIds)
    .eq("category", "avatar")
    .eq("is_primary", true)
    .eq("review_status", "approved") // approved 만
    .eq("bot_profiles.is_published", true); // published 만 (RLS 우회 대비 실질 통제)

  const rows = (data ?? []) as any[];
  if (!rows.length) return out;

  const paths = rows.map((r) => r.storage_path);
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrls(paths, ttl);
  const pathToUrl = new Map<string, string>();
  for (const s of signed ?? []) if (s.signedUrl) pathToUrl.set(s.path!, s.signedUrl);

  for (const r of rows) {
    const url = pathToUrl.get(r.storage_path);
    if (url) out.set(r.bot_profile_id, url);
  }
  return out;
}

// 여러 봇의 히어로 배너(와이드) 서명URL 배치 발급 → Map<botId, url>. 없으면 미포함(호출부에서 아바타 폴백).
export async function signHeroes(botIds: string[], ttl = AVATAR_TTL): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!botIds.length) return out;
  const admin = createAdminClient();

  const { data } = await admin
    .from("character_images")
    .select("bot_profile_id, storage_path, bot_profiles!inner(is_published)")
    .in("bot_profile_id", botIds)
    .eq("category", "hero")
    .eq("is_primary", true)
    .eq("review_status", "approved")
    .eq("bot_profiles.is_published", true);

  const rows = (data ?? []) as any[];
  if (!rows.length) return out;

  const paths = rows.map((r) => r.storage_path);
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrls(paths, ttl);
  const pathToUrl = new Map<string, string>();
  for (const s of signed ?? []) if (s.signedUrl) pathToUrl.set(s.path!, s.signedUrl);

  for (const r of rows) {
    const url = pathToUrl.get(r.storage_path);
    if (url) out.set(r.bot_profile_id, url);
  }
  return out;
}

// 단일 봇의 프로필 미디어: 대표 아바타 URL + 컬렉션 location별 approved 개수.
export async function getProfileMedia(
  botId: string
): Promise<{ avatarUrl: string | null; collectionCounts: Record<string, number> }> {
  const admin = createAdminClient();

  // published 확인(비공개 봇 이미지 비노출). 단 커스텀 봇은 avatar_path(generated-images)에서 직접 서빙.
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("is_published, is_custom, avatar_path")
    .eq("id", botId)
    .single();
  if (bot?.is_custom) {
    let avatarUrl: string | null = null;
    if (bot.avatar_path) {
      const { data: signed } = await admin.storage.from("generated-images").createSignedUrl(bot.avatar_path, AVATAR_TTL);
      avatarUrl = signed?.signedUrl ?? null;
    }
    return { avatarUrl, collectionCounts: {} };
  }
  if (!bot?.is_published) return { avatarUrl: null, collectionCounts: {} };

  const { data: imgs } = await admin
    .from("character_images")
    .select("storage_path, category, location, is_primary")
    .eq("bot_profile_id", botId)
    .eq("review_status", "approved");

  const rows = (imgs ?? []) as any[];

  // 아바타 서명URL.
  const avatarRow = rows.find((r) => r.category === "avatar" && r.is_primary);
  let avatarUrl: string | null = null;
  if (avatarRow) {
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(avatarRow.storage_path, AVATAR_TTL);
    avatarUrl = signed?.signedUrl ?? null;
  }

  // 컬렉션 location별 개수.
  const collectionCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.category === "collection" && r.location) {
      collectionCounts[r.location] = (collectionCounts[r.location] ?? 0) + 1;
    }
  }

  return { avatarUrl, collectionCounts };
}

// 운영자 콘솔용: 특정 봇의 모든 이미지(검수 상태 무관) 서명URL. requireAdmin 뒤에서만 호출할 것.
export async function signAllForAdmin(botId: string, ttl = 900): Promise<
  (ServedImage & { review_status: string; is_primary: boolean; sort_order: number })[]
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("character_images")
    .select("id, category, location, storage_path, width, height, review_status, is_primary, sort_order")
    .eq("bot_profile_id", botId)
    .order("category")
    .order("sort_order");
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];
  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), ttl);
  const pathToUrl = new Map<string, string>();
  for (const s of signed ?? []) if (s.signedUrl) pathToUrl.set(s.path!, s.signedUrl);
  return rows
    .map((r) => ({
      id: r.id,
      category: r.category,
      location: r.location,
      url: pathToUrl.get(r.storage_path) ?? "",
      width: r.width,
      height: r.height,
      review_status: r.review_status,
      is_primary: r.is_primary,
      sort_order: r.sort_order,
    }))
    .filter((r) => r.url);
}
