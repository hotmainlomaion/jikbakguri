// 장면 이미지 파이프라인 검증: 세션 대화 맥락 → buildSceneRequest → buildImagePrompt(identity+seed)
// → generateImage. /api/image scene 모드의 코어를 실제 함수로 직접 호출해 결과를 파일로 저장(육안 확인).
// 실행: npx tsx scripts/test-scene-image.ts <sessionId>
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildSceneRequest, buildImagePrompt, generateImage, freeLocalLLMs } from "../lib/atlas/image";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
) as Record<string, string>;
for (const [k, v] of Object.entries(env)) process.env[k] = v; // 라이브러리가 process.env를 읽음

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) { console.error("usage: tsx scripts/test-scene-image.ts <sessionId>"); process.exit(1); }

  const { data: session } = await supa.from("sessions").select("bot_profile_id").eq("id", sessionId).single();
  const { data: bot } = await supa.from("bot_profiles").select("name, appearance_desc, image_style, image_seed").eq("id", session!.bot_profile_id).single();
  const { data: recent } = await supa.from("messages").select("role, content, created_at").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(20);
  const msgs = (recent ?? []).slice().reverse();

  console.log(`\n=== 대화 (최근 ${msgs.length}턴) ===`);
  for (const m of msgs) console.log(`${m.role === "user" ? "상대" : bot!.name}: ${(m.content ?? "").slice(0, 90)}`);

  const scene = await buildSceneRequest(msgs.map((m: any) => ({ role: m.role, content: m.content })));
  console.log(`\n=== 추출된 장면(지금 이 순간) ===\n${scene}`);

  const style = (bot!.image_style === "anime" ? "anime" : "photoreal") as "anime" | "photoreal";
  const composed = await buildImagePrompt(bot!.appearance_desc ?? "", scene, style);
  console.log(`\n=== 빌드된 이미지 프롬프트 ===\n${composed.slice(0, 400)}`);
  if (/BLOCKED_MINOR/i.test(composed)) { console.error("\n🚫 BLOCKED_MINOR — 안전 차단"); return; }

  console.log(`\n생성 중(style=${style}, seed=${bot!.image_seed})…`);
  await freeLocalLLMs(); // SDXL 전 Ollama 언로드(OOM 방지)
  const img = await generateImage(composed, { style, seed: bot!.image_seed });
  const bytes = img.b64 ? Buffer.from(img.b64, "base64") : Buffer.from(await (await fetch(img.url!)).arrayBuffer());
  writeFileSync(new URL("../scratch-scene.png", import.meta.url), bytes);
  console.log(`\n✅ 저장: scratch-scene.png (${bytes.length}B)`);
}
main();
