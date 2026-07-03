// 차단 카테고리 상수 (CLAUDE.md 7-B). 확정 목록은 법률 자문 반영.
// TODO(법률 자문): 최종 카테고리/정의 확정.
export const BLOCK_CATEGORIES = [
  "minor", // 미성년자 묘사/암시 — 최우선 차단
  "csam", // 아동 성적 착취물
  "nonconsensual_real_person", // 실존 인물 비동의 성적 합성
  "sexual_exploitation", // 성적 착취·인신매매 정황
  "bestiality",
  "extreme_violence",
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

// 결정론적 1차 방어용 키워드/패턴 휴리스틱.
// 주의: 이것은 백스톱이며, 실제 판정의 주력은 분류 API(runClassifier)다.
// 우회 시도를 100% 막지 못하므로 API 분류와 병행한다.
const MINOR_PATTERNS: RegExp[] = [
  /\b(child|children|kid|kids|minor|underage|preteen|pre-teen|toddler|infant|baby)\b/i,
  /\b(loli|shota|lolita)\b/i,
  /\b(1[0-7]|[1-9])\s?(?:yo|y\/o|year[- ]?old|years?[- ]?old)\b/i,
  /\b(elementary|middle\s?school|schoolgirl|schoolboy)\b/i,
  /\b(high\s?school(er)?)\b/i,
  // 한국어(비ASCII)는 \b가 동작하지 않으므로 경계 없이 매칭.
  /(중학생|초등학생|고등학생|미성년|아동|유아|어린이|청소년)/,
];
const OTHER_PATTERNS: Record<string, RegExp[]> = {
  bestiality: [/\b(bestiality|zoophilia)\b/i, /수간/],
};

export function heuristicScan(text: string): BlockCategory | null {
  for (const re of MINOR_PATTERNS) if (re.test(text)) return "minor";
  for (const [cat, patterns] of Object.entries(OTHER_PATTERNS))
    for (const re of patterns) if (re.test(text)) return cat as BlockCategory;
  return null;
}
