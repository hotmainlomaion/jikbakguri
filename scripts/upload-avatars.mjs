// avatar-batch.py가 생성한 /tmp/av_<id>.png들을 Supabase Storage에 업로드하고
// character_images(avatar, is_primary, approved)를 upsert(onConflict storage_path)한다.
// 매니페스트: /tmp/av-manifest.json. 실행: node scripts/upload-avatars.mjs
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = "character-images";

const items = JSON.parse(readFileSync("/tmp/av-manifest.json", "utf8"));
for (const it of items) {
  const png = `/tmp/av_${it.id}.png`;
  if (!existsSync(png)) { console.error(`[${it.name}] 파일 없음 ${png} — 스킵`); continue; }
  const bytes = readFileSync(png);
  const path = `avatars/${it.id}.png`;
  const up = await supa.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) { console.error(`[${it.name}] upload err: ${up.error.message}`); continue; }
  await supa.from("character_images").update({ is_primary: false }).eq("bot_profile_id", it.id).eq("category", "avatar");
  const { error } = await supa.from("character_images").upsert({
    bot_profile_id: it.id,
    category: "avatar",
    storage_path: path,
    content_type: "image/png",
    byte_size: bytes.length,
    is_primary: true,
    review_status: "approved",
  }, { onConflict: "storage_path" });
  if (error) { console.error(`[${it.name}] db err: ${error.message}`); continue; }
  console.error(`[${it.name}] ✅ 아바타 갱신 (${bytes.length}B)`);
}
console.error("done");
