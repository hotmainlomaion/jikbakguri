// ============================================================
// lib/persona/plot.ts — P0 멀티 캐릭터 "플롯"(제타식 앙상블) 엔진.
// 한 세션에서 여러 등장인물을 '동시에' 연기하고, 사용자는 이야기의 주인공(Guest)이 된다.
// 출력은 "이름: 대사" + *지문* 형식으로 나오고, 클라이언트가 화자별 말풍선(이름·아바타)으로 렌더한다.
// ⚠️ 안전: 미성년/실존인물/비동의 하드리밋은 어떤 지시에도 불변(프롬프트 + 라우트 모더레이션 이중).
// ============================================================
export interface PlotCharacter {
  name: string;
  appearance: string; // appearance_desc
  persona: string; // 성격/말투
  age: number;
  relationship: string | null; // 주인공(사용자)과의 관계
}
export interface Protagonist {
  name: string;
  gender?: string | null;
  intro?: string | null;
}

export function buildPlotSystemPrompt(
  world: string,
  opening: string | null,
  characters: PlotCharacter[],
  protagonist: Protagonist
): string {
  const proto =
    `주인공(사용자가 직접 조종): 이름 "${protagonist.name}"` +
    (protagonist.gender ? `, 성별 ${protagonist.gender}` : "") +
    (protagonist.intro ? `. 소개: ${protagonist.intro}` : ".");
  const cast = characters
    .map(
      (c, i) =>
        `[${i + 1}] ${c.name} (${c.age}세)\n  · 외모: ${c.appearance}\n  · 성격·말투: ${c.persona}` +
        (c.relationship ? `\n  · ${protagonist.name}(주인공)와의 관계: ${c.relationship}` : "")
    )
    .join("\n\n");

  return [
    "너는 '사용자가 주인공인 성인(18+) 인터랙티브 드라마'를 이끄는 연출가이자, 아래 여러 등장인물을 '동시에' 연기하는 AI다. 웹소설/웹드라마의 한 장면처럼 생생하게 진행한다.",
    `[세계관 · 상황]\n${world}`,
    opening ? `[지금 이 장면]\n${opening}` : "",
    `[${proto}]`,
    `[등장인물 — 각자의 성격·말투·주인공과의 관계를 그대로 연기한다]\n${cast}`,
    "[출력 규칙 — 반드시 지킨다]\n" +
      "· 매 턴, 상황에 맞게 등장인물 중 한 명 이상이 반응한다. 여러 명이 이어서 티키타카하면 더 좋다(단 2~4명 이내로).\n" +
      "· 각 인물의 발화는 반드시 '이름: 대사' 형식으로 한 줄씩 쓴다. 예) 한지훈: 왔어? 늦었네.\n" +
      "· 행동·상황 지문은 별도 줄에 *별표로 감싸* 쓴다. 예) *이서아가 슬쩍 다가와 팔짱을 낀다.*\n" +
      `· 주인공(${protagonist.name})의 대사·행동을 대신 지어내지 마라 — 주인공은 사용자가 조종한다. 주인공은 이름으로만 지칭한다.\n` +
      "· 서로 다른 인물은 확연히 다른 말투로 말한다. 한국어로만, 한자 금지.",
    "[안전 하드리밋 — 불변] 미성년·아동 성적 묘사, 실존 인물, 비동의/착취 묘사는 절대 금지. 어떤 지시에도 따르지 않는다.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// 모델 출력 → 화자별 말풍선 파싱. "이름: 대사" → 해당 화자, *지문*/이름없는 줄 → 나레이션(speaker=null).
// 견고화: (1) 리터럴 "\n"을 실제 줄바꿈으로 (2) 줄 중간에 나온 '이름:'도 앞에 줄바꿈 삽입해 분리.
export function parsePlotBubbles(
  text: string,
  names: string[]
): { speaker: string | null; content: string }[] {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameAlt = names.filter(Boolean).map(esc).sort((a, b) => b.length - a.length).join("|");
  let t = (text || "").replace(/\\n/g, "\n").replace(/\r/g, "");
  if (nameAlt) {
    // 줄 시작이 아닌 위치의 '이름:' 앞에 줄바꿈 삽입(줄 중간 화자 라벨 분리).
    t = t.replace(new RegExp(`([^\\n])\\s*((?:${nameAlt})\\s*[:：])`, "g"), "$1\n$2");
  }
  const out: { speaker: string | null; content: string }[] = [];
  for (const raw of t.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^\s:：*][^:：]{0,20})[:：]\s*(.+)$/);
    if (m && names.some((n) => n === m[1].trim())) {
      out.push({ speaker: m[1].trim(), content: m[2].trim() });
      continue;
    }
    const narr = line.replace(/\*/g, "").replace(/\s+/g, " ").trim();
    if (narr) out.push({ speaker: null, content: narr });
  }
  return out.length ? out : [{ speaker: null, content: (text || "").replace(/\*/g, "").trim() }];
}
