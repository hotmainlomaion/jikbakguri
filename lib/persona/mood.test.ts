import { describe, it, expect } from "vitest";
import { nextMood, moodPromptLine, type Mood } from "./mood";

const N: Mood = { state: "neutral", intensity: 0 };

describe("nextMood — F12 지속형 감정", () => {
  it("애정 표현 → 설렘으로 전환", () => {
    const m = nextMood(N, "너 진짜 좋아 ❤");
    expect(m.state).toBe("flutter");
    expect(m.intensity).toBeGreaterThan(0);
  });

  it("무관심/약한 부정 → 삐짐", () => {
    const m = nextMood(N, "나중에 얘기해 지금 바빠");
    expect(m.state).toBe("sulky");
  });

  it("강한 부정 → 서운함", () => {
    const m = nextMood(N, "너 진짜 미워 싫어");
    expect(m.state).toBe("hurt");
  });

  it("다른 상대 언급 → 질투", () => {
    const m = nextMood(N, "어제 다른 여자랑 놀았어");
    expect(m.state).toBe("jealous");
  });

  it("삐진 상태에서 사과/돌봄 → 강도 완화 또는 회복", () => {
    const sulky: Mood = { state: "sulky", intensity: 40 };
    const m = nextMood(sulky, "미안해 걱정 많이 했어");
    // 완화(같은 상태 강도↓) 또는 긍정 상태로 전환
    expect(m.intensity).toBeLessThan(40);
  });

  it("중립 대화 → 강도 자연 감쇠", () => {
    const flutter: Mood = { state: "flutter", intensity: 20 };
    const m = nextMood(flutter, "오늘 날씨 얘기나 하자");
    expect(m.intensity).toBeLessThan(20);
  });

  it("강도는 0~100로 클램프", () => {
    const hot: Mood = { state: "jealous", intensity: 95 };
    const m = nextMood(hot, "딴 여자랑 뭐했어");
    expect(m.intensity).toBeLessThanOrEqual(100);
  });

  it("평온/0이면 프롬프트 라인 생략", () => {
    expect(moodPromptLine(N)).toBeNull();
  });

  it("감정 있으면 프롬프트 라인 + 하드리밋 불변 문구 포함", () => {
    const line = moodPromptLine({ state: "flutter", intensity: 50 });
    expect(line).toContain("intensity 50/100");
    expect(line).toMatch(/hard limits|safety/i);
  });
});
