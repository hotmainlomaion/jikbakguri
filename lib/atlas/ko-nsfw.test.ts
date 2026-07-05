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

describe("applyKoNsfw — 전체 탈의 명령이 창의 옛 부분 명령에 강등되지 않음(#팬티버그)", () => {
  // 회귀: koSignal은 최근 사용자 메시지 여러 개를 이어붙인다. 먼저 '상의 벗어'가 있고 나중에
  // '다 벗어/다 벗고'가 오면, 전체 탈의가 'top'으로 강등돼 하의(팬티)가 안 벗겨지던 버그.
  it("'상의 벗어' + '다 벗어' 창 → full(하의도 노출), top으로 강등 금지", () => {
    const out = run("상의 벗어. 다 벗어");
    expect(out).toMatch(/completely nude|no clothes|fully exposed|pussy/);
    expect(out).not.toMatch(/wearing panties|clothed lower body|shirt on/);
  });

  it("실제 프로덕션 koSignal 재현 → full(팬티 안 남김)", () => {
    const out = run("그럼 뭐하자는 거야? 상의 벗어. 아래까지 다 벗고, 침대에 누워서 가랑이 벌려");
    expect(out).toMatch(/completely nude|no clothes|fully exposed|pussy|naked/);
    expect(out).not.toMatch(/wearing panties|clothed lower body/);
  });

  it("단독 '팬티 벗어' → bottom(상의는 유지)", () => {
    const out = run("팬티 벗어");
    expect(out).toMatch(/bottomless|no panties|exposed lower body|pussy/);
  });

  it("단독 '상의 벗어' → top만(과다 노출 회귀 방지)", () => {
    const out = run("상의 벗어");
    expect(out).toMatch(/topless|bare breasts/);
    expect(out).not.toMatch(/bottomless|completely nude/);
  });

  it("구어체 '다 벗고' → full(전체 탈의)", () => {
    const out = run("다 벗고 침대에 누워");
    expect(out).toMatch(/completely nude|no clothes|fully exposed|pussy|naked/);
    expect(out).not.toMatch(/wearing panties|clothed lower body/);
  });

  it("'위에 옷 벗어줘' → top만(하의 유지, 과다 노출 방지)", () => {
    const out = run("위에 옷 벗어줘");
    expect(out).toMatch(/topless|bare breasts/);
    expect(out).not.toMatch(/bottomless|completely nude|exposed vulva/);
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
