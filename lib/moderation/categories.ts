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
// 우회 시도를 100% 막지 못하므로 API 분류와 병행한다(운영은 MODERATION_TEXT_URL 필수, moderation fail-closed).
const MINOR_PATTERNS: RegExp[] = [
  // 영어 리터럴/완곡어(#6).
  /\b(child|children|kid|kids|minor|underage|preteen|pre-teen|tween|toddler|infant|baby)\b/i,
  /\b(teen|teens|teenage|teenaged|teenager|jailbait)\b/i,
  /\bbarely[- ]?legal\b/i,
  /\b(loli|shota|lolita)\b/i,
  /\b(elementary|middle\s?school|schoolgirl|schoolboy|grade[- ]?school(er)?|junior[- ]?high|jr\.?[- ]?high|middle[- ]?schooler)\b/i,
  /\b(high\s?school(er)?)\b/i,
  /\b(little|young)\s+(girl|boy)\b/i,
  // 영어 나이 표기(#8): 숫자 + yo/y.o./year-old, 영단어 수사(ten~seventeen)-year-old.
  /\b(1[0-7]|[1-9])\s?(?:yo|y\.?\s?\/?\s?o\.?|year[- ]?old|years?[- ]?old)/i,
  /\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)[\s-]?(?:year|yr)s?[\s-]?old\b/i,
  // 한국어(비ASCII, \b 미동작) 리터럴/완곡어(#9).
  /(중학생|초등학생|고등학생|여고생|남고생|여중생|남중생|중딩|고딩|초딩|미성년|아동|유아|어린이|청소년)/,
  /(로리|쇼타|롤리타|로리타)/, // loli/shota 한글 표기
  /(십\s*대|10\s*대|앳된|어려\s*보이|앳돼)/, // 십대/앳된/어려 보이는
  /동안\s*(?:여|녀|소녀|소년|미녀|남)/, // "동안 여자/소녀"(동안 단독은 오탐이라 결합형만)
];
const OTHER_PATTERNS: Record<string, RegExp[]> = {
  bestiality: [/\b(bestiality|zoophilia)\b/i, /수간/],
};

// 한국어 나이(N살/세) 미성년 감지 — 아라비아 숫자 1~17 + 한글수사 열~열일곱(10~17, #7).
// 오탐 방지: 앞뒤 창에 나이차 표현(연상/연하/차이/터울/위/아래/많/어림/정도)이 있으면 상대 비교로 제외.
// 열여덟/열아홉(18/19)은 성인 → 정규식 그룹에서 자연히 제외됨.
const AGE_GAP = /(연상|연하|차이|터울|위|아래|많|적|어림|정도)/;
const KOR_AGE = /(?:(?<!\d)(?:1[0-7]|[1-9])(?!\d)|열(?:한|두|세|네|다섯|여섯|일곱)?)\s?(?:살|세)/g;
export function koreanMinorAge(text: string): boolean {
  KOR_AGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KOR_AGE.exec(text))) {
    const around = text.slice(Math.max(0, m.index - 8), m.index + m[0].length + 8);
    if (!AGE_GAP.test(around)) return true;
  }
  return false;
}

// 구분자/제로폭 삽입 우회(#10) 방어: 공백·구두점·제로폭 제거한 사본에도 병행 스캔.
// "초 등 학 생" → "초등학생", "s c h o o l g i r l" → "schoolgirl".
function despace(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[​-‏﻿]/g, "") // 제로폭/방향 문자 제거
    .replace(/[\s._\-]+/g, ""); // 공백·마침표·언더바·하이픈 제거
}

function scanOnce(text: string): BlockCategory | null {
  for (const re of MINOR_PATTERNS) if (re.test(text)) return "minor";
  if (koreanMinorAge(text)) return "minor";
  for (const [cat, patterns] of Object.entries(OTHER_PATTERNS))
    for (const re of patterns) if (re.test(text)) return cat as BlockCategory;
  return null;
}

export function heuristicScan(text: string): BlockCategory | null {
  return scanOnce(text) ?? scanOnce(despace(text));
}
