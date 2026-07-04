// S5. 채팅 — TopToon 스타일 3열(대화내역 · 씬/메시지 · 프로필). 서버 게이트 + 로드.
import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStats } from "@/components/ui";
import { getProfileMedia } from "@/lib/images/serve";
import { getRecall } from "@/lib/engagement/recall";
import { MOODS, type MoodState } from "@/lib/persona/mood";
import { stageForIntimacy, stageProgress } from "@/lib/persona/relationship";
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
    .select("id, user_id, bot_profile_id, scenario_snapshot, mood, mood_intensity, intimacy, relationship_stage, bot_profiles(name, persona, tags, character_age)")
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

  // 실제 대표컷 + 컬렉션 개수(등록 이미지 없으면 폴백/0).
  const media = await getProfileMedia(session.bot_profile_id);

  // F09 오늘의 회상(재진입 시), F12 현재 감정 상태.
  const recall = await getRecall(params.sessionId);
  const moodState = ((session as any).mood as MoodState) ?? "neutral";
  const m = MOODS[moodState] ?? MOODS.neutral;
  const mood = {
    state: moodState,
    intensity: ((session as any).mood_intensity as number) ?? 0,
    label: m.label,
    emoji: m.emoji,
  };

  // F10 관계 단계 + 친밀도 게이지.
  const intimacy = ((session as any).intimacy as number) ?? 0;
  const stageDef = stageForIntimacy(intimacy);
  const relationship = {
    intimacy,
    stage: stageDef.key,
    label: stageDef.label,
    emoji: stageDef.emoji,
    progress: stageProgress(intimacy),
  };

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
        bedroom: media.collectionCounts["침실"] ?? 0,
        living: media.collectionCounts["거실"] ?? 0,
        avatarUrl: media.avatarUrl,
      }}
      scenarioTitle={scenario?.title ?? null}
      initial={(messages ?? []) as any}
      mood={mood}
      relationship={relationship}
      recall={recall}
      history={(sessions ?? []).map((s: any) => ({
        id: s.id,
        name: s.bot_profiles?.name ?? "AI",
        lastActive: s.last_active_at,
      }))}
    />
  );
}
