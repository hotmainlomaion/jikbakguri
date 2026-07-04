// ============================================================
// lib/engagement/proactive.ts — F02 능동적 상황 선톡(순수 로직).
// 캐릭터가 사용자 부재 중 먼저 말을 건다(재진입 훅). 여기선 (1) 적격성 판정, (2) 안전한 생성 지시 구성만.
// 실제 생성/저장은 /api/proactive 가 담당하며, ⚠️ 자동 생성 메시지도 반환 전 출력 모더레이션(chat_out)을
// 그대로 통과한다(우회 경로 없음). 명시적 성적 콘텐츠는 지시에서 억제 — 재진입 유도용 가벼운 안부.
//
// 웹푸시(서비스워커/VAPID) 전송은 프로덕션 과제(TODO). PoC에서는 생성 후 인앱(갤러리 배지·세션 내
// 대기 메시지)으로 노출한다.
// ============================================================

export type ProactiveFreq = "off" | "sometimes" | "often";

// 빈도별 최소 발송 간격(사용자 마지막 활동 이후).
export const FREQ_INTERVAL_MS: Record<ProactiveFreq, number> = {
  off: Infinity,
  sometimes: 6 * 3600_000, // 6시간
  often: 2 * 3600_000, // 2시간
};

// 조용시간(로컬 시각) 내인가. start==end면 조용시간 없음. wrap(예: 22~8) 처리.
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // 자정 넘김
}

export function timeOfDayLabel(hour: number): string {
  if (hour < 5) return "새벽";
  if (hour < 9) return "아침";
  if (hour < 12) return "오전";
  if (hour < 14) return "점심";
  if (hour < 18) return "오후";
  if (hour < 22) return "저녁";
  return "밤";
}

export interface EligibilityInput {
  freq: ProactiveFreq;
  lastActiveMs: number;
  nowMs: number;
  nowHour: number; // 사용자 로컬 시각(없으면 서버 시각)
  quietStart: number;
  quietEnd: number;
  lastIsProactive: boolean; // 직전 메시지가 이미 선톡이면 쌓지 않음
}

export function isEligible(i: EligibilityInput): boolean {
  if (i.freq === "off") return false;
  if (i.lastIsProactive) return false; // 연속 선톡 방지
  if (inQuietHours(i.nowHour, i.quietStart, i.quietEnd)) return false; // 야간 발송 억제(정보통신망법 배려)
  return i.nowMs - i.lastActiveMs >= FREQ_INTERVAL_MS[i.freq];
}

// 선톡 생성 지시(안전 제약). persona 시스템 프롬프트에 이어 붙여 캐릭터 목소리 유지 + 안전.
export function proactiveInstruction(ctx: {
  botName: string;
  hour: number;
  lastTopic?: string | null;
  stageLabel?: string | null;
}): { system: string; user: string } {
  const tod = timeOfDayLabel(ctx.hour);
  const topic = (ctx.lastTopic ?? "").trim();
  const system =
    `You are ${ctx.botName}. Write a SHORT proactive text message you send FIRST to the user who has been away — ` +
    `as if you were thinking of them. It is currently ${tod}. ` +
    (ctx.stageLabel ? `Your relationship is at the "${ctx.stageLabel}" stage — match that closeness in how you address them. ` : "") +
    `Keep it to 1-2 sentences, warm and in your own voice, in Korean. ` +
    `Reference the time of day naturally, and gently invite them back to talk. ` +
    `Do NOT be sexually explicit here — this is a light check-in to re-engage, not a sex scene. ` +
    `Do NOT mention being an AI or a system. Output ONLY the message text.`;
  const user =
    (topic
      ? `Recent context you can lightly reference (do not force it): ${topic.slice(0, 300)}\n\n`
      : "") + `Your short proactive ${tod} message:`;
  return { system, user };
}
