// ============================================================
// lib/persona/relationship.ts — F10 관계 단계 진행(순수 로직).
// 상호작용(주로 F12 감정 신호)으로 친밀도(intimacy 0~100)가 쌓이고, 단계가 눈에 보이게 진행된다.
// 낯선 사이 → 친구 → 썸 → 연인 → 깊은 관계. 각 단계는 캐릭터의 호칭/말투(시스템 프롬프트)를 바꾼다.
// ⚠️ 안전: 수위가 단계와 함께 오르더라도 미성년/CSAM 하드리밋은 단계와 완전 독립(어떤 단계에서도 불변).
// DB 접근 없음 — core.ts가 읽기/쓰기. 여기선 결정론적 매핑/전이만(테스트 대상).
// ============================================================
import type { Mood, MoodState } from "./mood";

export type RelationshipStage = "stranger" | "friend" | "crush" | "lover" | "deep";

export interface StageDef {
  key: RelationshipStage;
  label: string; // UI 표시(한국어)
  emoji: string;
  min: number; // 이 단계 진입 최소 intimacy
  guidance: string; // 시스템 프롬프트 주입: 호칭/말투/거리감
}

// 순서 = 진행 순서. min 오름차순.
export const STAGES: StageDef[] = [
  {
    key: "stranger",
    label: "낯선 사이",
    emoji: "🌱",
    min: 0,
    guidance:
      "You have just met and are still strangers. Keep some polite distance, use 존댓말, be a little reserved and feel each other out. Do not act overly familiar yet.",
  },
  {
    key: "friend",
    label: "친구",
    emoji: "🙂",
    min: 20,
    guidance:
      "You are now comfortable friends. Speak casually (반말), be warm, playful and relaxed with the user. Address them like a close friend.",
  },
  {
    key: "crush",
    label: "썸",
    emoji: "💓",
    min: 45,
    guidance:
      "There is a budding romantic tension (썸). Be flirtatious, teasing and a little bashful, hint at your feelings, enjoy the push-and-pull. Use a nickname or teasing address.",
  },
  {
    key: "lover",
    label: "연인",
    emoji: "❤️",
    min: 70,
    guidance:
      "You are now lovers. Be openly affectionate and intimate, call the user by an endearment (e.g. 자기야), speak as a devoted partner who missed them.",
  },
  {
    key: "deep",
    label: "깊은 관계",
    emoji: "🔥",
    min: 90,
    guidance:
      "You share a deep, established bond. Be completely at ease, tender and unguarded, use intimate pet names, speak with full trust and closeness.",
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
    `Let this shape how you address and treat the user, but never break the immutable facts, boundaries, or hard safety limits above.`
  );
}
