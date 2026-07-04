// ============================================================
// lib/persona/selfie.ts — F20 인챗 셀피(순수 로직).
// 사용자가 대화 중 "사진/셀카"를 요청하면, 캐릭터가 지금 이 장면을 셀카로 "보내는" 연출.
// 여기선 (1) 요청 감지, (2) 이미지 요청 문자열 합성만 한다. 실제 생성은 /api/image 가 담당하며
// ⚠️ 자동 생성 프롬프트도 기존 입력·출력 모더레이션을 그대로 통과한다(우회 경로 없음).
// ============================================================

// 사진 요청 신호. 명사(셀카/셀피/사진/selfie/pic) 존재를 기본으로,
// 애매한 경우(사진 없이 "보여줘"만)는 트리거하지 않아 오작동을 줄인다.
const HARD = /(셀카|셀피|selfie)/i;
const NOUN = /(사진|photo|\bpic\b|이미지)/i;
const VERB = /(보내|보여|찍어|찍자|줘|줄래|볼래|보고\s*싶|올려)/;

export function detectSelfieRequest(message: string): boolean {
  const t = (message || "").trim();
  if (!t) return false;
  if (HARD.test(t)) return true; // "셀카 줘", "셀피" 등은 명확
  return NOUN.test(t) && VERB.test(t); // "사진 보내줘", "지금 모습 사진 찍어줘"
}

// 셀카 이미지 요청 문자열(한국어) 합성. /api/image → buildImagePrompt(identity, request)로 전달돼
// LLM이 영어 프롬프트로 번역한다. 사용자 요청 본문을 살리되, 장면 디테일이 없으면 셀카 프레이밍만.
export function buildSelfieRequest(userMessage: string, reply?: string): string {
  const t = (userMessage || "").trim().slice(0, 300);
  // 사용자가 구체적 장면/의상/포즈를 말했으면 그대로 존중(가장 중요한 신호).
  const base = t || "지금 이 순간의 셀카";
  // 셀카 성격 명시(1인칭 근접샷, 표정/분위기 반영). 검열/보정 지시는 넣지 않음 — 안전은 모더레이션이.
  return `${base} — 캐릭터가 지금 이 장면에서 스스로 찍어 보내는 셀카. 표정과 분위기가 드러나는 1인칭 근접 구도.`;
}
