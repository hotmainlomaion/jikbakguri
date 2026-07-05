import { describe, it, expect } from "vitest";
import {
  stageForIntimacy,
  stageProgress,
  intimacyDelta,
  applyIntimacy,
  relationshipPromptLine,
  explicitVocabTier,
  explicitVocabLine,
  sexualEngagementDelta,
  crownDelta,
  assignCrowns,
  STAGES,
} from "./relationship";
import type { Mood } from "./mood";

describe("relationship — F10 관계 단계", () => {
  it("친밀도 구간 → 7단계 매핑(SQL stage_for_intimacy와 정합)", () => {
    expect(stageForIntimacy(0).key).toBe("first_meet");
    expect(stageForIntimacy(11).key).toBe("first_meet");
    expect(stageForIntimacy(12).key).toBe("friend");
    expect(stageForIntimacy(25).key).toBe("crush");
    expect(stageForIntimacy(40).key).toBe("green_light");
    expect(stageForIntimacy(55).key).toBe("partner");
    expect(stageForIntimacy(72).key).toBe("lover");
    expect(stageForIntimacy(88).key).toBe("soulmate");
    expect(stageForIntimacy(100).key).toBe("soulmate");
  });

  it("긍정 감정은 친밀도를 올리고 부정은 내린다", () => {
    const happy: Mood = { state: "happy", intensity: 50 };
    const hurt: Mood = { state: "hurt", intensity: 50 };
    expect(intimacyDelta(happy)).toBeGreaterThan(0);
    expect(intimacyDelta(hurt)).toBeLessThan(0);
  });

  it("친밀도는 0~100로 클램프", () => {
    const happy: Mood = { state: "happy", intensity: 50 };
    expect(applyIntimacy(99, happy)).toBeLessThanOrEqual(100);
    const hurt: Mood = { state: "hurt", intensity: 50 };
    expect(applyIntimacy(0, hurt)).toBe(0);
  });

  it("긍정 상호작용 누적 → 단계 상승", () => {
    let n = 0;
    const happy: Mood = { state: "happy", intensity: 60 };
    for (let i = 0; i < 6; i++) n = applyIntimacy(n, happy); // +4*6 = 24
    expect(stageForIntimacy(n).key).toBe("friend"); // 24 → 친구(12~24), 25부터 썸
  });

  it("단계 내 진행률은 0~100", () => {
    expect(stageProgress(0)).toBe(0);
    const p = stageProgress(10);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(100);
  });

  it("프롬프트 라인은 단계 라벨 + 하드리밋 불변 문구 포함", () => {
    const lover = STAGES.find((s) => s.key === "lover")!;
    const line = relationshipPromptLine(lover);
    expect(line).toContain("연인");
    expect(line).toMatch(/hard safety limits|immutable/i);
  });

  it("7단계 라벨(연애 progression)", () => {
    expect(STAGES.map((s) => s.label)).toEqual([
      "첫만남", "친구", "썸", "그린라이트", "파트너", "연인", "깊은 연인",
    ]);
    expect(STAGES.length).toBe(7);
  });
});

describe("어휘 크루드니스 게이트 — 관계 심화 연동", () => {
  it("티어: 첫만남/친구=0, 썸/그린라이트=1, 파트너/연인/깊은연인=2", () => {
    expect(explicitVocabTier("first_meet")).toBe(0);
    expect(explicitVocabTier("friend")).toBe(0);
    expect(explicitVocabTier("crush")).toBe(1);
    expect(explicitVocabTier("green_light")).toBe(1);
    expect(explicitVocabTier("partner")).toBe(2);
    expect(explicitVocabTier("lover")).toBe(2);
    expect(explicitVocabTier("soulmate")).toBe(2);
  });

  it("tier0(첫만남): 크루드 은어 금지 + 완곡, 행위 응락은 유지", () => {
    const line = explicitVocabLine(STAGES[0]); // first_meet
    expect(line).toMatch(/tier 0/i);
    expect(line).toMatch(/Do NOT use the crudest/i);
    expect(line).toMatch(/보지/); // 금지 예시로 언급
    expect(line).toMatch(/WORD CHOICE/); // 어휘만 게이팅
    expect(line).toMatch(/every sexual act and intensity/i); // 행위는 전 단계 매칭
  });

  it("tier2(연인): 풀 크루드 어휘 허용", () => {
    const line = explicitVocabLine(STAGES.find((s) => s.key === "lover")!);
    expect(line).toMatch(/tier 2/i);
    expect(line).toMatch(/보지, 자지, 좆/);
    expect(line).toMatch(/uninhibited/i);
  });

  it("모든 티어가 하드리밋 불변을 명시", () => {
    for (const s of STAGES) expect(explicitVocabLine(s)).toMatch(/Hard safety limits/i);
  });
});

describe("게임 요소 — 왕관 포인트", () => {
  it("crownDelta: 왕관당 4점, 0~2 클램프", () => {
    expect(crownDelta(0)).toBe(0);
    expect(crownDelta(1)).toBe(4);
    expect(crownDelta(2)).toBe(8);
    expect(crownDelta(5)).toBe(8); // 상한
    expect(crownDelta(-1)).toBe(0);
  });

  it("assignCrowns: 관계 진전 상위 후보에 왕관 2/1개", () => {
    const out = assignCrowns(["응 그래", "자기야 보고 싶었어 사랑해", "만지고 싶어"]);
    expect(out).toHaveLength(3);
    const crowns = out.map((o) => o.crowns).sort((a, b) => b - a);
    expect(crowns).toEqual([2, 1, 0]); // 정확히 2개·1개·0개
    // 애정 신호가 가장 강한 후보가 왕관 2개
    expect(out.find((o) => o.text.includes("사랑해"))!.crowns).toBe(2);
  });
});

describe("성적 상호작용 점수 기여", () => {
  it("성적/육체적 메시지는 친밀도를 더 올린다", () => {
    expect(sexualEngagementDelta("가슴 만지고 싶어")).toBeGreaterThan(0);
    expect(sexualEngagementDelta("키스하자")).toBeGreaterThan(0);
    expect(sexualEngagementDelta("박아줘")).toBeGreaterThan(0);
  });
  it("비성적 일상 메시지는 기여 0", () => {
    expect(sexualEngagementDelta("오늘 날씨 좋다")).toBe(0);
    expect(sexualEngagementDelta("뭐 먹었어?")).toBe(0);
  });
});
