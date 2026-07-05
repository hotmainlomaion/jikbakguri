// 플롯(멀티 캐릭터) 채팅 — 모바일-퍼스트. 저장된 assistant 메시지를 화자별 말풍선으로 파싱해 복원.
import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAvatars } from "@/lib/images/serve";
import { parsePlotBubbles } from "@/lib/persona/plot";
import { PlotChatUI, type PlotBubble } from "./plot-chat-ui";

export const dynamic = "force-dynamic";

export default async function PlotChatPage({ params }: { params: { sessionId: string } }) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, plot_id, protagonist, plots(title)")
    .eq("id", params.sessionId)
    .single();
  if (!session || session.user_id !== gate.userId || !(session as any).plot_id) notFound();

  const { data: members } = await admin
    .from("plot_members")
    .select("bot_profile_id, sort_order, bot_profiles(name)")
    .eq("plot_id", (session as any).plot_id)
    .order("sort_order");
  const avatars = await signAvatars(((members ?? []) as any[]).map((m) => m.bot_profile_id));
  const nameToAvatar: Record<string, string | null> = {};
  const names: string[] = [];
  for (const m of (members ?? []) as any[]) {
    const n = m.bot_profiles?.name;
    if (n) {
      names.push(n);
      nameToAvatar[n] = avatars.get(m.bot_profile_id) ?? null;
    }
  }

  const { data: msgs } = await admin
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: true });
  const timeline: PlotBubble[] = [];
  for (const m of (msgs ?? []) as any[]) {
    if (m.role === "user") {
      timeline.push({ role: "user", content: m.content });
      continue;
    }
    for (const b of parsePlotBubbles(m.content, names))
      timeline.push({ role: "assistant", speaker: b.speaker, avatarUrl: b.speaker ? nameToAvatar[b.speaker] ?? null : null, content: b.content });
  }

  const title = (session as any).plots?.title ?? "플롯";
  const proto = (session as any).protagonist ?? { name: "나" };
  return <PlotChatUI sessionId={params.sessionId} title={title} protagonistName={proto.name} initial={timeline} />;
}
