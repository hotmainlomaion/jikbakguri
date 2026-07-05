// 커스텀 캐릭터 탭 — 내가 만든 AI 캐릭터 목록 + 새로 만들기(A안: 사진 없이 텍스트로 AI가 얼굴 생성).
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { CharacterClient, type CustomBot } from "./character-client";

export const dynamic = "force-dynamic";

export default async function CharacterPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: bots } = await admin
    .from("bot_profiles")
    .select("id, name, persona, character_age, image_style, avatar_path, created_at")
    .eq("is_custom", true)
    .eq("created_by", gate.userId)
    .order("created_at", { ascending: false });

  // 아바타 서명 URL(generated-images 버킷, 1시간).
  const rows = (bots ?? []) as any[];
  const paths = rows.map((b) => b.avatar_path).filter(Boolean);
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await admin.storage.from("generated-images").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.signedUrl) urlByPath.set(s.path!, s.signedUrl);
  }

  const items: CustomBot[] = rows.map((b) => ({
    id: b.id,
    name: b.name,
    persona: b.persona,
    age: b.character_age,
    style: b.image_style,
    avatarUrl: b.avatar_path ? urlByPath.get(b.avatar_path) ?? null : null,
  }));

  return <CharacterClient items={items} />;
}
