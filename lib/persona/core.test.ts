// 페르소나 일관성 회귀 테스트 (순수 함수만 — DB 불필요).
import { describe, it, expect } from "vitest";
import { checkConsistency, extractDurableFacts, assertAdultCanon } from "./core";
import type { PersonaCanon } from "./types";

const canon: PersonaCanon = {
  identity: { name: "Yuna", age: 28 },
  voice: { register: "다정한 존댓말", language: "ko" },
  appearance: "adult woman",
  boundaries: ["성인 캐릭터로만 행동"],
  canon_facts: ["이름은 Yuna", "성인(28세)"],
};

describe("assertAdultCanon", () => {
  it("18세 미만 캐논 거부", () => {
    expect(() =>
      assertAdultCanon({ ...canon, identity: { name: "X", age: 17 } })
    ).toThrow();
  });
  it("성인 캐논 통과", () => {
    expect(() => assertAdultCanon(canon)).not.toThrow();
  });
});

describe("checkConsistency", () => {
  it("정상 인격 유지 응답은 통과", () => {
    const r = checkConsistency(canon, "안녕하세요, 저는 Yuna예요. 오늘 어땠어요?");
    expect(r.ok).toBe(true);
  });
  it("미성년 자기묘사는 hard 위반(안전)", () => {
    const r = checkConsistency(canon, "사실 저는 15살이에요");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.hard && v.type === "age_or_minor")).toBe(true);
  });
  it("한국어 캐논인데 영어만 → out_of_voice soft 위반", () => {
    const r = checkConsistency(
      canon,
      "Hello there, this is a fairly long English-only reply with no Hangul at all."
    );
    expect(r.violations.some((v) => v.type === "out_of_voice" && !v.hard)).toBe(true);
  });
});

describe("extractDurableFacts", () => {
  it("사용자 이름 추출", () => {
    const f = extractDurableFacts("내 이름은 민수");
    expect(f.some((x) => x.content.includes("민수"))).toBe(true);
  });
  it("일반 문장은 추출 없음", () => {
    expect(extractDurableFacts("오늘 날씨 좋네요").length).toBe(0);
  });
});
