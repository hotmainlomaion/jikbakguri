import { describe, it, expect } from "vitest";
import {
  stageForIntimacy,
  stageProgress,
  intimacyDelta,
  applyIntimacy,
  relationshipPromptLine,
  STAGES,
} from "./relationship";
import type { Mood } from "./mood";

describe("relationship — F10 관계 단계", () => {
  it("친밀도 구간 → 단계 매핑", () => {
    expect(stageForIntimacy(0).key).toBe("stranger");
    expect(stageForIntimacy(19).key).toBe("stranger");
    expect(stageForIntimacy(20).key).toBe("friend");
    expect(stageForIntimacy(45).key).toBe("crush");
    expect(stageForIntimacy(70).key).toBe("lover");
    expect(stageForIntimacy(90).key).toBe("deep");
    expect(stageForIntimacy(100).key).toBe("deep");
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
    expect(stageForIntimacy(n).key).toBe("friend");
  });

  it("단계 내 진행률은 0~100", () => {
    expect(stageProgress(0)).toBe(0);
    const p = stageProgress(10);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(100);
  });

  it("프롬프트 라인은 단계 라벨 + 하드리밋 불변 문구 포함", () => {
    const line = relationshipPromptLine(STAGES[3]); // 연인
    expect(line).toContain("연인");
    expect(line).toMatch(/hard safety limits|immutable/i);
  });
});
