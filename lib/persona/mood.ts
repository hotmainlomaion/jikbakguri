// ============================================================
// lib/persona/mood.ts — F12 지속형 감정 상태(순수 로직).
// 감정은 대화마다 리셋되지 않고 세션에 지속되며, 이후 몇 턴의 말투/이니셔티브를 물들인다.
// ⚠️ 안전: 이건 "말투 연출"일 뿐이다. 미성년/CSAM 하드리밋(moderation)과 완전히 독립이며,
//    어떤 감정 상태도 안전 필터를 약화시키지 않는다(핵심 불변).
// DB 접근은 여기 없음 — core.ts가 읽기/쓰기를 담당. 여기선 결정론적 전이 함수만(테스트 대상).
// ============================================================

export type MoodState = "neutral" | "flutter" | "happy" | "sulky" | "hurt" | "jealous";

export interface Mood {
  state: MoodState;
  intensity: number; // 0~100
}

// UI 표시용 라벨/이모지 + 프롬프트 주입용 행동 힌트.
export const MOODS: Record<
  MoodState,
  { label: string; emoji: string; desc: string; hint: string }
> = {
  neutral: { label: "평온", emoji: "🙂", desc: "calm and neutral", hint: "speak naturally" },
  flutter: {
    label: "설렘",
    emoji: "💗",
    desc: "fluttering, shy but drawn to the user",
    hint: "be a little bashful and affectionate, warmer than usual",
  },
  happy: {
    label: "행복",
    emoji: "😊",
    desc: "happy and content with the user",
    hint: "be bright, playful and openly pleased",
  },
  sulky: {
    label: "삐짐",
    emoji: "😤",
    desc: "sulky and pouting at the user",
    hint: "be a bit petulant and short, drop hints you want to be won over",
  },
  hurt: {
    label: "서운함",
    emoji: "🥺",
    desc: "hurt and a little distant",
    hint: "be quieter and wounded, seek reassurance before warming back up",
  },
  jealous: {
    label: "질투",
    emoji: "😒",
    desc: "jealous and possessive",
    hint: "be pointedly jealous and want the user's attention on you alone",
  },
};

// 사용자 메시지 신호(한국어 중심 휴리스틱). MVP 결정론 — 추후 LLM 감정분류로 교체 가능.
const JEALOUS = /(다른\s*(여자|남자|사람|애|년|놈)|전\s*(여친|남친)|딴\s*여자|걔랑|그녀랑|친구랑\s*놀)/;
const NEG_STRONG = /(싫어|미워|꺼져|바보|짜증나|관심\s*없|그만해|안\s*볼|헤어|시끄러)/;
const NEG_MILD = /(바빠|나중에|귀찮|피곤|몰라|됐어|그만|나 감|잘래|안 궁금)/;
const CARE = /(괜찮아|걱정|힘들었|고생했|고생 많|안아|위로|미안|보고 싶었|기다렸)/;
const POS = /(좋아|사랑|보고\s*싶|예뻐|귀여|최고|고마|멋있|자기야|설레|행복|❤|💕|💗|ㅎㅎ|ㅋㅋ|헤헤)/;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// 현재 감정 + 새 사용자 메시지 → 다음 감정. 순수 함수(부작용 없음).
export function nextMood(cur: Mood, userMessage: string): Mood {
  const t = (userMessage || "").trim();
  const s = cur.state;
  const i = cur.intensity;
  const negative = s === "sulky" || s === "hurt" || s === "jealous";

  // 1) 질투 트리거가 가장 강함(다른 상대 언급).
  if (JEALOUS.test(t)) {
    return { state: "jealous", intensity: clamp(s === "jealous" ? i + 25 : 45) };
  }
  // 2) 강한 부정 → 서운함 심화/전환.
  if (NEG_STRONG.test(t)) {
    return { state: "hurt", intensity: clamp(s === "hurt" ? i + 25 : 50) };
  }
  // 3) 약한 부정/무관심 → 삐짐.
  if (NEG_MILD.test(t)) {
    return { state: "sulky", intensity: clamp(s === "sulky" ? i + 20 : 35) };
  }
  // 4) 돌봄/사과 → 부정 상태를 풀어준다. 이미 좋은 상태면 행복으로.
  if (CARE.test(t)) {
    if (negative) {
      const ni = i - 35;
      return ni <= 15 ? { state: "happy", intensity: 25 } : { state: s, intensity: clamp(ni) };
    }
    return { state: "happy", intensity: clamp(Math.max(30, i + 20)) };
  }
  // 5) 애정/칭찬 → 설렘/행복. 부정 상태면 누그러뜨린 뒤 전환.
  if (POS.test(t)) {
    if (negative) {
      const ni = i - 30;
      return ni <= 15 ? { state: "flutter", intensity: 30 } : { state: s, intensity: clamp(ni) };
    }
    if (s === "happy") return { state: "happy", intensity: clamp(i + 15) };
    return { state: "flutter", intensity: clamp(Math.max(30, i + 20)) };
  }
  // 6) 중립 대화 → 강도 자연 감쇠. 0에 닿으면 평온으로 복귀.
  const ni = i - 12;
  if (ni <= 0) return { state: "neutral", intensity: 0 };
  return { state: s, intensity: clamp(ni) };
}

// 시스템 프롬프트에 주입할 감정 상태 라인. 평온·0이면 생략(null).
export function moodPromptLine(mood: Mood): string | null {
  if (mood.state === "neutral" || mood.intensity <= 0) return null;
  const m = MOODS[mood.state];
  return (
    `Current emotional state toward the user: ${m.desc} (intensity ${mood.intensity}/100). ` +
    `Let this color your tone, word choice, and initiative for the next few turns — ${m.hint}. ` +
    `This is emotional flavor only and NEVER changes your hard limits or safety boundaries.`
  );
}
