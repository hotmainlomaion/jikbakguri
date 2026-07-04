// POST /api/proactive — 능동적 선톡 생성(F02).
// body: { sessionId?, localHour?, force? }
//  - sessionId 지정: 해당 세션 대상. 없으면 tick: 가장 오래 쉰 적격 세션 1개 자동 선택.
//  - force: 데모용(빈도 간격 무시, 조용시간/off/연속선톡 방지는 유지).
// 안전: 생성 메시지도 반환/저장 전 출력 모더레이션(chat_out) 통과. 미통과 시 미저장.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderate } from "@/lib/moderation";
import { chatComplete } from "@/lib/atlas/llm";
import { getPersonaPrompt, getSessionCanon } from "@/lib/persona/core";
import { isEligible, proactiveInstruction, type ProactiveFreq } from "@/lib/engagement/proactive";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const nowMs = Date.now();
  const nowHour = Number.isInteger(body.localHour) ? Math.max(0, Math.min(23, body.localHour)) : new Date().getHours();
  const force = !!body.force;

  const admin = createAdminClient();

  // 설정 로드(없으면 off 기본).
  const { data: settings } = await admin
    .from("user_settings")
    .select("proactive_freq, quiet_start, quiet_end")
    .eq("user_id", gate.userId)
    .maybeSingle();
  const freq = (settings?.proactive_freq as ProactiveFreq) ?? "off";
  const quietStart = settings?.quiet_start ?? 0;
  const quietEnd = settings?.quiet_end ?? 8;
  if (freq === "off" && !force) return NextResponse.json({ generated: false, reason: "disabled" });

  // 후보 세션: 지정 세션 또는 본인의 최근 세션들(가장 오래 쉰 것 우선).
  let query = admin
    .from("sessions")
    .select("id, user_id, last_active_at, bot_profile_id, bot_profiles(name)")
    .eq("user_id", gate.userId)
    .order("last_active_at", { ascending: true });
  if (body.sessionId) query = query.eq("id", body.sessionId);
  const { data: sessions } = await query.limit(body.sessionId ? 1 : 10);
  if (!sessions?.length) return NextResponse.json({ generated: false, reason: "no_session" });

  // 적격 세션 선택.
  let target: any = null;
  for (const s of sessions) {
    if (s.user_id !== gate.userId) continue;
    // 직전 메시지가 선톡이면 스킵(연속 방지).
    const { data: last } = await admin
      .from("messages")
      .select("is_proactive")
      .eq("session_id", s.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastActiveMs = s.last_active_at ? new Date(s.last_active_at).getTime() : 0;
    const eligible = isEligible({
      freq: force ? "often" : freq,
      lastActiveMs: force ? 0 : lastActiveMs,
      nowMs,
      nowHour,
      quietStart,
      quietEnd,
      lastIsProactive: !!last?.is_proactive,
    });
    if (eligible) { target = s; break; }
  }
  if (!target) return NextResponse.json({ generated: false, reason: "not_eligible" });

  // 페르소나 프롬프트 + 맥락(롤링 요약) + 관계 단계로 안전한 선톡 생성.
  const systemPersona = await getPersonaPrompt(target.id);
  const canon = await getSessionCanon(target.id);
  if (!systemPersona || !canon) return NextResponse.json({ generated: false, reason: "persona_unavailable" });

  const { data: sess } = await admin
    .from("sessions")
    .select("rolling_summary")
    .eq("id", target.id)
    .single();
  const botName = target.bot_profiles?.name ?? canon.canon.identity.name;
  const instr = proactiveInstruction({
    botName,
    hour: nowHour,
    lastTopic: (sess?.rolling_summary as string | null) ?? null,
    stageLabel: canon.stage.label,
  });

  let text: string;
  try {
    text = await chatComplete([
      { role: "system", content: `${systemPersona}\n\n${instr.system}` },
      { role: "user", content: instr.user },
    ]);
  } catch {
    return NextResponse.json({ generated: false, reason: "ai_unavailable" }, { status: 502 });
  }
  const message = (text ?? "").trim().slice(0, 500);
  if (!message) return NextResponse.json({ generated: false, reason: "empty" });

  // 출력 모더레이션(자동 생성물도 동일 게이트).
  const mod = await moderate({ userId: gate.userId, channel: "chat_out", text: message });
  if (!mod.pass) return NextResponse.json({ generated: false, reason: "blocked", category: mod.category });

  // 선톡 저장(is_proactive). last_active_at은 사용자 활동이 아니므로 갱신하지 않는다.
  await admin.from("messages").insert({
    session_id: target.id,
    role: "assistant",
    content: message,
    is_proactive: true,
  });

  return NextResponse.json({ generated: true, sessionId: target.id, botName, message });
}
