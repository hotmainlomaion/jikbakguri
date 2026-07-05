// 히어로 배너 후킹 문구 생성: 캐릭터 페르소나 + 대표 시나리오 설정을 로컬 엔진(aya)에 넣어
// '상상력을 자극하는 티저 한 줄'을 집필한다. 예) "편의점 앞, 그녀가 나를 조용히 불러냈다... 도대체 왜?"
// heuristicScan(미성년/불법 하드리밋) + 순수 한국어 필터 통과분만 bot_profiles.hero_hook에 반영.
// 실행: npx tsx scripts/gen-hero-hooks.ts [이름 ...]   (인자 없으면 전 공개 캐릭터)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { heuristicScan } from "../lib/moderation/categories";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
) as Record<string, string>;

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const LLM_URL = (env.ATLAS_LLM_BASE_URL || "http://localhost:11434/v1") + "/chat/completions";
const LLM_MODEL = env.ATLAS_LLM_MODEL || "huihui_ai/aya-expanse-abliterated:8b";

const SYS = `너는 성인(18+) AI 캐릭터 챗 서비스 메인 배너의 카피라이터다.
사용자가 읽는 순간 '이거 뭐지? 눌러보고 싶다'는 궁금증과 야릇한 상상이 드는 **짧은 티저 한 줄**을 쓴다.

반드시 이 구조로: [장소·상황을 짧게], [그녀가 '나'에게 벌인 사건을 간결히]… (여운 '…' 또는 짧은 물음표로 궁금증을 남긴다)

좋은 예(이 톤·길이를 따라라):
- 편의점 앞, 그녀가 나를 조용히 불러냈다… 도대체 왜?
- 새벽 사무실, 단둘이 남았다. 그녀의 눈빛이 심상치 않다.
- 비 오는 골목, 그녀가 내 우산 속으로 들어왔다.
- 멈춰버린 엘리베이터, 그녀가 한 발 다가섰다…

규칙:
- 길이: 전체 16~40자. 짧고 강하게.
- 미사여구·비유 금지('밤바람이 속삭인다', '젖은 장미 같은 몸매' 같은 표현 절대 쓰지 마라). 장면으로 담백하게 보여줘라.
- 따옴표(" ' 「 『)와 대사 인용 금지. 이모지 금지.
- 노골적 성묘사·신체부위·욕설 금지 — 은근히 야릇한 정도로, 상상은 사용자 몫.
- 관점: 사용자가 '나', 캐릭터는 '그녀'(또는 이름). 캐릭터 성격/상황이 드러나게.
- 순수 한국어만. 한자·영어·일본어 금지. 일본/외국 문화 소품(유카타·기모노 등) 금지 — 한국의 현대적 배경으로.
- 설명문('~한 여성이다')·군더더기 서술('그녀는 속삭인다'로 끝맺기) 금지.
출력은 그 티저 한 줄만. 접두어·따옴표·설명 금지.`;

const hasHangul = (t: string) => /[가-힣]/.test(t);
// 순수 한국어(한자·가나·3자+ 라틴 배제) + 일본 문화 소품 누출 배제.
const JP_CULTURE = /유카타|기모노|하카마|게타|사무라이|닌자|와사비|사케|스시|덴푸라|오뎅|이자카야/;
const isClean = (t: string) => !/[぀-ヿ一-鿿]/.test(t) && !/[A-Za-z]{3,}/.test(t) && !JP_CULTURE.test(t);

async function callLLM(userPrompt: string, temperature: number): Promise<string> {
  const resp = await fetch(LLM_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.ATLAS_LLM_API_KEY || "local"}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "system", content: SYS }, { role: "user", content: userPrompt }],
      temperature,
      max_tokens: 160,
    }),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

function clean(raw: string): string {
  // 접두어/코드펜스/불필요 줄 제거 → 첫 유효 문장 라인.
  let s = raw.replace(/^```[\s\S]*?```/g, "").trim();
  s = s.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? s;
  s = s.replace(/^(티저|한 줄|문구|카피)\s*[:：]\s*/i, "").trim();
  // 대사 인용 금지 → 모든 따옴표 문자를 제거(잘린 따옴표가 남기는 '". 같은 잔여물 방지).
  s = s.replace(/["'“”„‘’「」『』]/g, "");
  // 끝의 어색한 잔여 문장부호 조합 정리(예: '"…' 제거 후 남는 ' .', ',' 등).
  s = s.replace(/\s+/g, " ").replace(/[\s,]+$/g, "").trim();
  // 문장이 마침표 없이 끝나면 여운(…)을 붙여 티저 톤 유지(물음표/느낌표/…로 끝나면 그대로).
  if (!/[…?!.~]$/.test(s)) s = s + "…";
  s = s.replace(/\.{3}$/,"…"); // ... → …
  return s.trim();
}

async function main() {
const names = process.argv.slice(2);
let q = supa.from("bot_profiles").select("id, name, persona, hero_hook, character_age").eq("is_published", true);
if (names.length) q = q.in("name", names);
const { data: bots, error } = await q.order("created_at", { ascending: true });
if (error) { console.error(error.message); process.exit(1); }

for (const bot of bots ?? []) {
  // 대표 시나리오(정렬 우선순위)로 상황 그라운딩.
  const { data: scs } = await supa
    .from("scenarios")
    .select("title, description, detail")
    .eq("bot_profile_id", bot.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(3);
  const scenarioBrief = (scs ?? [])
    .map((s: any) => `- ${s.title}: ${s.description}`)
    .join("\n") || "(등록 시나리오 없음)";

  const userPrompt =
    `캐릭터 이름: ${bot.name} (성인 ${bot.character_age}세)\n` +
    `캐릭터 성격/말투: ${bot.persona}\n` +
    `대표 상황들:\n${scenarioBrief}\n\n` +
    `위 캐릭터와 상황 중 가장 끌리는 하나를 골라, 배너 티저 한 줄을 써라.`;

  let hook = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    let out: string;
    try { out = clean(await callLLM(userPrompt, 0.9)); }
    catch (e: any) { console.error(`[${bot.name}] LLM err: ${e.message}`); continue; }
    const flagged = heuristicScan(out); // 카테고리 문자열이면 위법 신호, null이면 통과.
    const len = [...out].length;
    if (out && hasHangul(out) && isClean(out) && len >= 14 && len <= 52 && !flagged) { hook = out; break; }
    console.error(`[${bot.name}] reject(len=${len}, clean=${isClean(out)}, flagged=${flagged ?? "none"}): ${out.slice(0, 60)}`);
  }
  if (!hook) { console.error(`[${bot.name}] ❌ 생성 실패 — 폴백 유지`); continue; }

  const { error: uErr } = await supa.from("bot_profiles").update({ hero_hook: hook }).eq("id", bot.id);
  if (uErr) { console.error(`[${bot.name}] db err: ${uErr.message}`); continue; }
  console.error(`[${bot.name}] ✅ ${hook}`);
}
console.error("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
