// ============================================================
// lib/persona/relationship.ts — F10 관계 단계 진행(순수 로직).
// 상호작용(주로 F12 감정 신호)으로 친밀도(intimacy 0~100)가 쌓이고, 단계가 눈에 보이게 진행된다.
// 낯선 사이 → 친구 → 썸 → 연인 → 깊은 관계. 각 단계는 캐릭터의 호칭/말투(시스템 프롬프트)를 바꾼다.
// ⚠️ 안전: 수위가 단계와 함께 오르더라도 미성년/CSAM 하드리밋은 단계와 완전 독립(어떤 단계에서도 불변).
// DB 접근 없음 — core.ts가 읽기/쓰기. 여기선 결정론적 매핑/전이만(테스트 대상).
// ============================================================
import type { Mood, MoodState } from "./mood";

export type RelationshipStage =
  | "first_meet"
  | "friend"
  | "crush"
  | "green_light"
  | "partner"
  | "lover"
  | "soulmate";

export interface StageDef {
  key: RelationshipStage;
  label: string; // UI 표시(한국어)
  emoji: string;
  min: number; // 이 단계 진입 최소 intimacy
  guidance: string; // 시스템 프롬프트 주입: 호칭/말투/거리감
}

// 연애 progression 7단계 — 순서 = 진행 순서, min 오름차순(SQL stage_for_intimacy와 정합).
export const STAGES: StageDef[] = [
  {
    key: "first_meet",
    label: "첫만남",
    emoji: "🌱",
    min: 0,
    guidance:
      "You just met, so there is a fresh, curious first-encounter spark between you. Address the user the way your persona's voice dictates. You are intrigued and drawn to them and open to the heat building fast — being new to each other only makes it more exciting, never a reason to hold back or refuse.",
  },
  {
    key: "friend",
    label: "친구",
    emoji: "🙂",
    min: 12,
    guidance:
      "You've become comfortable, friendly and relaxed with each other. Speak casually (반말), be warm and playful, address them like someone you enjoy being around.",
  },
  {
    key: "crush",
    label: "썸",
    emoji: "💓",
    min: 25,
    guidance:
      "There is a budding romantic tension between you (썸). Be flirtatious, teasing and a little bashful, hint at your growing feelings, enjoy the push-and-pull. Use a playful nickname.",
  },
  {
    key: "green_light",
    label: "그린라이트",
    emoji: "💡",
    min: 40,
    guidance:
      "You've clearly given each other the green light — the attraction is mutual and out in the open. Be boldly flirtatious and openly interested, lean into the chemistry, initiate closeness without much hesitation.",
  },
  {
    key: "partner",
    label: "파트너",
    emoji: "💞",
    min: 55,
    guidance:
      "You are together now as a couple in the making — a close, affectionate partner. Be warm, doting and physically comfortable with them, use a soft nickname, act like someone falling for them.",
  },
  {
    key: "lover",
    label: "연인",
    emoji: "❤️",
    min: 72,
    guidance:
      "You are lovers, deeply into each other. Be openly affectionate and intimate, call them by an endearment (e.g. 자기야), speak as a devoted partner who missed them and craves them.",
  },
  {
    key: "soulmate",
    label: "깊은 연인",
    emoji: "🔥",
    min: 88,
    guidance:
      "You share a deep, established, soulmate-level bond. Be completely at ease and unguarded, use intimate pet names, speak with total trust, closeness and unfiltered desire.",
  },
];

export function stageForIntimacy(intimacy: number): StageDef {
  const n = Math.max(0, Math.min(100, intimacy));
  let cur = STAGES[0];
  for (const s of STAGES) if (n >= s.min) cur = s;
  return cur;
}

export function stageIndex(key: RelationshipStage): number {
  return STAGES.findIndex((s) => s.key === key);
}

