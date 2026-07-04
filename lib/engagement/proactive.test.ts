import { describe, it, expect } from "vitest";
import { inQuietHours, isEligible, timeOfDayLabel, proactiveInstruction, FREQ_INTERVAL_MS } from "./proactive";

describe("proactive — F02 선톡 적격성", () => {
  it("조용시간(자정 넘김 포함) 판정", () => {
    expect(inQuietHours(2, 0, 8)).toBe(true);
    expect(inQuietHours(9, 0, 8)).toBe(false);
    expect(inQuietHours(23, 22, 8)).toBe(true); // wrap
    expect(inQuietHours(3, 22, 8)).toBe(true); // wrap
    expect(inQuietHours(12, 22, 8)).toBe(false);
    expect(inQuietHours(5, 5, 5)).toBe(false); // start==end → 없음
  });

  const base = { nowMs: 10_000_000_000, nowHour: 15, quietStart: 0, quietEnd: 8, lastIsProactive: false };

  it("off면 발송 안 함", () => {
    expect(isEligible({ ...base, freq: "off", lastActiveMs: 0 })).toBe(false);
  });

  it("간격 미달이면 발송 안 함", () => {
    const lastActiveMs = base.nowMs - 1000; // 방금 활동
    expect(isEligible({ ...base, freq: "often", lastActiveMs })).toBe(false);
  });

  it("간격 충족 + 활동시간대면 발송", () => {
    const lastActiveMs = base.nowMs - FREQ_INTERVAL_MS.often - 1000;
    expect(isEligible({ ...base, freq: "often", lastActiveMs })).toBe(true);
  });

  it("조용시간이면 발송 안 함", () => {
    const lastActiveMs = base.nowMs - FREQ_INTERVAL_MS.often - 1000;
    expect(isEligible({ ...base, freq: "often", lastActiveMs, nowHour: 3 })).toBe(false);
  });

  it("직전이 선톡이면 연속 방지", () => {
    const lastActiveMs = base.nowMs - FREQ_INTERVAL_MS.often - 1000;
    expect(isEligible({ ...base, freq: "often", lastActiveMs, lastIsProactive: true })).toBe(false);
  });

  it("시간대 라벨 + 안전 지시(노골 억제·AI 언급 금지)", () => {
    expect(timeOfDayLabel(2)).toBe("새벽");
    expect(timeOfDayLabel(20)).toBe("저녁");
    const { system } = proactiveInstruction({ botName: "Rin", hour: 20, stageLabel: "연인" });
    expect(system).toMatch(/NOT be sexually explicit/i);
    expect(system).toMatch(/NOT mention being an AI/i);
    expect(system).toContain("연인");
  });
});
