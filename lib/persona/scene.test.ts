import { describe, it, expect } from "vitest";
import { detectSceneMove, bgHintFor } from "./scene";

describe("detectSceneMove", () => {
  it("자리 이동을 감지한다(소파로 가자)", () => {
    const r = detectSceneMove("소파로 가자", "배소린", null);
    expect(r.moved).toBe(true);
    expect(r.location).toBe("소파");
    expect(r.narration).toContain("소파로");
    expect(r.narration).toContain("배소린이"); // 받침 있는 이름 → 이/가 조사
    expect(r.bgHint).toMatch(/couch|living room/);
  });

  it("장소 변경을 감지한다(편의점 → 집)", () => {
    const r = detectSceneMove("우리 집으로 가자", "한미나", "편의점");
    expect(r.moved).toBe(true);
    expect(r.location).toBe("집");
    expect(r.narration).toContain("집으로");
    expect(r.narration).toContain("한미나가"); // 받침 없는 이름 → 가
  });

  it("이동 동사 없는 문장은 무시", () => {
    expect(detectSceneMove("오늘 날씨 좋다", "배소린", null).moved).toBe(false);
    expect(detectSceneMove("여기 편의점 앞이 좋아", "배소린", "편의점").moved).toBe(false);
  });

  it("이미 그 장소면 재발화하지 않는다", () => {
    expect(detectSceneMove("집으로 가자", "배소린", "집").moved).toBe(false);
  });

  it("부정/거절 문맥은 이동으로 보지 않는다", () => {
    expect(detectSceneMove("집에 가기 싫어", "배소린", null).moved).toBe(false);
    expect(detectSceneMove("침대로 가지 마", "배소린", null).moved).toBe(false);
    expect(detectSceneMove("아직 집에 안 가", "배소린", null).moved).toBe(false);
  });

  it("눕기/앉기 같은 자리잡기도 감지", () => {
    expect(detectSceneMove("침대에 누워", "배소린", null).location).toBe("침대");
    expect(detectSceneMove("소파에 앉아", "배소린", "거실").location).toBe("소파");
  });

  it("(으)로 조사가 받침에 맞게 붙는다", () => {
    expect(detectSceneMove("침실로 가자", "배소린", null).narration).toContain("침실로"); // ㄹ받침 → 로
    expect(detectSceneMove("주방으로 가자", "배소린", null).narration).toContain("주방으로"); // ㅇ받침 → 으로
  });

  it("bgHintFor는 저장 라벨을 배경 힌트로 변환", () => {
    expect(bgHintFor("침실")).toMatch(/bedroom/);
    expect(bgHintFor(null)).toBeNull();
  });
});