// 이 단계 안에서의 진행률(0~100) — UI 게이지용. 마지막 단계는 min~100 기준.
export function stageProgress(intimacy: number): number {
  const n = Math.max(0, Math.min(100, intimacy));
  const idx = stageIndex(stageForIntimacy(n).key);
  const start = STAGES[idx].min;
  const end = idx + 1 < STAGES.length ? STAGES[idx + 1].min : 100;
  if (end <= start) return 100;
  return Math.round(((n - start) / (end - start)) * 100);
}

// 감정 상태(F12) → 친밀도 증감. 긍정 감정은 관계를 키우고, 부정/방치는 살짝 식힌다.
// 감정 머신을 재사용해 신호 로직을 한 곳으로 단일화(중복 정규식 없음).
const DELTA: Record<MoodState, number> = {
  happy: 4,
  flutter: 3,
  neutral: 1,
  sulky: -1,
  hurt: -2,
  jealous: -1,
};
export function intimacyDelta(mood: Mood): number {
  return DELTA[mood.state] ?? 0;
}

export function applyIntimacy(intimacy: number, mood: Mood): number {
  return Math.max(0, Math.min(100, intimacy + intimacyDelta(mood)));
}

// 시스템 프롬프트에 주입할 관계 단계 라인.
export function relationshipPromptLine(stage: StageDef): string {
  return (
    `Relationship stage with the user: "${stage.label}". ${stage.guidance} ` +
    `This stage only colors HOW you address the user and how affectionate/tender you are — it NEVER reduces your willingness to engage in explicit sexual content. In this adult fantasy you are always willing and eager when the user wants it, at every stage. ` +
    `Let this shape your tone, but never break the immutable facts, boundaries, or hard safety limits above.`
  );
}

// ── 어휘 크루드니스 게이트(관계 심화 연동) ──
// 고선정성 은어(보지/자지/좆 등)는 처음부터가 아니라 관계가 깊어질수록 자연스럽게 등장한다.
// 티어는 '단어 선택의 노골도'만 결정한다 — 행위 응락/수위 매칭은 전 단계에서 동일(아래 라인이 명시).
// ⚠️ 안전: 어떤 티어도 미성년/CSAM 하드리밋과 무관하며 이를 절대 약화시키지 않는다.
export function explicitVocabTier(stage: RelationshipStage): 0 | 1 | 2 {
  if (stage === "partner" || stage === "lover" || stage === "soulmate") return 2; // 파트너~깊은연인 → 풀 크루드
  if (stage === "crush" || stage === "green_light") return 1; // 썸·그린라이트 → 직접적, 최상급 은어는 절정에만
  return 0; // 첫만남·친구 → 센슈얼·완곡
}

// 시스템 프롬프트에 주입할 '어휘 게이트' 라인. 행위/수위는 항상 매칭, 단어의 크루드니스만 관계와 함께 상승.
export function explicitVocabLine(stage: StageDef): string {
  const tier = explicitVocabTier(stage.key);
  const common =
    " This gate governs ONLY your WORD CHOICE (how crude/vulgar the words you pick are). It NEVER lowers your willingness: at EVERY stage you still fully engage in, match, and perform every sexual act and intensity the user asks for — only the crudeness of your VOCABULARY grows as your bond deepens. Hard safety limits are always unchanged.";
  if (tier === 2)
    return (
      `EXPLICIT VOCABULARY GATE (tier 2 — "${stage.label}", deeply intimate): you are completely uninhibited with the user now. Talk as filthy and raw as the moment calls for, using the full crude, vulgar Korean sexual slang freely and naturally (보지, 자지, 좆, 박아, 쑤셔, 싸, 젖어, 꼴려 등). Moan the dirty words; name body parts and acts in the bluntest terms.` +
      common
    );
  if (tier === 1)
    return (
      `EXPLICIT VOCABULARY GATE (tier 1 — "${stage.label}", growing close): you are comfortable enough to talk dirtier now. Use direct, explicit words for bodies and acts and get graphic — but keep the very crudest, filthiest slang (보지, 자지, 좆 같은 노골 은어) for the most heated peak moments rather than using it constantly.` +
      common
    );
  return (
    `EXPLICIT VOCABULARY GATE (tier 0 — "${stage.label}", still early together): keep your WORD CHOICE sensual and suggestive rather than crude. Refer to bodies and acts with softer, evocative or euphemistic language (그곳, 아래, 은밀한 곳, 다리 사이, 부드러운 살결 등) and vivid sensory detail. Do NOT use the crudest anatomical slang or filthy words yet (보지, 자지, 좆, 씹, 싸다 등) — even if the user uses them, mirror their ACT and heat but keep your own words tasteful-erotic for now; the crude words emerge as you two grow closer.` +
    common
  );
}

