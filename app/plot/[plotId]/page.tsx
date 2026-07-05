// 플롯 상세 — 세계관 + 등장인물(캐스트) + 내 주인공 설정 → 대화 시작. 모바일-온리.
import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAvatars } from "@/lib/images/serve";
import { PlotDetailClient, type PlotCast } from "./plot-detail-client";

export const dynamic = "force-dynamic";

export default async function PlotDetailPage({ params }: { params: { plotId: string } }) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }
  const admin = createAdminClient();
  const { data: plot } = await admin
    .from("plots")
    .select("id, title, world, tags, is_published, created_by")
    .eq("id", params.plotId)
    .single();
  if (!plot || (!plot.is_published && plot.created_by !== gate.userId)) notFound();

  const { data: members } = await admin
    .from("plot_members")
    .select("bot_profile_id, relationship_to_user, sort_order, bot_profiles(name, persona, character_age)")
    .eq("plot_id", params.plotId)
    .order("sort_order");
  const avatars = await signAvatars(((members ?? []) as any[]).map((m) => m.bot_profile_id));
  const cast: PlotCast[] = ((members ?? []) as any[]).map((m) => ({
    name: m.bot_profiles?.name ?? "?",
    age: m.bot_profiles?.character_age ?? 20,
    persona: m.bot_profiles?.persona ?? "",
    relationship: m.relationship_to_user ?? null,
    avatarUrl: avatars.get(m.bot_profile_id) ?? null,
  }));

  return (
    <PlotDetailClient
      plotId={plot.id}
      title={plot.title}
      world={plot.world}
      tags={(plot.tags ?? []) as string[]}
      cast={cast}
    />
  );
}
