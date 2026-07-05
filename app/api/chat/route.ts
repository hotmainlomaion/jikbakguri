// POST /api/chat — 채팅 루프 (P2 + 페르소나 일관성).
// 게이트 → 입력 moderation → get_persona_prompt → LLM → check_consistency(재생성)
//        → 출력 moderation → record_memory → 저장.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { heuristicScan } from "@/lib/moderation/categories";
import { checkChatRate } from "@/lib/rate-limit";
import { chatStream } from "@/lib/atlas/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMessage } from "@/lib/atlas/types";
import { stripHanzi } from "@/lib/text/sanitize";
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

  // 1) 입력 모더레이션(A1 낙관적) — 결정론 미성년/불법 필터(즉시)만 AI 호출 전 '하드 게이트'로 유지.
  //    LLM 의미분류기(완곡·우회 표현)는 생성과 '동시에' 돌려(대기 없음) 스트림에서 위반 감지 시 중단·회수.
  //    → 첫 글자까지의 분류기 대기(~2~4초)를 제거. (승인된 안전 완화: 결정론 필터는 여전히 사전 차단)
  const inHeur = await moderate({ userId: gate.userId, channel: "chat_in", text: message, heuristicOnly: true });
  if (!inHeur.pass)
    return NextResponse.json({ error: "blocked", category: inHeur.category }, { status: 422 });
  const inLLM: Promise<{ pass: boolean; category?: string }> = moderate({ userId: gate.userId, channel: "chat_in", text: message })
    .then((r) => ({ pass: r.pass, category: (r as { category?: string }).category }))
    .catch(() => ({ pass: true }));

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

  // 3) 스트리밍 생성(NDJSON) — 토큰을 실시간으로 흘려 체감 속도를 높인다.
  //    · 안전: 입력 모더레이션은 위에서 이미 하드 게이트로 통과. 생성 중 매 청크마다 결정론적
  //      미성년 스캔(heuristicScan)을 돌려 즉시 중단. 생성 완료 후 출력 모더레이션(chat_out, LLM
  //      분류기 포함)으로 최종 확인 — 실패 시 blocked 이벤트로 클라이언트가 표시분을 회수한다.
  //    · 일관성: 스트리밍에선 재생성 불가하므로 hard 위반(안전)만 차단, soft 위반은 그대로 수용.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const fail = async (event: Record<string, unknown>) => {
        await dropUserMsg();
        send(event);
        controller.close();
      };
      try {
        // 씬 전환 카드 먼저(사용자 말풍선 뒤, AI 응답 앞).
        if (sceneCard?.content) send({ type: "scene", sceneCard });

        // A1: 동시 입력 LLM 분류기가 위반을 반환하면 스트림을 중단시킬 플래그.
        let inputBlocked: string | null = null;
        inLLM.then((r) => { if (!r.pass) inputBlocked = r.category ?? "minor"; });

        // 토큰 스트리밍 + per-chunk 미성년 스캔 + 입력 분류기 위반 감시.
        let aborted: string | null = null; // 차단 카테고리(설정 시 중단)
        let full: string;
        try {
          full = await chatStream(baseContext, (delta, acc) => {
            if (inputBlocked) { aborted = inputBlocked; throw new Error("__ABORT__"); } // 입력 완곡 위반(동시)
            if (heuristicScan(acc)) { aborted = "minor"; throw new Error("__ABORT__"); } // 출력 미성년(결정론)
            send({ type: "token", delta });
          });
        } catch {
          if (aborted) {
            await moderate({ userId: gate.userId, channel: "chat_out", text: "[stream abort]" });
            return fail({ type: "blocked", error: "blocked_output", category: aborted });
          }
          return fail({ type: "error", error: "ai_unavailable" });
        }

        // 입력 분류기가 (생성 후에라도) 위반이면 표시분 회수(마지막 안전망).
        const inRes = await inLLM;
        if (!inRes.pass) {
          await moderate({ userId: gate.userId, channel: "chat_out", text: "[input late block]" });
          return fail({ type: "blocked", error: "blocked_output", category: inRes.category ?? "minor" });
        }

        // 한자 누출 제거(Qwen 등 한국어에 중국어 토큰 혼입 방지).
        const reply = stripHanzi(full);

        // 일관성(캐논) — hard 위반(안전)만 차단.
        const cons = checkConsistency(canonRef.canon, reply);
        if (cons.violations.some((v) => v.hard)) {
          await moderate({ userId: gate.userId, channel: "chat_out", text: reply });
          return fail({ type: "blocked", error: "blocked_output", category: "consistency_hard" });
        }

        // 출력 모더레이션 — 최종 안전 권한(실패 시 표시분 회수).
        const outMod = await moderate({ userId: gate.userId, channel: "chat_out", text: reply });
        if (!outMod.pass)
          return fail({ type: "blocked", error: "blocked_output", category: outMod.category });

        // 저장 + 세션 활동시각 갱신(선톡 배지 해제).
        await admin.from("messages").insert({ session_id: sessionId, role: "assistant", content: reply });
        await admin
          .from("sessions")
          .update({ last_active_at: new Date().toISOString(), last_message_is_proactive: false })
          .eq("id", sessionId);

        // 연속성 기억 · 롤링 요약 · 감정/관계 · 셀피 · 크레딧(기존 로직 그대로, best-effort).
        const facts = extractDurableFacts(message);
        if (facts.length) await recordCharacterMemory(sessionId, gate.userId, facts);
        await maybeSummarize(sessionId, gate.userId);
        const affect = await updateSessionMood(sessionId, message, crownCount);
        const selfie = detectSelfieRequest(message) ? buildSelfieRequest(message, reply) : null;
        const spend = await spendCredits(
          gate.userId, CHAT_CREDIT_COST, "chat", "session", sessionId,
          userMsg?.id ? `chat:${userMsg.id}` : undefined
        );
        const credits = { balance: spend.balance, spent: spend.charged, cost: CHAT_CREDIT_COST, unlimited: wallet0.unlimited };

        send({
          type: "done",
          reply,
          bubbles: splitIntoBubbles(reply),
          credits,
          mood: affect ? affect.mood : null,
          relationship: affect
            ? {
                intimacy: affect.intimacy,
                stage: affect.stage,
                label: affect.stageLabel,
                emoji: affect.stageEmoji,
                stageUp: affect.stageUp,
                level: affect.level,
                gained: affect.gained,
                progress: affect.progress,
              }
            : null,
          selfie,
        });
        controller.close();
      } catch {
        try { await dropUserMsg(); } catch {}
        try { send({ type: "error", error: "ai_unavailable" }); } catch {}
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // 프록시 버퍼링 방지(즉시 flush)
    },
  });
}
