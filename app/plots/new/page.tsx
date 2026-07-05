// 플롯 빌더(UGC) — 발행 캐릭터 + 내 커스텀 캐릭터에서 캐스트를 골라 멀티 캐릭터 스토리 제작. 모바일-온리.
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAvatars } from "@/lib/images/serve";
import { PlotBuilderClient, type PickChar } from "./plot-builder-client";

export const dynamic = "force-dynamic";

export default async function NewPlotPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }
  const admin = createAdminClient();
  const { data: bots } = await admin
    .from("bot_profiles")
    .select("id, name, persona, character_age, is_custom, avatar_path")
    .or(`is_published.eq.true,and(is_custom.eq.true,created_by.eq.${gate.userId})`)
    .order("created_at", { ascending: true })
    .limit(60);

  const rows = (bots ?? []) as any[];
  const avatars = await signAvatars(rows.filter((b) => !b.is_custom).map((b) => b.id));
  const customPaths = rows.filter((b) => b.is_custom && b.avatar_path).map((b) => b.avatar_path);
  const customUrl = new Map<string, string>();
  if (customPaths.length) {
    const { data: signed } = await admin.storage.from("generated-images").createSignedUrls(customPaths, 3600);
    for (const s of signed ?? []) if (s.signedUrl) customUrl.set(s.path!, s.signedUrl);
  }
  const chars: PickChar[] = rows.map((b) => ({
    id: b.id,
    name: b.name,
    persona: b.persona,
    age: b.character_age,
    isCustom: !!b.is_custom,
    avatarUrl: b.is_custom ? (b.avatar_path ? customUrl.get(b.avatar_path) ?? null : null) : avatars.get(b.id) ?? null,
  }));

  return <PlotBuilderClient chars={chars} />;
}
