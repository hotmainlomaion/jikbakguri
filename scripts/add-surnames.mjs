// 전 캐릭터에 한국어 성(姓)을 붙인다 (이유리·최아라 형태).
// 안전: name + canon.identity.name(+given_name 보존)만 정확히 갱신. prose blind-replace 안 함
// ("하나/미나" 등 일반어 오염 방지). 시나리오 텍스트는 전면 재생성으로 대체되므로 손대지 않음.
// 실행: node scripts/add-surnames.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// given(현재 name) → 성+이름. 서리아=판타지 서큐버스도 일관성 위해 성 부여.
const MAP = {
  하린: "강하린", 미나: "한미나", 세라: "윤세라", 유리: "이유리", 아라: "최아라",
  도하: "문도하", 유나: "정유나", 하나: "김하나", 소린: "배소린", 채아: "오채아", 리아: "서리아",
};

for (const [given, full] of Object.entries(MAP)) {
  const { data: bot } = await supa.from("bot_profiles").select("id,name,canon").eq("name", given).maybeSingle();
  if (!bot) { console.error(`- ${given}: 없음(스킵)`); continue; }
  const canon = bot.canon ?? {};
  canon.identity = { ...(canon.identity ?? {}), name: full, given_name: given };
  const { error } = await supa.from("bot_profiles").update({ name: full, canon }).eq("id", bot.id);
  if (error) { console.error(`❌ ${given}→${full}: ${error.message}`); continue; }
  console.error(`✅ ${given} → ${full}`);
}
console.error("done");
