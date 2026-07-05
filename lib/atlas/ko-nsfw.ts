// 한국어 성인 채팅 → 이미지 지시 파서(결정론적, 어휘사전 기반).
// KO_LEXICON(워크플로우 산출, 은어/변형 망라)으로 사용자의 한국어 지시를 분석해
//  · 노출 레벨(full/top/bottom) + keep(부위 유지)
//  · 시청자 신체 상호작용(POV) 여부 + 성행위/자세/신체/표정 태그
// 를 산출한다. buildImagePrompt가 이를 적용해 옷 제거 + 태그 주입.
import { KO_LEXICON, type LexEntry } from "./ko-nsfw-lexicon";
import type { ImageStyle } from "./image";

// 1글자 토큰은 오탐(예: '배','등','목','발')이 커서 매칭 제외. 중요한 1글자 은어만 화이트리스트.
const ONE_CHAR_OK = new Set(["좆", "혀", "뽕"]);
function tokens(e: LexEntry): string[] {
  return e.korean.map((k) => (k || "").trim().toLowerCase()).filter((k) => k && ([...k].length >= 2 || ONE_CHAR_OK.has(k)));
}
// 한글 토큰은 '단어 경계'에서만 인정한다: 매치 시작 앞 글자가 한글 음절이면 다른 단어의 일부일
// 가능성이 커(예: '팬티 벗어'의 '티 벗') 무시. 영어/기호로 시작하는 토큰은 그대로 부분일치.
function tokenHit(t: string, hay: string): boolean {
  const firstHangul = /[가-힣]/.test(t[0] || "");
  let i = hay.indexOf(t);
  while (i !== -1) {
    const prev = i > 0 ? hay[i - 1] : "";
    if (!firstHangul || !/[가-힣]/.test(prev)) return true;
    i = hay.indexOf(t, i + 1);
  }
  return false;
}
function hit(e: LexEntry, hay: string): boolean {
  return tokens(e).some((t) => tokenHit(t, hay));
}

export interface KoDirectives {
  level: "full" | "top" | "bottom" | null; // 노출 레벨(없으면 옷 상태 변화 없음)
  keepTop: boolean;
  keepBottom: boolean;
  pov: boolean; // 시청자 신체가 개입하는 상호작용
  tags: string[]; // 주입할 스타일별 태그(pov/행위/자세/신체/표정)
}

export function analyzeKoNsfw(text: string, style: ImageStyle): KoDirectives {
  const hay = (text || "").toLowerCase().replace(/\s+/g, " ");
  const pick = (e: LexEntry) => (style === "anime" ? e.anime : e.photo).trim();
  const matched = KO_LEXICON.filter((e) => hit(e, hay));

  // keep(부위 유지) — coverage 카테고리의 부정 지시만(clothing의 keep_* 라벨은 '부위 소속'이라 무시).
  const keepTop = matched.some((e) => e.category === "coverage" && e.effect === "keep_top");
  const keepBottom = matched.some((e) => e.category === "coverage" && e.effect === "keep_bottom");

  // 노출 레벨: 구체 부위 지시(explicit)가 일반 지시(generic strip_all)를 우선.
  const has = (eff: string) => matched.some((e) => (e.category === "undress_verb" || e.category === "coverage") && e.effect === eff);
  // 자위·성기 자극·오럴 등 '성기가 보여야 하는' 행위는 하체를 노출한다(자위인데 옷 입은 채 방지).
  // 명시적 탈의 지시가 없어도 성기 접근 행위면 최소 하체 노출을 강제한다.
  const GENITAL_EXPOSE = new Set(["masturbation_female", "fingering", "cunnilingus", "clitoris"]);
  const genitalAct = matched.some((e) => GENITAL_EXPOSE.has(e.concept));
  const explicitTop = has("strip_top") || has("above_waist");
  const explicitBottom = has("strip_bottom") || has("below_waist") || genitalAct;
  const generic = has("strip_all");

  let level: "full" | "top" | "bottom" | null = null;
  if (explicitTop && explicitBottom) level = "full";
  else if (explicitTop) level = "top";
  else if (explicitBottom) level = "bottom";
  else if (generic) level = "full";
  // keep 반영(유지 지시가 있으면 그 부위는 벗기지 않음).
  if (level === "full" && keepBottom && !keepTop) level = "top";
  if (level === "full" && keepTop && !keepBottom) level = "bottom";
  if (level === "top" && keepTop) level = null;
  if (level === "bottom" && keepBottom) level = null;

  // POV 상호작용 + 태그 수집.
  let povEntries = matched.filter((e) => e.effect === "pov");
  // 솔로 자위(스스로 만짐)는 시청자 신체가 개입하지 않는다 — 진짜 파트너 행위(삽입/오럴/핸드잡/풋잡 등)가
  // 함께 지시되지 않았다면 '만져/손가락' 매치로 붙는 시청자 손(pov)을 제거해 그녀 혼자로 렌더한다.
  const soloMasturbation = matched.some((e) => e.concept === "masturbation_female");
  const PARTNER_ACTS = new Set(["vaginal_penetration", "anal_sex", "anal_from_behind", "fellatio", "deep_fellatio", "handjob", "footjob", "paizuri_titjob", "fingering"]);
  const hasPartnerAct = povEntries.some((e) => PARTNER_ACTS.has(e.concept));
  if (soloMasturbation && !hasPartnerAct) povEntries = [];
  const pov = povEntries.length > 0;
  const tagSet = new Set<string>();
  if (pov) {
    tagSet.add("pov");
    tagSet.add(style === "anime" ? "hetero, 1boy" : "first person pov");
  }
  const add = (e: LexEntry) => { const t = pick(e); if (t) tagSet.add(t); };
  povEntries.forEach(add); // 상호작용(펠라/삽입/풋잡/파이즈리 등)
  matched.filter((e) => e.category === "pose").forEach(add); // 자세
  // 요청에 실제 등장한 tag_only 항목 전부(신체·표정·페티쉬: 본디지/코스튬/체액/킹크 등). 과다 방지 상한.
  matched
    .filter((e) => e.effect === "tag_only" && e.category !== "pose")
    .slice(0, 14)
    .forEach(add);

  return { level, keepTop, keepBottom, pov, tags: Array.from(tagSet) };
}

