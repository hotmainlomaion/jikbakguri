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
import { isEligible, proactiveInstruction, FREQ_INTERVAL_MS, type ProactiveFreq } from "@/lib/engagement/proactive";

// 저장된 타임존(IANA)으로 서버측 현재 시각(0~23)을 계산(#10). 클라 localHour는 신뢰하지 않는다.
function hourInTz(tz: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date());
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? ((n % 24) + 24) % 24 : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const nowMs = Date.now();
  const force = !!body.force;

  const admin = createAdminClient();

  // 설정 로드(없으면 off 기본).
  const { data: settings } = await admin
    .from("user_settings")
    .select("proactive_freq, quiet_start, quiet_end, timezone")
    .eq("user_id", gate.userId)
    .maybeSingle();
  const freq = (settings?.proactive_freq as ProactiveFreq) ?? "off";
  const quietStart = settings?.quiet_start ?? 0;
  const quietEnd = settings?.quiet_end ?? 8;
  // 조용시간 판정 시각은 저장 tz 기준(서버 계산). 클라 localHour 미신뢰(#10).
  const nowHour = hourInTz((settings?.timezone as string) ?? "Asia/Seoul");
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

  // 원자 클레임(#9): 동시 tick 중 1개만 성공. 간격 내 재발송/중복 선톡 방지.
  const claimSecs = force ? 5 : Math.floor((FREQ_INTERVAL_MS[freq] ?? 3600_000) / 1000);
  const { data: claimed } = await admin.rpc("claim_proactive", { p_session: target.id, p_min_interval_s: claimSecs });
  if (claimed !== true) return NextResponse.json({ generated: false, reason: "claimed" });

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
  // #14: 배지 판정용 비정규화 플래그 세팅(갤러리 N+1 제거). 사용자 응답 시 chat 라우트가 false로.
  await admin.from("sessions").update({ last_message_is_proactive: true }).eq("id", target.id);

  return NextResponse.json({ generated: true, sessionId: target.id, botName, message });
}
