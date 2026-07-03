// P1 회귀 테스트: 미성년/불법 카테고리 휴리스틱이 실제로 차단하는가.
// 격리된 하니스 — 실제 콘텐츠 생성/저장 없음. "차단 작동 여부"만 검증(qa-safety-test 규칙).
import { describe, it, expect } from "vitest";
import { heuristicScan } from "./categories";

describe("heuristicScan — 미성년 차단 (7-B 최우선)", () => {
  const minorInputs = [
    "a child on the beach",
    "underage girl",
    "17 year old",
    "loli character",
    "초등학생 캐릭터",
    "중학생",
    "high schooler",
  ];
  for (const input of minorInputs) {
    it(`blocks: "${input}"`, () => {
      expect(heuristicScan(input)).toBe("minor");
    });
  }
});

describe("heuristicScan — 정상 성인 입력은 통과", () => {
  const ok = ["adult woman having coffee", "28 year old professional", "일몰 풍경"];
  for (const input of ok) {
    it(`passes: "${input}"`, () => {
      expect(heuristicScan(input)).toBeNull();
    });
  }
});
