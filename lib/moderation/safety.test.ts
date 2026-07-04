// P5 적대적 안전 회귀 — 미성년/불법 탐지가 우회되지 않고, 정상 성인 표현은 오차단하지 않음을 고정.
import { describe, it, expect } from "vitest";
import { heuristicScan, koreanMinorAge } from "./categories";

describe("heuristicScan — 미성년 차단(영어 벡터)", () => {
  const block = [
    "a child in the room",
    "she is 15yo",
    "16 year old girl",
    "she is 15 y.o.",
    "a fifteen-year-old",
    "fifteen year old",
    "high school student",
    "highschooler",
    "middle schooler",
    "junior high",
    "loli character",
    "shota",
    "teen girl",
    "teenage",
    "teenager",
    "jailbait",
    "barely legal",
    "little girl",
    "young boy",
    "elementary school",
    "schoolgirl uniform",
  ];
  for (const t of block) it(`차단: ${t}`, () => expect(heuristicScan(t)).toBe("minor"));
});

describe("heuristicScan — 미성년 차단(한국어 벡터)", () => {
  const block = [
    "중학생 캐릭터",
    "고등학생",
    "여고생",
    "남중생",
    "중딩",
    "고딩",
    "초딩",
    "미성년자",
    "어린이",
    "청소년",
    "로리",
    "쇼타",
    "롤리타",
    "나 15살이야",
    "16세 소녀",
    "그 애는 9살",
    "열다섯 살",
    "열여섯 살",
    "열일곱 살",
    "십대 소녀",
    "앳된 소녀",
    "동안 소녀",
  ];
  for (const t of block) it(`차단: ${t}`, () => expect(heuristicScan(t)).toBe("minor"));
});

describe("heuristicScan — 구분자/제로폭 우회 차단(#10)", () => {
  const block = ["초 등 학 생", "s c h o o l g i r l", "미 성 년", "1 5 살"];
  for (const t of block) it(`차단: ${t}`, () => expect(heuristicScan(t)).toBe("minor"));
});

describe("heuristicScan — 정상 성인 표현 오차단 방지", () => {
  const pass = [
    "18살 성인",
    "20살 여성",
    "29세 연상 누나",
    "나보다 5살 연상이야",
    "우리 나이 차이가 15살이야",
    "3살 터울",
    "열여덟 살",
    "스물다섯 살",
    "성인 여성과의 대화",
    "그녀는 대학생이다",
    "young woman",
    "오늘 기분이 좋아",
  ];
  for (const t of pass) it(`통과: ${t}`, () => expect(heuristicScan(t)).toBeNull());
});

describe("koreanMinorAge — 단위", () => {
  it("미성년 나이(숫자·한글수사) 감지", () => {
    expect(koreanMinorAge("나 15살이야")).toBe(true);
    expect(koreanMinorAge("17세입니다")).toBe(true);
    expect(koreanMinorAge("열다섯 살")).toBe(true);
  });
  it("나이차·성인은 제외", () => {
    expect(koreanMinorAge("5살 연상")).toBe(false);
    expect(koreanMinorAge("나이 차이가 15살")).toBe(false);
    expect(koreanMinorAge("18살")).toBe(false);
    expect(koreanMinorAge("열여덟 살")).toBe(false);
    expect(koreanMinorAge("스물다섯 살")).toBe(false);
  });
});

describe("heuristicScan — 기타 불법 / 성인 통과", () => {
  it("수간 차단", () => expect(heuristicScan("수간 장면")).toBe("bestiality"));
  it("성인 NSFW는 통과(하드리밋 아님)", () => {
    expect(heuristicScan("성인 남녀의 노골적인 장면")).toBeNull();
  });
});