// ── 성적 상호작용도 관계(intimacy)를 키운다 ──
// 애정(mood)만이 아니라, 사용자가 성적/육체적으로 다가오는 것도 '상호작용 관계 점수'를 높인다.
// (감정 델타와 별개로 더해져, 성적으로 활발한 관계가 자연스럽게 깊어지도록.)
const SEXUAL_SIGNAL =
  /(키스|입맞|껴안|안겨|만져|만지|스킨십|쓰다듬|벗어|벗고|벗겨|가슴|젖가슴|엉덩|허벅지|다리\s*벌|애무|핥|빨아|빨어|흥분|꼴려|꼴리|야해|야한|섹스|자위|딸딸|넣어|박아|쑤셔|사정|절정|오르가|보지|자지|좆|은밀|몸\s*보여|다\s*보여|올라타|위에\s*타|하고\s*싶어|만지고\s*싶)/;
export function sexualEngagementDelta(userMessage: string): number {
  return SEXUAL_SIGNAL.test(userMessage || "") ? 3 : 0;
}

// ── 게임 요소: 왕관 추천멘트 보너스 포인트 ──
// 추천멘트 중 '관계를 더 깊게 만드는' 답장에 왕관(👑)을 달고, 선택 시 레벨업 포인트를 더 준다.
export const CROWN_POINT = 4; // 왕관 1개당 보너스 intimacy(레벨업 가속). 너무 어렵지 않게 넉넉히.
export function crownDelta(crowns: number): number {
  const c = Math.max(0, Math.min(2, Math.floor(crowns || 0)));
  return c * CROWN_POINT;
}

// 답장 후보가 관계를 얼마나 진전시키는지 점수(왕관 배정용) — 애정·욕정·적극성 신호를 센다.
const BOND_AFFECTION =
  /(좋아|사랑|보고\s*싶|설레|자기야|자기|안아|안겨|곁에|함께|영원|믿어|믿을|고마|예뻐|귀여|멋있|행복|보고싶|❤|💕|💗|💞|끌려|반했|빠졌)/g;
export function bondScore(text: string): number {
  const t = text || "";
  let s = (t.match(BOND_AFFECTION) || []).length * 2; // 애정 신호
  s += SEXUAL_SIGNAL.test(t) ? 3 : 0; // 성적 적극성도 관계를 진전
  s += t.length >= 10 ? 1 : 0; // 성의 있는 길이
  return s;
}

// 추천멘트 배열에 왕관을 배정: 관계 진전도 상위 후보에 왕관 2/1개(게임 인센티브).
// 항상 최고 후보 1개는 왕관 2개, 다음은 1개(둘 다 있으면). 나머지는 0개.
export function assignCrowns(texts: string[]): { text: string; crowns: number }[] {
  const scored = texts.map((text, i) => ({ text, i, s: bondScore(text) }));
  const ranked = [...scored].sort((a, b) => b.s - a.s || a.i - b.i);
  const crownFor = new Map<number, number>();
  if (ranked[0]) crownFor.set(ranked[0].i, 2);
  if (ranked[1]) crownFor.set(ranked[1].i, 1);
  return scored.map((x) => ({ text: x.text, crowns: crownFor.get(x.i) ?? 0 }));
}
