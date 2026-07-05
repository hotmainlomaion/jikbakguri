// POST /api/chat — 채팅 루프 (P2 + 페르소나 일관성).
// 게이트 → 입력 moderation → get_persona_prompt → LLM → check_consistency(재생성)
//        → 출력 moderation → record_memory → 저장.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { checkChatRate } from "@/lib/rate-limit";
import { chatComplete } from "@/lib/atlas/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMessage } from "@/lib/atlas/types";
import {
  getPersonaPrompt,
  getSessionCanon,
  checkConsistency,
  recordCharacterMemory,
  extractDurableFacts,
  maybeSummarize,
  updateSessionMood,
  RECENT_WINDOW,
} from "@/lib/persona/core";
import { detectSelfieRequest, buildSelfieRequest } from "@/lib/persona/selfie";
import { detectSceneMove } from "@/lib/persona/scene";
import { getWallet, spendCredits, CHAT_CREDIT_COST } from "@/lib/economy";

// Vercel 함수 실행 시간(초). 호스티드 LLM 응답 지연 대비 상향(Hobby 최대 60s, Pro 300s).
export const maxDuration = 300;

// 카톡식 표시: 모델 응답을 줄바꿈 우선으로 여러 말풍선으로 나눈다(긴 줄은 문장부호로 재분할).
// 저장은 원문 1건 유지(연속성) — 이 분할은 클라이언트 표시용.
function splitIntoBubbles(text: string): string[] {
  const lines = text.replace(/\r/g, "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  const MAX = 90;
  for (const line of lines) {
    if (line.length <= MAX) { out.push(line); continue; }
    const parts = line.match(/[^.!?~…]+[.!?~…]+["'”’」』)\]]*|\S[^.!?~…]*$/g) ?? [line];
    let buf = "";
    for (const p of parts) {
      const seg = p.trim();
      if (!seg) continue;
      if (buf && (buf + " " + seg).length > MAX) { out.push(buf); buf = seg; }
      else buf = buf ? buf + " " + seg : seg;
    }
    if (buf) out.push(buf);
  }
  return (out.length ? out : [text.trim()]).slice(0, 8); // 과도한 말풍선 상한
}

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok)
    return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { sessionId, message, crowns } = await req.json().catch(() => ({}));
  if (!sessionId || typeof message !== "string" || !message.trim())
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const crownCount = Math.max(0, Math.min(2, Math.floor(Number(crowns) || 0))); // 왕관 보너스(0~2), 서버 클램프.

  if (!(await checkChatRate(gate.userId)))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // 크레딧: 채팅 1턴 = CHAT_CREDIT_COST 차감(성공 시). 먼저 잔액 확인(부족이면 즉시 402, AI 미호출).
  // 무제한(데모) 계정은 balance=-1(면제 신호).
  const wallet0 = await getWallet(gate.userId);
  if (!wallet0.unlimited && wallet0.balance < CHAT_CREDIT_COST)
    return NextResponse.json({ error: "insufficient_credits", balance: wallet0.balance }, { status: 402 });

  const admin = createAdminClient();

  // 세션 소유권 확인(본인 세션만). scene_location(현재 장소) + 봇 이름도 함께.
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profile_id, scene_location, bot_profiles(name)")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== gate.userId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const botName = (session as any).bot_profiles?.name ?? "그녀";

  // 1) 입력 모더레이션 — AI 호출 전.
  const inMod = await moderate({ userId: gate.userId, channel: "chat_in", text: message });
  if (!inMod.pass)
    return NextResponse.json({ error: "blocked", category: inMod.category }, { status: 422 });

  // 2) 페르소나 시스템 프롬프트 합성(고정 캐논 + 기억). 봇 평문 프롬프트 대신 SSOT 사용.
  const systemPrompt = await getPersonaPrompt(sessionId);
  const canonRef = await getSessionCanon(sessionId);
  if (!systemPrompt || !canonRef)
    return NextResponse.json({ error: "persona_unavailable" }, { status: 500 });

  // 최근 윈도우만 원문 전송(그 이전은 롤링 요약이 systemPrompt에 이미 반영됨).
  // desc + limit 후 reverse → "가장 최근 N개"를 시간순으로.
  const { data: recent } = await admin
    .from("messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(RECENT_WINDOW);
  const history = ((recent ?? []) as ChatMessage[]).reverse();

  // #3 장면/위치 전환: 사용자 메시지에서 장소·자리 이동을 감지한다.
  //  · 이동 시 sessions.scene_location 갱신 + 씬 전환 지문(카드) 삽입.
  //  · 현재 위치(이동 후 또는 유지)를 시스템 라인으로 매 턴 주입 → AI 대화가 장소에 맞게.
  const move = detectSceneMove(message, botName, (session as any).scene_location ?? null);
  const effectiveLocation = move.moved ? move.location : ((session as any).scene_location ?? null);
  const locationLine: ChatMessage[] = effectiveLocation
    ? [{
        role: "system",
        content:
          `[현재 장면 위치] 두 사람은 지금 '${effectiveLocation}'에 있다. 배경·행동·감각 묘사를 이 장소에 맞게 하고, ` +
          `장소와 모순되는 묘사(예: 편의점 앞인데 침대 묘사)는 하지 마라.` +
          (move.moved ? ` 방금 '${effectiveLocation}'(으)로 자리를 옮겼으니 새 장소를 자연스럽게 반영해 반응하라.` : ""),
      }]
    : [];

  const baseContext: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...locationLine,
    ...history,
    { role: "user", content: message },
  ];

  // 사용자 메시지 저장(차단 시 정리 위해 id 확보).
  const { data: userMsg } = await admin
    .from("messages")
    .insert({ session_id: sessionId, role: "user", content: message })
    .select("id")
    .single();
  // 출력 차단 시 방금 저장한 사용자 메시지를 삭제(#13): 차단된 턴이 롤링요약 컨텍스트에 남지 않게.
  const dropUserMsg = async () => {
    if (userMsg?.id) await admin.from("messages").delete().eq("id", userMsg.id);
  };

  // #3 이동 감지 시: 현재 위치 갱신 + 씬 전환 지문을 kind='scene' 메시지로 저장(사용자 말풍선 뒤,
  // AI 응답 앞 순서). 클라이언트는 이를 작은 사각형 카드로 렌더한다.
  let sceneCard: { id: string | null; content: string; location: string | null } | null = null;
  if (move.moved && move.narration) {
    await admin.from("sessions").update({ scene_location: move.location }).eq("id", sessionId);
    const { data: sc } = await admin
      .from("messages")
      .insert({ session_id: sessionId, role: "assistant", kind: "scene", content: move.narration })
      .select("id")
      .single();
    sceneCard = { id: sc?.id ?? null, content: move.narration, location: move.location };
  }

  // 3) LLM 호출 + 일관성 검사 재생성 루프(최대 1회 재시도).
  let reply: string | null = null;
  let corrective: ChatMessage[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let draft: string;
    try {
      draft = await chatComplete([...baseContext, ...corrective]);
    } catch {
      return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });
    }

    // 일관성 검사는 캐논(정체성/나이/불변사실/말투)만 검증한다. 롤링 요약과의 모순은
    // 검사하지 않음 — 자유텍스트 요약의 휴리스틱 모순 감지는 오탐(불필요 재생성) 위험이 커서
    // 의도적으로 제외(알려진 한계). 요약은 프롬프트로만 주입돼 모델의 자발적 연속성에 의존.
    const cons = checkConsistency(canonRef.canon, draft);
    if (cons.ok) {
      reply = draft;
      break;
    }
    // hard 위반(안전) → 재생성 없이 차단. 출력 moderation과 일관.
    if (cons.violations.some((v) => v.hard)) {
      await moderate({ userId: gate.userId, channel: "chat_out", text: draft });
      await dropUserMsg();
      return NextResponse.json({ error: "blocked_output", category: "consistency_hard" }, { status: 422 });
    }
    // soft 위반 → 교정 지시 추가 후 1회 재생성. 재시도도 실패하면 마지막 초안 채택.
    reply = draft;
    corrective = [
      {
        role: "system",
        content:
          "Your previous reply broke character consistency (" +
          cons.violations.map((v) => v.type).join(", ") +
          "). Regenerate strictly in-character and consistent with the canon.",
      },
    ];
  }

  if (!reply) return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });

  // 4) 출력 모더레이션 — 반환 전(최종 안전 권한).
  const outMod = await moderate({ userId: gate.userId, channel: "chat_out", text: reply });
  if (!outMod.pass) {
    await dropUserMsg(); // #13: 차단 턴은 컨텍스트에 남기지 않는다.
    return NextResponse.json({ error: "blocked_output", category: outMod.category }, { status: 422 });
  }

  // 5) 저장 + 세션 활동시각 갱신. last_message_is_proactive=false(#14): 사용자 대화가 최신이므로 선톡 배지 해제.
  await admin.from("messages").insert({ session_id: sessionId, role: "assistant", content: reply });
  await admin
    .from("sessions")
    .update({ last_active_at: new Date().toISOString(), last_message_is_proactive: false })
    .eq("id", sessionId);

  // 6) 연속성 기억 추출·기록(입력 moderation 통과분에서 파생, 저장 전 재검사).
  const facts = extractDurableFacts(message);
  if (facts.length) await recordCharacterMemory(sessionId, gate.userId, facts);

  // 7) 롤링 요약 갱신(윈도우 초과 시에만 LLM 호출, best-effort — 실패해도 응답 무손상).
  await maybeSummarize(sessionId, gate.userId);

  // 8) 감정(F12) + 관계 친밀도/단계(F10) 갱신 — 사용자 메시지 신호로. best-effort, UI 표시용 반환.
  const affect = await updateSessionMood(sessionId, message, crownCount);

  // 9) 인챗 셀피(F20) — 사용자가 사진을 요청했으면 selfie 신호+파생 프롬프트를 반환한다.
  //    실제 생성/저장/모더레이션은 클라이언트가 /api/image 를 호출해 기존 파이프라인으로 수행
  //    (자동 프롬프트도 입력·출력 모더레이션을 그대로 통과 — 우회 경로 없음).
  const selfie = detectSelfieRequest(message) ? buildSelfieRequest(message, reply) : null;

  // 10) 크레딧 차감(성공한 1턴에 대해). idem으로 재시도 이중차감 방지. 무제한 계정은 spend 내부에서 면제.
  const spend = await spendCredits(
    gate.userId, CHAT_CREDIT_COST, "chat", "session", sessionId,
    userMsg?.id ? `chat:${userMsg.id}` : undefined
  );
  const credits = { balance: spend.balance, spent: spend.charged, cost: CHAT_CREDIT_COST, unlimited: wallet0.unlimited };

  return NextResponse.json({
    reply,
    bubbles: splitIntoBubbles(reply), // 카톡식 순차 말풍선(표시용). 저장/컨텍스트는 reply 원문.
    sceneCard, // #3 장면 전환 지문(있으면 사용자 말풍선 뒤에 카드로 표시)
    credits, // 크레딧 차감 결과(잔액·소모). UI 헤더 갱신용.
    mood: affect ? affect.mood : null,
    relationship: affect
      ? {
          intimacy: affect.intimacy,
          stage: affect.stage,
          label: affect.stageLabel,
          emoji: affect.stageEmoji,
          stageUp: affect.stageUp,
          level: affect.level, // 관계 레벨(1~7)
          gained: affect.gained, // 이번 턴 획득 포인트
          progress: affect.progress, // 단계 내 진행률(게이지)
        }
      : null,
    selfie,
  });
}
