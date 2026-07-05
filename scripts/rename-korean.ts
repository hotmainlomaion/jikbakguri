// 전 캐릭터를 한국어(한글) 이름으로 변경. name + canon(identity.name/canon_facts) + system_prompt
// + scenarios(title/description/scenario/greeting)의 기존 이름을 한글로 치환.
// 실행: npx tsx scripts/rename-korean.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 기존 romanized → 한글. (긴 이름부터 치환해 부분문자열 충돌 방지)
const MAP: Record<string, string> = {
  Rin: "하린", Yuna: "유나", Mina: "미나", Hana: "하나", Sera: "세라",
  Yuri: "유리", Nara: "아라", Doha: "도하", Riko: "소린", Mei: "채아", Lia: "리아",
};

async function main() {
  for (const [oldName, newName] of Object.entries(MAP)) {
    const { data: bot } = await supa
      .from("bot_profiles")
      .select("id, name, system_prompt, canon")
      .eq("name", oldName)
      .maybeSingle();
    if (!bot) { console.error(`- ${oldName}: 없음(스킵)`); continue; }

    const newCanon = JSON.parse(JSON.stringify(bot.canon).split(oldName).join(newName));
    const newSystemPrompt = (bot.system_prompt ?? "").split(oldName).join(newName);
    const { error } = await supa.from("bot_profiles")
      .update({ name: newName, canon: newCanon, system_prompt: newSystemPrompt })
      .eq("id", bot.id);
    if (error) { console.error(`❌ ${oldName}→${newName}: ${error.message}`); continue; }

    // 시나리오 텍스트 내 이름 치환.
    const { data: scs } = await supa.from("scenarios")
      .select("id, title, description, scenario, greeting")
      .eq("bot_profile_id", bot.id);
    let scN = 0;
    for (const s of scs ?? []) {
      const patch = {
        title: s.title.split(oldName).join(newName),
        description: s.description.split(oldName).join(newName),
        scenario: s.scenario.split(oldName).join(newName),
        greeting: s.greeting.split(oldName).join(newName),
      };
      await supa.from("scenarios").update(patch).eq("id", s.id);
      scN++;
    }
    console.error(`✅ ${oldName} → ${newName} (시나리오 ${scN} 갱신)`);
  }
  console.error("done");
}
main();
