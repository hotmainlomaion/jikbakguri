import { describe, it, expect } from "vitest";
import { detectSelfieRequest, buildSelfieRequest } from "./selfie";

describe("detectSelfieRequest — F20/#7 정밀화", () => {
  it("직접 셀카 요청은 감지", () => {
    for (const t of ["셀카 보내줘", "셀피 하나 줄래?", "지금 사진 보내줘", "selfie 찍어줘"]) {
      expect(detectSelfieRequest(t)).toBe(true);
    }
  });
  it("전언/3인칭은 오탐하지 않음", () => {
    for (const t of ["네 사진 보고 싶다더라", "걔가 사진 보내달래?", "친구가 사진 찍는대"]) {
      expect(detectSelfieRequest(t)).toBe(false);
    }
  });
  it("사진 명사 없는 일반 요청은 미감지", () => {
    for (const t of ["마음을 보여줘", "오늘 뭐 했어?"]) {
      expect(detectSelfieRequest(t)).toBe(false);
    }
  });
  it("빌드된 셀카 요청은 셀카 프레이밍 포함", () => {
    expect(buildSelfieRequest("셀카 보내줘")).toContain("셀카");
  });
});
