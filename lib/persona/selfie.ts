// ============================================================
// lib/persona/selfie.ts — F20 인챗 셀피(순수 로직).
// 사용자가 대화 중 "사진/셀카"를 요청하면, 캐릭터가 지금 이 장면을 셀카로 "보내는" 연출.
// 여기선 (1) 요청 감지, (2) 이미지 요청 문자열 합성만 한다. 실제 생성은 /api/image 가 담당하며
// ⚠️ 자동 생성 프롬프트도 기존 입력·출력 모더레이션을 그대로 통과한다(우회 경로 없음).
// ============================================================

// 사진 요청 신호(#7 정밀화). 2인칭 직접 요청만 트리거해 3인칭/전언 오탐을 제거한다.
//  · "셀카 보내줘"/"셀피"     → O (직접 요청)
//  · "네 사진 보고 싶다더라"   → X (전언/hearsay)
const HARD = /(셀카|셀피|selfie)/i;                       // 셀카/셀피는 강한 직접 신호
const NOUN = /(사진|photo|\bpic\b)/i;                      // 사진류 명사
const REQ = /(보내\s*줘|보여\s*줘|찍어\s*줘|보내\s*봐|찍어\s*봐|보여\s*봐|줄래|올려\s*줘|보내$|찍어$)/; // 직접 요청형
// 전언(제3자 인용) — 직접 요청형("줄래?")과 겹치지 않게 명시적 어미만.
const HEARSAY = /(다더라|다던데|다는데|다고|라던데|라더라|달래|는대|낸대)/;

export function detectSelfieRequest(message: string): boolean {
  const t = (message || "").trim();
  if (!t || HEARSAY.test(t)) return false;
  if (HARD.test(t)) return true; // 셀카/셀피/selfie 명시
  return NOUN.test(t) && REQ.test(t); // "사진 보내줘" 등 직접 요청형
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
