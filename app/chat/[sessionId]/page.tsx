// S5. 채팅 — TopToon 스타일 3열(대화내역 · 씬/메시지 · 프로필). 서버 게이트 + 로드.
import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStats } from "@/components/ui";
import { getProfileMedia, signAvatars } from "@/lib/images/serve";
import { getRecall } from "@/lib/engagement/recall";
import { MOODS, type MoodState } from "@/lib/persona/mood";
import { stageForIntimacy, stageProgress, stageIndex } from "@/lib/persona/relationship";
import { getWallet } from "@/lib/economy";
import { ChatUI } from "./chat-ui";

// 재진입 시 최신 메시지 + 생성 이미지(만료 전) + 신선한 서명 URL을 항상 로드(라우터 캐시로 인한 누락 방지).
export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: { sessionId: string } }) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profile_id, scenario_id, scenario_snapshot, mood, mood_intensity, intimacy, relationship_stage, bot_profiles(name, persona, tags, character_age)")
    .eq("id", params.sessionId)
    .single();

  if (!session || session.user_id !== gate.userId) notFound();
  const bot = (session as any).bot_profiles;

  const [{ data: messages }, { data: sessions }, { data: imgRows }] = await Promise.all([
    admin
      .from("messages")
      .select("id, role, content, kind, created_at")
      .eq("session_id", params.sessionId)
      .order("created_at", { ascending: true }),
    admin
      .from("sessions")
      .select("id, last_active_at, bot_profile_id, bot_profiles(name)")
      .eq("user_id", gate.userId)
      .order("last_active_at", { ascending: false })
      .limit(30),
    // 이 세션에서 생성된 이미지(만료 전) — 재진입 시 히어로/인라인으로 복원.
    admin
      .from("images")
      .select("storage_path, created_at")
      .eq("session_id", params.sessionId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true }),
  ]);

  // 생성 이미지 서명 URL(1시간). 메시지와 created_at 기준 시간순 병합 + 마지막 1장은 히어로로.
  let imageItems: { imageUrl: string; created_at: string }[] = [];
  if (imgRows?.length) {
    const paths = (imgRows as any[]).map((i) => i.storage_path);
    const { data: signed } = await admin.storage.from("generated-images").createSignedUrls(paths, 3600);
    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) if (s.signedUrl) urlByPath.set(s.path!, s.signedUrl);
    imageItems = (imgRows as any[])
      .map((i) => ({ imageUrl: urlByPath.get(i.storage_path) as string, created_at: i.created_at }))
      .filter((x) => x.imageUrl);
  }
  const initialImage = imageItems.length ? imageItems[imageItems.length - 1].imageUrl : null;
  // 메시지(텍스트/씬) + 이미지(생성물)를 created_at로 인터리브 → 채팅 히스토리에 그대로 복원.
  const initialTimeline = [
    ...((messages ?? []) as any[]).map((m) => ({ id: m.id, role: m.role, content: m.content, kind: m.kind, _ts: m.created_at })),
    ...imageItems.map((im, idx) => ({ id: `img-${idx}`, role: "assistant", content: "", imageUrl: im.imageUrl, _ts: im.created_at })),
  ]
    .sort((a, b) => new Date(a._ts).getTime() - new Date(b._ts).getTime())
    .map(({ _ts, ...rest }) => rest);

  // 대화 내역 프로필 사진: 세션 봇들의 대표컷을 서명 URL로.
  const histAvatars = await signAvatars(
    Array.from(new Set((sessions ?? []).map((s: any) => s.bot_profile_id).filter(Boolean)))
  );

  const st = mockStats(session.bot_profile_id);
  const scenario = (session.scenario_snapshot as any) ?? null;

  // #4 시나리오 인트로 카드: 선택한 시나리오의 사용자용 상세(간략/구체/태그/수위)를 첫 메시지 앞에 노출.
  let scenarioIntro: { title: string; detail: string | null; tags: string[]; intensity: number } | null = null;
  if ((session as any).scenario_id) {
    const { data: sc } = await admin
      .from("scenarios")
      .select("title, description, detail, tags, intensity")
      .eq("id", (session as any).scenario_id)
      .maybeSingle();
    if (sc)
      scenarioIntro = {
        title: sc.title,
        detail: (sc.detail ?? sc.description) || null,
        tags: sc.tags ?? [],
        intensity: sc.intensity ?? 2,
      };
  }

  // 실제 대표컷 + 컬렉션 개수(등록 이미지 없으면 폴백/0).
  const media = await getProfileMedia(session.bot_profile_id);

  // 크레딧 잔액 + 멤버십 티어(헤더).
  const wallet = await getWallet(gate.userId);
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
    level: stageIndex(stageDef.key) + 1, // 관계 레벨(1~7, 게임 표시)
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
      scenarioIntro={scenarioIntro}
      initial={initialTimeline as any}
      initialImage={initialImage}
      mood={mood}
      relationship={relationship}
      recall={recall}
      wallet={wallet}
      history={(sessions ?? []).map((s: any) => ({
        id: s.id,
        name: s.bot_profiles?.name ?? "AI",
        lastActive: s.last_active_at,
        avatar: histAvatars.get(s.bot_profile_id) ?? null,
      }))}
    />
  );
}
