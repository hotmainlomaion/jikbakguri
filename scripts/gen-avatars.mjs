// 캐릭터 대표 아바타 생성·업로드(운영자 큐레이션 보조).
// 로컬 이미지 서버(ATLAS_IMAGE_BASE_URL)로 캐릭터 appearance_desc+style+seed 생성 →
// character-images 버킷 업로드 → character_images(avatar, is_primary, approved) 업서트.
// 사용: node scripts/gen-avatars.mjs Mina Hana Sera
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.local 파싱(스크립트는 자동 로드 안 됨).
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const IMG_URL = env.ATLAS_IMAGE_BASE_URL || "http://127.0.0.1:8080/";
const BUCKET = "character-images";
const names = process.argv.slice(2);
if (!names.length) { console.error("usage: node scripts/gen-avatars.mjs <Name...>"); process.exit(1); }

// 실사 기본 미감: K-뷰티 스타일 프로파일(lib/atlas/image.ts KOREAN_BEAUTY_STYLE와 동기화).
const KOREAN_BEAUTY =
  "natural Korean beauty aesthetic, Korean clean-girl look, dewy luminous glass skin, warm fair skin tone, " +
  "soft natural makeup, straight soft eyebrows, gradient tinted coral lips, refined delicate feminine features, " +
  "slim v-line jaw, photogenic korean instagram idol style, soft natural cinematic lighting, DSLR 85mm portrait, " +
  "shallow depth of field, photorealistic, highly detailed, sharp focus";

function buildPrompt(desc, style) {
  return style === "anime"
    ? `${desc}, upper body, looking at viewer, solo`
    // 실사 아바타는 갤러리 브라우즈용 → 옷 입은 상태 명시(Lustify NSFW 모델이 노출로 흐르지 않게).
    : `solo, one woman, fully clothed, tasteful, ${desc}, upper body portrait, looking at camera, ${KOREAN_BEAUTY}`;
}

for (const name of names) {
  const { data: bot } = await supa
    .from("bot_profiles")
    .select("id, appearance_desc, image_style, image_seed")
    .eq("name", name)
    .single();
  if (!bot) { console.error(`[${name}] not found`); continue; }

  const prompt = buildPrompt(bot.appearance_desc, bot.image_style);
  console.error(`[${name}] generating (${bot.image_style}, seed ${bot.image_seed})…`);
  const resp = await fetch(IMG_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.ATLAS_IMAGE_API_KEY || "local"}` },
    body: JSON.stringify({ prompt, style: bot.image_style, seed: bot.image_seed, steps: bot.image_style === "anime" ? 26 : 4 }),
  });
  if (!resp.ok) { console.error(`[${name}] gen failed ${resp.status}: ${(await resp.text()).slice(0, 200)}`); continue; }
  const data = await resp.json();
  const b64 = data.b64 || data?.data?.[0]?.b64_json;
  if (!b64) { console.error(`[${name}] no image in response`); continue; }
  const bytes = Buffer.from(b64, "base64");

  const path = `avatars/${bot.id}.png`;
  const up = await supa.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) { console.error(`[${name}] upload err: ${up.error.message}`); continue; }

  // 기존 avatar primary 해제 후 새 대표 반영. 경로가 고정(avatars/<id>.png)이라 재생성 시
  // 동일 storage_path 행이 이미 있으므로 insert는 uniq_charimg_path와 충돌 → upsert(onConflict)로
  // 기존 행을 갱신(byte_size·primary·approved)한다. 최초 생성이면 insert처럼 동작.
  await supa.from("character_images").update({ is_primary: false }).eq("bot_profile_id", bot.id).eq("category", "avatar");
  const { error: insErr } = await supa.from("character_images").upsert({
    bot_profile_id: bot.id,
    category: "avatar",
    storage_path: path,
    content_type: "image/png",
    byte_size: bytes.length,
    is_primary: true,
    review_status: "approved",
  }, { onConflict: "storage_path" });
  if (insErr) { console.error(`[${name}] db err: ${insErr.message}`); continue; }
  console.error(`[${name}] ✅ avatar set (${bytes.length}B)`);
}
console.error("done");
