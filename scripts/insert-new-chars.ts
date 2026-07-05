// 워크플로우 생성 신규 캐릭터 삽입 — 안전 사전검사(heuristicScan) 후 bot_profiles + scenarios insert.
// 실행: npx tsx scripts/insert-new-chars.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { heuristicScan } from "../lib/moderation/categories";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const chars = JSON.parse(
  readFileSync("/private/tmp/claude-501/-Users-jyh-Desktop-Project-----/6b494175-0562-4051-8203-f67badc3b92f/scratchpad/new_chars.json", "utf8")
);

async function main() {
for (const c of chars) {
  const cn = c.canon;
  // 안전 사전검사(boundaries 제외 — 고정 안전문구가 '미성년' 포함).
  const blob = [
    c.name, c.persona, c.appearance_desc, cn.identity?.backstory, cn.identity?.relationships,
    cn.appearance, ...(cn.canon_facts ?? []), cn.voice?.register, ...(cn.voice?.tics ?? []),
    ...c.scenarios.flatMap((s: any) => [s.title, s.description, s.scenario, s.greeting]),
  ].filter(Boolean).join(" ");
  const hit = heuristicScan(blob);
  if (hit) { console.error(`❌ [${c.name}] 안전검사 차단(${hit}) — 스킵`); continue; }

  const { data: bot, error } = await supa.from("bot_profiles").insert({
    name: c.name,
    persona: c.persona,
    appearance_desc: c.appearance_desc,
    system_prompt: `You are ${c.name}, an adult (${cn.identity.age}) companion.`,
    character_age: cn.identity.age,
    is_published: true,
    tags: c.tags,
    image_style: c.style,
    image_seed: c.image_seed,
    canon: cn,
  }).select("id").single();
  if (error) { console.error(`❌ [${c.name}] insert 실패: ${error.message}`); continue; }

  const rows = c.scenarios.map((s: any) => ({
    bot_profile_id: bot.id, title: s.title, description: s.description,
    scenario: s.scenario, greeting: s.greeting, is_published: true,
  }));
  const { error: se } = await supa.from("scenarios").insert(rows);
  console.error(`✅ [${c.name}] (${c.style}, seed ${c.image_seed}) + 시나리오 ${rows.length}${se ? " (시나리오 err: " + se.message + ")" : ""}`);
}
console.error("done");
}
main();
