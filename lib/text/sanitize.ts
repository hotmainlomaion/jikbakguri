// 출력 정제 유틸.
// magnum-v2-72b(Qwen2.5 기반)이 한국어 응답에 중국어 한자 토큰(线下/安全感/凌乱 등)을 간헐적으로
// 섞는 문제를 제거한다. 현대 한국어 캐주얼 챗은 한자를 쓰지 않으므로 누출은 항상 오류로 간주하고 제거.
// 제거 대상: CJK 확장A(U+3400–U+4DBF) + 통합한자(U+4E00–U+9FFF) + 호환한자(U+F900–U+FAFF).
// 한글(U+AC00–U+D7A3)·자모·라틴·숫자·이모지·문장부호는 그대로 유지(코드포인트 이스케이프로 명확화).
const HANZI = /[㐀-䶿一-鿿豈-﫿]+/g;

export function stripHanzi(text: string): string {
  if (!text) return text;
  return text
    .replace(HANZI, "") // 한자 런 제거
    .replace(/[ \t]{2,}/g, " ") // 제거로 생긴 이중 공백 정리
    .replace(/\s+([,.!?…])/g, "$1") // 공백+문장부호 정리
    .trim();
}
