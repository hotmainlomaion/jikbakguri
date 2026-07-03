// S4. 봇 갤러리 — 태그 필터 + 캐릭터 카드(대표컷 플레이스홀더) → 시나리오 선택 → 채팅.
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const data: GalleryBot[] = (bots ?? []).map((b: any) => ({
    id: b.id,
    name: b.name,
    persona: b.persona,
    characterAge: b.character_age,
    tags: b.tags ?? [],
    scenarios: scByBot.get(b.id) ?? [],
  }));

  return <GalleryClient bots={data} />;
}
