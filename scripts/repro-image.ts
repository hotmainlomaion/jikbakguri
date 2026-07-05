// /api/image scene 모드 전체 파이프라인 재현(단계별 타이밍/결과). Fix 검증용.
// buildSceneRequest → buildImagePrompt → moderate(image_in) → generateImage → upload/sign → moderate(image_out).
// 실행: npx tsx scripts/repro-image.ts <sessionId>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildSceneRequest, buildImagePrompt, generateImage, freeLocalLLMs } from "../lib/atlas/image";
import { moderate } from "../lib/moderation";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
) as Record<string, string>;
for (const [k, v] of Object.entries(env)) process.env[k] = v;
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const T = () => Date.now();

async function main() {
  const sid = process.argv[2];
  const { data: sess } = await supa.from("sessions").select("user_id,bot_profile_id").eq("id", sid).single();
  const { data: bot } = await supa.from("bot_profiles").select("appearance_desc,image_style,image_seed").eq("id", sess!.bot_profile_id).single();
  const { data: recent } = await supa.from("messages").select("role,content,created_at").eq("session_id", sid).order("created_at", { ascending: false }).limit(20);
  const msgs = (recent ?? []).slice().reverse();

  let t = T();
  const scene = await buildSceneRequest(msgs.map((m: any) => ({ role: m.role, content: m.content })));
  console.log(`[1] buildSceneRequest ${((T()-t)/1000).toFixed(1)}s →`, scene.slice(0, 100));
  const style = (bot!.image_style === "anime" ? "anime" : "photoreal") as "anime" | "photoreal";

  t = T();
  const composed = await buildImagePrompt(bot!.appearance_desc ?? "", scene, style);
  console.log(`[2] buildImagePrompt ${((T()-t)/1000).toFixed(1)}s → ${composed.slice(0,70)}`);
  if (/BLOCKED_MINOR/i.test(composed)) { console.log("🚫 BLOCKED_MINOR"); return; }

  t = T();
  const inMod = await moderate({ userId: sess!.user_id, channel: "image_in", text: `${bot!.appearance_desc} ${scene}` });
  console.log(`[3] moderate image_in ${((T()-t)/1000).toFixed(1)}s → pass=${inMod.pass} ${(inMod as any).category ?? ""}`);
  if (!inMod.pass) { console.log("🚫 input blocked"); return; }

  t = T();
  await freeLocalLLMs(); // SDXL 전 Ollama 언로드(OOM 방지)
  console.log(`[3.5] freeLocalLLMs ${((T()-t)/1000).toFixed(1)}s`);
  t = T();
  const img = await generateImage(composed, { style, seed: bot!.image_seed });
  const bytes = img.b64 ? Buffer.from(img.b64, "base64") : Buffer.from(await (await fetch(img.url!)).arrayBuffer());
  console.log(`[4] generateImage ${((T()-t)/1000).toFixed(1)}s → ${bytes.length}B`);

  t = T();
  const path = `${sess!.user_id}/${sid}/repro_${bytes.length}.png`;
  await supa.storage.from("generated-images").upload(path, bytes, { contentType: "image/png", upsert: true });
  const { data: signed } = await supa.storage.from("generated-images").createSignedUrl(path, 180);
  console.log(`[5] upload+sign ${((T()-t)/1000).toFixed(1)}s`);

  t = T();
  const outMod = await moderate({ userId: sess!.user_id, channel: "image_out", imageUrl: signed?.signedUrl });
  console.log(`[6] moderate image_out ${((T()-t)/1000).toFixed(1)}s → pass=${outMod.pass} ${(outMod as any).category ?? ""}`);

  console.log(outMod.pass ? "\n✅ 최종 성공 — 이미지 반환됨" : "\n❌ 최종 차단 — " + outMod.category);
  await supa.storage.from("generated-images").remove([path]);
}
main().catch((e) => console.log("ERR", String(e).slice(0, 300)));
