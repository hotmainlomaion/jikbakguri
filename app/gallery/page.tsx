// S4. 홈/갤러리 — TopToon Chat 스타일. 서버 게이트 + 데이터 로드 후 클라이언트 렌더.
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStats } from "@/components/ui";
import { signAvatars } from "@/lib/images/serve";
import { GalleryClient, type GalleryBot } from "./gallery-client";

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
        .select("id, name, persona, character_age, tags")
        .eq("is_published", true)
        .order("created_at", { ascending: true }),
      admin
        .from("scenarios")
        .select("id, bot_profile_id, title, description")
        .eq("is_published", true)
        .order("created_at", { ascending: true }),
      // F39 즐겨찾기(본인)
      admin.from("favorites").select("bot_profile_id").eq("user_id", gate.userId),
      // F39 이어하기: 최근 활동 세션(본인)
      admin
        .from("sessions")
        .select("id, last_active_at, bot_profiles(name, tags)")
        .eq("user_id", gate.userId)
        .order("last_active_at", { ascending: false })
        .limit(8),
    ]);

  const scByBot = new Map<string, GalleryBot["scenarios"]>();
  for (const s of scenarios ?? []) {
    const arr = scByBot.get(s.bot_profile_id) ?? [];
    arr.push({ id: s.id, title: s.title, description: s.description });
    scByBot.set(s.bot_profile_id, arr);
  }

  const avatars = await signAvatars((bots ?? []).map((b: any) => b.id));

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
    };
  });

  const favoriteIds = (favs ?? []).map((f: any) => f.bot_profile_id);
  const continueList = (recentSessions ?? []).map((s: any) => ({
    sessionId: s.id,
    name: s.bot_profiles?.name ?? "AI",
    tag: s.bot_profiles?.tags?.[0] ?? "",
    lastActive: s.last_active_at,
  }));

  return <GalleryClient bots={data} favoriteIds={favoriteIds} continueList={continueList} />;
}
