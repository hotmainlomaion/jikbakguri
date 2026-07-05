// S4. 홈/갤러리 — TopToon Chat 스타일. 서버 게이트 + 데이터 로드 후 클라이언트 렌더.
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStats } from "@/components/ui";
import { signAvatars, signHeroes } from "@/lib/images/serve";
import { getWallet } from "@/lib/economy";
import { GalleryClient, type GalleryBot } from "./gallery-client";

// 항상 최신 데이터로 렌더(신규 공개 프로필·아바타·시나리오 즉시 반영) + useSearchParams(?view) 지원.
export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const [{ data: bots }, { data: scenarios }, { data: favs }, { data: recentSessions }] =
    await Promise.all([
      admin
        .from("bot_profiles")
        .select("id, name, persona, hero_hook, character_age, tags")
        .eq("is_published", true)
        .order("created_at", { ascending: true }),
      admin
        .from("scenarios")
        .select("id, bot_profile_id, title, description, detail, tags, intensity, sort_order")
        .eq("is_published", true)
        .order("sort_order", { ascending: true }),
      // F39 즐겨찾기(본인)
      admin.from("favorites").select("bot_profile_id").eq("user_id", gate.userId),
      // F39 이어하기 + F02 선톡 배지: 최근 활동 세션(본인). 배지는 비정규화 플래그로 N+1 제거(#14).
      admin
        .from("sessions")
        .select("id, bot_profile_id, last_active_at, last_message_is_proactive, bot_profiles(name, tags)")
        .eq("user_id", gate.userId)
        .order("last_active_at", { ascending: false })
        .limit(8),
    ]);

  const scByBot = new Map<string, GalleryBot["scenarios"]>();
  for (const s of scenarios ?? []) {
    const arr = scByBot.get(s.bot_profile_id) ?? [];
    arr.push({
      id: s.id,
      title: s.title,
      description: s.description,
      detail: s.detail ?? null,
      tags: s.tags ?? [],
      intensity: s.intensity ?? 2,
    });
    scByBot.set(s.bot_profile_id, arr);
  }

  const botIds = (bots ?? []).map((b: any) => b.id);
  const [avatars, heroes, wallet] = await Promise.all([
    signAvatars(botIds),
    signHeroes(botIds),
    getWallet(gate.userId), // 크레딧 잔액 + 멤버십 티어(헤더 표시)
  ]);

  const data: GalleryBot[] = (bots ?? []).map((b: any) => {
    const st = mockStats(b.id);
    return {
      id: b.id,
      name: b.name,
      quote: b.persona,
      tags: b.tags ?? [],
      characterAge: b.character_age,
      views: st.views,
      comments: st.comments,
      likes: st.likes,
      isNew: st.isNew,
      rankScore: st.rankScore,
      scenarioCount: (scByBot.get(b.id) ?? []).length,
      scenarios: scByBot.get(b.id) ?? [],
      avatarUrl: avatars.get(b.id) ?? null,
      heroUrl: heroes.get(b.id) ?? null,
      heroHook: b.hero_hook ?? null,
    };
  });

  const favoriteIds = (favs ?? []).map((f: any) => f.bot_profile_id);

  // 이어하기 썸네일: 세션별 '마지막 생성 이미지'(만료 전) → 없으면 캐릭터 대표컷 → 없으면 이니셜.
  const sessIds = (recentSessions ?? []).map((s: any) => s.id);
  const thumbBySession = new Map<string, string>();
  if (sessIds.length) {
    const { data: imgs } = await admin
      .from("images")
      .select("session_id, storage_path, created_at, expires_at")
      .in("session_id", sessIds)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    const latestPath = new Map<string, string>(); // 세션별 최신 1장만
    for (const im of (imgs ?? []) as any[]) if (!latestPath.has(im.session_id)) latestPath.set(im.session_id, im.storage_path);
    const paths = [...latestPath.values()];
    if (paths.length) {
      const { data: signed } = await admin.storage.from("generated-images").createSignedUrls(paths, 300);
      const pathToUrl = new Map<string, string>();
      for (const s of signed ?? []) if (s.signedUrl) pathToUrl.set(s.path!, s.signedUrl);
      for (const [sid, p] of latestPath) { const u = pathToUrl.get(p); if (u) thumbBySession.set(sid, u); }
    }
  }

  // F02 선톡 배지: 세션의 비정규화 플래그를 그대로 사용(개별 messages 쿼리 없음, #14).
  const continueList = (recentSessions ?? []).map((s: any) => ({
    sessionId: s.id,
    name: s.bot_profiles?.name ?? "AI",
    tag: s.bot_profiles?.tags?.[0] ?? "",
    lastActive: s.last_active_at,
    hasProactive: !!s.last_message_is_proactive,
    thumb: thumbBySession.get(s.id) ?? avatars.get(s.bot_profile_id) ?? null, // 생성이미지 → 대표컷 → null
  }));

  return <GalleryClient bots={data} favoriteIds={favoriteIds} continueList={continueList} wallet={wallet} />;
}
