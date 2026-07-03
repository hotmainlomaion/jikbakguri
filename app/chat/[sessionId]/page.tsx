// S5. 채팅 — 서버 게이트 + 세션 소유권 확인 후 클라이언트 UI 렌더.
import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, user_id, bot_profiles(name)")
    .eq("id", params.sessionId)
    .single();

  if (!session || session.user_id !== gate.userId) notFound();

  const { data: messages } = await admin
    .from("messages")
    .select("id, role, content")
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: true });

  const botName = (session as any).bot_profiles?.name ?? "AI";

  return (
    <ChatUI
      sessionId={params.sessionId}
      botName={botName}
      initial={(messages ?? []) as any}
    />
  );
}