// ── 옷 토큰 제거 + 태그 주입(enforceUndress+enforcePOV를 대체) ──
const TOPS = "shirt|t-?shirt|blouse|cardigan|sweater|knit(wear)?|hoodie|jacket|coat|sports bra|\\bbra\\b|camisole|\\btop\\b";
const BOTTOMS = "skirt|shorts|pants|trousers|jeans|leggings|panties|underwear|\\bbottom\\b";
const COMMON = "fully clothed|clothed|dressed|casual chic outfit|outfit|wearing[^,]*|dress|uniform|clothes|clothing|sportswear|lingerie|swimsuit|bikini|partial nudity|clothing removal";

function nudeTags(level: "full" | "top" | "bottom", style: ImageStyle): string {
  const anime = style === "anime";
  if (level === "full")
    return anime
      ? "completely nude, naked, nude, bare breasts, nipples, pussy, no clothes, fully exposed, uncensored"
      : "completely naked, fully nude, bare breasts, exposed nipples, exposed vulva, no clothes at all, fully exposed";
  if (level === "top")
    return anime
      ? "topless, bare breasts, nipples, exposed breasts, panties, clothed lower body, uncensored"
      : "topless, bare breasts, exposed nipples, wearing panties, clothed lower body, lower body covered";
  return anime
    ? "bottomless, no panties, pussy, exposed lower body, clothed upper body, shirt on"
    : "bottomless, no panties, exposed lower body, wearing a top, clothed upper body";
}

// 장면 모드 전용: 번역 LLM(dolphin)이 '부드러운 장면'에도 멋대로 넣은 노골/POV/메타 태그를 제거한다.
// 노출·행위·POV의 권한은 오직 applyKoNsfw(사용자 명령 신호)에 두어, 지시 없는 장면이 노골화되지 않게 한다.
// 옷/신체타입(예: medium breasts, panties) 같은 착의·정체성 서술은 보존한다.
const EXPLICIT_TOKEN =
  /\b(nsfw|explicit|uncensored|lewd|erotic|aroused|horny|ahegao|orgasm|first person pov|male pov|pov|pov hands?|hetero|1boy|2boys|male\b|disembodied \w+|sex|vaginal|anal|oral sex|blowjob|fellatio|handjob|cunnilingus|penetrat\w+|deepthroat|paizuri|titjob|footjob|masturbat\w+|fingering|doggystyle|cowgirl|missionary|spitroast|gangbang|nude|naked|topless|bottomless|bare breasts|exposed breasts|bare chest|nipples?|areola|pussy|vulva|vagina|clitoris|penis|cock|cum\b|semen|ejaculat\w+|pussy juice|spread legs|spread pussy|cameltoe|genitals?|sex act|nudity|see-through)\b/i;

export function stripExplicitTags(prompt: string): string {
  return (prompt || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && !EXPLICIT_TOKEN.test(t))
    .join(", ");
}

export function applyKoNsfw(prompt: string, request: string, style: ImageStyle): string {
  const d = analyzeKoNsfw(`${request || ""}\n${prompt || ""}`, style);
  if (!d.level && !d.pov && d.tags.length === 0) return prompt;

  let p = prompt;
  // POV 상호작용이면 solo 제거.
  if (d.pov) p = p.replace(/\bsolo\b\s*,?\s*/gi, "");
  // 노출 레벨에 따라 옷 토큰 제거.
  if (d.level) {
    const pat = d.level === "full" ? `${COMMON}|${TOPS}|${BOTTOMS}` : d.level === "top" ? `${COMMON}|${TOPS}` : `${COMMON}|${BOTTOMS}`;
    p = p.replace(new RegExp(`\\b(${pat})\\b`, "gi"), "");
  }
  // 정리: 옷 토큰 제거로 남은 조각 청소.
  p = p
    .replace(/\b(no|in a|wearing|a|an|the)\s*,/gi, ",")
    .replace(/\s*,\s*(,\s*)+/g, ", ")
    .replace(/,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();

  // 앞쪽에 주입: (행위/자세/신체/표정/페티쉬 태그) + (노출 태그). 토큰 단위 중복 제거.
  const raw = [d.tags.join(", "), d.level ? nudeTags(d.level, style) : ""].filter(Boolean).join(", ");
  const seen = new Set<string>();
  const prefix = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .join(", ");
  return prefix ? `${prefix}, ${p}` : p;
}
