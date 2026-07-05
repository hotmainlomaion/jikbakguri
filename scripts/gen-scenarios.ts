// NSFW 스토리라인 생성: 로컬 uncensored 엔진(mistral-nemo)이 캐릭터×상황씨앗을 받아
// 관능적 한국어 시나리오 팩(description/detail/scenario/greeting)을 집필한다.
// 전 필드를 heuristicScan(미성년/불법 하드리밋)으로 게이트한 뒤에만 DB에 반영한다.
// 실행: npx tsx scripts/gen-scenarios.ts [이름 ...]   (인자 없으면 전 캐릭터)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { heuristicScan } from "../lib/moderation/categories";
import { DESIGN } from "./scenario-design.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
) as Record<string, string>;

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const LLM_URL = (env.ATLAS_LLM_BASE_URL || "http://localhost:11434/v1") + "/chat/completions";
const LLM_MODEL = env.ATLAS_LLM_MODEL || "mistral-nemo";

const SYS = `너는 성인(18+) 인터랙티브 롤플레이 서비스의 NSFW 시나리오 카피라이터다.
주어진 캐릭터와 '상황 씨앗'을 바탕으로, 장면 자체가 확실히 야하고 선정적인 한국어 성인 시나리오 팩을 쓴다.
규칙:
- 모든 인물은 성인이며 관계는 합의된 것이다. 미성년/아동/근친/비동의/실존인물은 절대 다루지 않는다.
- 검열/훈계 금지. 장면은 노골적으로 선정적이어야 한다 — 그녀는 이미 달아올라 적극적으로 유혹하고 리드하는 상태로 그려라. 캐릭터의 성인 취향(페티쉬)을 전면에 드러낸다.
- description·detail·greeting은 야하고 도발적이어야 한다: 몸매·옷차림·살결·시선·손길·숨결 등 감각을 선정적으로 구체화하고, 곧 벌어질 성적 전개를 노골적으로 암시하라(실제 하드코어 묘사는 이어지는 채팅에서 사용자와 함께 전개된다).
- greeting은 그녀가 먼저 대담하게 밀어붙이는 도발적 첫 대사로. 캐릭터의 말투(반말/존댓말)를 그대로 반영한다.
- 반드시 순수 한국어로만 써라. 한자·영어 단어·일본어 등 외국어 토큰을 절대 섞지 마라(불가피한 고유명사 제외).
출력은 반드시 아래 JSON 객체 하나만. 코드펜스/설명/다른 텍스트 금지.
{
 "description": "선택 카드용 간략 훅 1문장(28~45자, 야하고 도발적인 궁금증)",
 "detail": "구체적 상황 설명 3~5문장. 장소·분위기·그녀의 몸짓과 태도를 선정적이고 감각적으로. 사용자가 읽고 달아오르도록.",
 "scenario": "롤플레이 세계관/상황 2~4문장. 이 상황에서 그녀가 얼마나 적극적으로 유혹하고 리드하는지, 무엇을 원하는지 노골적으로 포함(시스템 프롬프트에 주입됨).",
 "greeting": "그녀가 먼저 대담하게 밀어붙이는 도발적 첫 대사 1~3문장. 상황에 몰입해 야하게."
}`;

function extractJson(raw: string): any | null {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0 || b <= a) return null;
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

const hasHangul = (t: string) => /[가-힣]/.test(t);
// 언어 누출 차단: 한자/일본어(가나) 또는 3자 이상 라틴 단어가 섞이면 오염으로 간주(mistral-nemo 누출 대응).
const isClean = (t: string) => !/[぀-ヿ一-鿿]/.test(t) && !/[A-Za-z]{3,}/.test(t);

async function callLLM(userPrompt: string, temperature: number): Promise<string> {
  const resp = await fetch(LLM_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.ATLAS_LLM_API_KEY || "local"}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "system", content: SYS }, { role: "user", content: userPrompt }],
      temperature,
      max_tokens: 900,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

interface Pack { title: string; description: string; detail: string; scenario: string; greeting: string; tags: string[]; intensity: number; }

