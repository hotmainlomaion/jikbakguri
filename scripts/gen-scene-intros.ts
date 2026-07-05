// 각 시나리오의 오프닝 배경 지시문(scene_intro) 생성 — 장소·시간·분위기 한 줄.
// 예: (좁은 녹음부스 안, 늦은 밤. 하나와 나의 뜨거운 숨소리가 공간을 채운다)
// 첫 메시지 앞에 프리픽스되어 몰입감을 준다(pinPersonaSnapshot).
// 실행: npx tsx scripts/gen-scene-intros.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { heuristicScan } from "../lib/moderation/categories";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
) as Record<string, string>;
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const LLM_URL = (env.ATLAS_LLM_BASE_URL || "http://localhost:11434/v1") + "/chat/completions";
const LLM_MODEL = env.ATLAS_LLM_MODEL || "mistral-nemo";

const isClean = (t: string) => !/[぀-ヿ一-鿿]/.test(t) && !/[A-Za-z]{3,}/.test(t);

async function genIntro(name: string, title: string, detail: string): Promise<string | null> {
  const sys =
    "너는 성인(18+) 롤플레이 챗의 '오프닝 배경 지시문'을 쓰는 작가다. " +
    "주어진 시나리오의 지금 이 순간 장면을 여는 한 줄을, 소설 지문처럼 괄호로 감싸 쓴다. " +
    "형식: (장소, 시간대. 분위기/감각/긴장을 한 문장으로). 캐릭터 이름을 자연스럽게 넣어도 된다. " +
    "예: (좁은 녹음부스 안, 늦은 밤. 하나와 나의 뜨거운 숨소리가 좁은 공간을 채운다) " +
    "20~50자. 반드시 순수 한국어(외국어·한자 금지). 그 한 줄(괄호 포함)만 출력하고 다른 말 금지.";
  const user = `캐릭터: ${name}\n시나리오: ${title}\n상황: ${detail}\n\n오프닝 배경 지시문 한 줄:`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const resp = await fetch(LLM_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.ATLAS_LLM_API_KEY || "local"}` },
        body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.8, max_tokens: 120 }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) continue;
      let out = ((await resp.json())?.choices?.[0]?.message?.content ?? "").trim();
      // 첫 괄호 구문만 취함.
      const m = out.match(/\([^)]*\)/);
      out = (m ? m[0] : out).replace(/^["'`]+|["'`]+$/g, "").trim();
      if (!out.startsWith("(")) out = `(${out.replace(/^\(|\)$/g, "")})`;
      if (out.length < 8 || out.length > 90) continue;
      if (!/[가-힣]/.test(out) || !isClean(out)) continue;
      if (heuristicScan(out)) continue; // 미성년/불법 차단
      return out;
    } catch {}
  }
  return null;
}

async function main() {
  const { data: scs } = await supa
    .from("scenarios")
    .select("id, title, detail, bot_profiles(name)")
    .eq("is_published", true)
    .order("sort_order");
  let ok = 0;
  for (const s of scs ?? []) {
    const name = (s as any).bot_profiles?.name ?? "그녀";
    process.stderr.write(`· ${name} / ${s.title} … `);
    const intro = await genIntro(name, s.title, (s as any).detail ?? "");
    if (!intro) { console.error("실패(스킵)"); continue; }
    await supa.from("scenarios").update({ scene_intro: intro }).eq("id", s.id);
    console.error(intro);
    ok++;
  }
  console.error(`\n완료: ${ok}/${(scs ?? []).length}`);
}
main();
