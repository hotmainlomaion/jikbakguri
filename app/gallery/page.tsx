// S4. 홈/갤러리 — TopToon Chat 스타일. 서버 게이트 + 데이터 로드 후 클라이언트 렌더.
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStats } from "@/components/ui";
import { GalleryClient, type GalleryBot } from "./gallery-client";

export default async function GalleryPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const [{ data: bots }, { data: scenarios }] = await Promise.all([
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
  ]);

  const scByBot = new Map<string, GalleryBot["scenarios"]>();
  for (const s of scenarios ?? []) {
    const arr = scByBot.get(s.bot_profile_id) ?? [];
    arr.push({ id: s.id, title: s.title, description: s.description });
    scByBot.set(s.bot_profile_id, arr);
  }

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
    };
  });

  return <GalleryClient bots={data} />;
}
