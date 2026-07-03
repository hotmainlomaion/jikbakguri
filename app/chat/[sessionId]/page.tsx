// S5. 채팅 — TopToon 스타일 3열(대화내역 · 씬/메시지 · 프로필). 서버 게이트 + 로드.
import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStats } from "@/components/ui";
import { ChatUI } from "./chat-ui";

export default async function ChatPage({ params }: { params: { sessionId: string } }) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profile_id, scenario_snapshot, bot_profiles(name, persona, tags, character_age)")
    .eq("id", params.sessionId)
    .single();

  if (!session || session.user_id !== gate.userId) notFound();
  const bot = (session as any).bot_profiles;

  const [{ data: messages }, { data: sessions }] = await Promise.all([
    admin
      .from("messages")
      .select("id, role, content")
      .eq("session_id", params.sessionId)
      .order("created_at", { ascending: true }),
    admin
      .from("sessions")
      .select("id, last_active_at, bot_profiles(name)")
      .eq("user_id", gate.userId)
      .order("last_active_at", { ascending: false })
      .limit(30),
  ]);

  const st = mockStats(session.bot_profile_id);
  const scenario = (session.scenario_snapshot as any) ?? null;

  return (
    <ChatUI
      sessionId={params.sessionId}
      bot={{
        name: bot?.name ?? "AI",
        quote: bot?.persona ?? "",
        tags: bot?.tags ?? [],
        characterAge: bot?.character_age ?? 18,
        views: st.views,
        comments: st.comments,
        likes: st.likes,
        bedroom: st.bedroom,
        living: st.living,
      }}
      scenarioTitle={scenario?.title ?? null}
      initial={(messages ?? []) as any}
      history={(sessions ?? []).map((s: any) => ({
        id: s.id,
        name: s.bot_profiles?.name ?? "AI",
        lastActive: s.last_active_at,
      }))}
    />
  );
}
