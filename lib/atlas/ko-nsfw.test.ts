import { describe, it, expect } from "vitest";
import { applyKoNsfw, stripExplicitTags } from "./ko-nsfw";

const P = "1girl, cozy, indoors"; // 중립 베이스 프롬프트
const run = (req: string) => applyKoNsfw(P, req, "anime");

describe("applyKoNsfw — 자위/성기자극 행위는 하체 노출 + 솔로", () => {
  it("'자위 해' → masturbation + bottomless(성기 노출), 시청자 손 없음(solo)", () => {
    const out = run("자위 해");
    expect(out).toMatch(/masturbation/);
    expect(out).toMatch(/bottomless|no panties|exposed lower body/);
    expect(out).not.toMatch(/\b1boy\b/); // 솔로 자위 → 시청자 신체 개입 금지
    expect(out).not.toMatch(/\bpov\b/);
  });

  it("'혼자 만져봐' → 솔로 자위(pov 없음)", () => {
    const out = run("혼자 만져봐");
    expect(out).toMatch(/masturbation/);
    expect(out).not.toMatch(/\b1boy\b/);
  });
});

describe("applyKoNsfw — 파트너 행위는 POV 유지 + 정확한 부위", () => {
  it("'손가락 넣어줘' → fingering + pov(시청자 손) + 하체 노출", () => {
    const out = run("손가락 넣어줘");
    expect(out).toMatch(/fingering/);
    expect(out).toMatch(/1boy|pov/);
    expect(out).toMatch(/bottomless|exposed lower body/);
  });

  it("'뒤에서 박아줘' → vaginal doggystyle, anal 아님", () => {
    const out = run("뒤에서 박아줘");
    expect(out).toMatch(/sex|vaginal/);
    expect(out).not.toMatch(/anal/);
  });

  it("'항문에 넣어줘' → anal(명시적일 때만)", () => {
    expect(run("항문에 넣어줘")).toMatch(/anal/);
  });
});

describe("applyKoNsfw — 지시 없는 부드러운 장면은 노골화하지 않음", () => {
  it("'나도 기대돼 유나야' → 태그 주입 없이 원본 유지", () => {
    const out = run("나도 기대돼 유나야");
    expect(out).toBe(P); // 변화 없음
    expect(out).not.toMatch(/nude|pussy|sex|masturbation/);
  });

  it("'상의랑 브래지어 벗어' → topless(하의 유지), bottomless 아님", () => {
    const out = run("상의랑 브래지어 벗어");
    expect(out).toMatch(/topless|bare breasts/);
    expect(out).not.toMatch(/bottomless/);
  });
});

describe("stripExplicitTags — 번역 LLM이 흘린 노골 태그 제거(장면 모드)", () => {
  it("노골/POV 태그는 제거, 장면·체형 서술은 보존", () => {
    const out = stripExplicitTags("1girl, medium breasts, wet hair, cozy, nsfw, explicit, pov, 1boy, nude, bare breasts, rain");
    expect(out).toMatch(/medium breasts/); // 체형(정체성)은 보존
    expect(out).toMatch(/wet hair/);
    expect(out).toMatch(/cozy/);
    expect(out).toMatch(/rain/);
    expect(out).not.toMatch(/nsfw|explicit|\bpov\b|\b1boy\b|nude|bare breasts/);
  });
});
