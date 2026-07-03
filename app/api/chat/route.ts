// POST /api/chat — 채팅 루프 (P2). 게이트 → 입력 모더레이션 → LLM → 출력 모더레이션 → 저장.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { checkChatRate } from "@/lib/rate-limit";
import { chatComplete } from "@/lib/atlas/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMessage } from "@/lib/atlas/types";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok)
    return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { sessionId, message } = await req.json().catch(() => ({}));
  if (!sessionId || typeof message !== "string" || !message.trim())
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if (!(await checkChatRate(gate.userId)))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const admin = createAdminClient();

  // 세션 소유권 확인(본인 세션만).
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profile_id")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== gate.userId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 1) 입력 모더레이션 — AI 호출 전.
  const inMod = await moderate({ userId: gate.userId, channel: "chat_in", text: message });
  if (!inMod.pass)
    return NextResponse.json({ error: "blocked", category: inMod.category }, { status: 422 });

  // 봇 시스템 프롬프트 + 최근 히스토리 로드(무상태 LLM → 전체 재전송).
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("system_prompt")
    .eq("id", session.bot_profile_id)
    .single();
  const { data: history } = await admin
    .from("messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(40);

  const context: ChatMessage[] = [
    { role: "system", content: bot?.system_prompt ?? "You are an adult companion character (18+)." },
    ...((history ?? []) as ChatMessage[]),
    { role: "user", content: message },
  ];

  // 사용자 메시지 저장.
  await admin.from("messages").insert({ session_id: sessionId, role: "user", content: message });

  // 2) LLM 호출.
  let reply: string;
  try {
    reply = await chatComplete(context);
  } catch (e) {
    return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });
  }

  // 3) 출력 모더레이션 — 반환 전.
  const outMod = await moderate({ userId: gate.userId, channel: "chat_out", text: reply });
  if (!outMod.pass)
    return NextResponse.json({ error: "blocked_output", category: outMod.category }, { status: 422 });

  // 저장 + 세션 활동시각 갱신.
  await admin.from("messages").insert({ session_id: sessionId, role: "assistant", content: reply });
  await admin.from("sessions").update({ last_active_at: new Date().toISOString() }).eq("id", sessionId);

  return NextResponse.json({ reply });
}