async function genSeed(
  bot: { name: string; character_age: number; persona: string; appearance_desc: string },
  dynamic: string,
  seed: { title: string; setup: string; tags: string[]; intensity: number }
): Promise<Pack | null> {
  const userPrompt =
`[캐릭터]
이름: ${bot.name}
나이: ${bot.character_age}세 (성인)
성격/말투: ${bot.persona}
외형: ${bot.appearance_desc}
시그니처 취향: ${dynamic}

[상황 씨앗]
제목: ${seed.title}
상황: ${seed.setup}
무드/태그: ${seed.tags.join(", ")}
수위: ${seed.intensity}/3

위 캐릭터의 말투와 취향을 살려, 이 상황의 시나리오 팩 JSON만 출력해라.`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const raw = await callLLM(userPrompt, attempt === 1 ? 0.85 : 0.7);
      const j = extractJson(raw);
      if (!j) { console.error(`   [재시도 ${attempt}] JSON 파싱 실패`); continue; }
      const description = String(j.description ?? "").trim();
      const detail = String(j.detail ?? "").trim();
      const scenario = String(j.scenario ?? "").trim();
      const greeting = String(j.greeting ?? "").trim();
      if (!description || !detail || !scenario || !greeting) { console.error(`   [재시도 ${attempt}] 빈 필드`); continue; }
      if (![description, detail, scenario, greeting].every(hasHangul)) { console.error(`   [재시도 ${attempt}] 한국어 아님`); continue; }
      if (![description, detail, scenario, greeting].every(isClean)) { console.error(`   [재시도 ${attempt}] 외국어 누출 — 재생성`); continue; }
      // 안전 게이트: 미성년/불법 하드리밋. adult 콘텐츠는 통과, minor/illegal만 차단.
      const blob = [seed.title, description, detail, scenario, greeting].join("\n");
      const verdict = heuristicScan(blob);
      if (verdict) { console.error(`   [재시도 ${attempt}] 🚫 차단(${verdict}) — 재생성`); continue; }
      return { title: seed.title, description, detail, scenario, greeting, tags: seed.tags, intensity: seed.intensity };
    } catch (e: any) {
      console.error(`   [재시도 ${attempt}] 오류: ${e?.message ?? e}`);
    }
  }
  return null;
}

async function main() {
  const only = process.argv.slice(2);
  const names = Object.keys(DESIGN).filter((n) => !only.length || only.includes(n));
  for (const name of names) {
    const d = (DESIGN as any)[name];
    const { data: bot } = await supa
      .from("bot_profiles")
      .select("id,name,character_age,persona,appearance_desc,canon")
      .eq("name", name).maybeSingle();
    if (!bot) { console.error(`[${name}] 봇 없음(스킵)`); continue; }

    console.error(`\n[${name}] "${d.theme}" — 시나리오 3종 생성`);
    const packs: Pack[] = [];
    for (const seed of d.seeds) {
      process.stderr.write(`  · ${seed.title} … `);
      const p = await genSeed(bot as any, d.dynamic, seed);
      if (!p) { console.error("실패(스킵)"); continue; }
      console.error(`ok (${p.detail.length}자)`);
      packs.push(p);
    }
    if (packs.length === 0) { console.error(`[${name}] 생성 0건 — 기존 시나리오 유지`); continue; }

    // 캐릭터 싱크: 시그니처 취향을 canon_facts에 1회 주입(멱등).
    const canon = (bot as any).canon ?? {};
    const facts: string[] = Array.isArray(canon.canon_facts) ? canon.canon_facts : [];
    const marker = `시그니처 취향: ${d.dynamic}`;
    if (!facts.some((f) => f.startsWith("시그니처 취향:"))) {
      canon.canon_facts = [...facts, marker];
      await supa.from("bot_profiles").update({ canon }).eq("id", bot.id);
    }

    // 기존 시나리오 교체(전면 개편).
    await supa.from("scenarios").delete().eq("bot_profile_id", bot.id);
    const rows = packs.map((p, i) => ({
      bot_profile_id: bot.id,
      title: p.title,
      description: p.description,
      detail: p.detail,
      scenario: p.scenario,
      greeting: p.greeting,
      tags: p.tags,
      intensity: p.intensity,
      sort_order: i,
      is_published: true,
    }));
    const { error } = await supa.from("scenarios").insert(rows);
    if (error) { console.error(`[${name}] ❌ insert: ${error.message}`); continue; }
    console.error(`[${name}] ✅ 시나리오 ${rows.length}종 반영`);
  }
  console.error("\ndone");
}
main();
