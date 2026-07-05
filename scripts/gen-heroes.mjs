// 갤러리 상단 히어로 배너 전용 '와이드' 이미지 생성·업로드.
// 아바타(세로)를 object-cover로 와이드 크롭하면 얼굴이 잘리므로, 배너 비율(1536x640≈2.4:1)에
// 맞춰 얼굴이 프레임 안에 온전히 들어오도록 별도 제작한다. 아바타와 동일 seed·정체성 태그로 얼굴 일관성 유지.
// 사용: node scripts/gen-heroes.mjs            (기본: 히어로에 도는 첫 5개 봇)
//       node scripts/gen-heroes.mjs 정유나 강하린 ...
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

// 배너 해상도(SDXL 와이드 버킷, ~1M px). object-cover가 좌우/상하 최소 크롭.
const W = 1536, H = 640;

// 실사 미감(gen-avatars.mjs와 동기화 — 아바타와 동일 계열 얼굴).
const KOREAN_BEAUTY =
  "natural Korean beauty aesthetic, Korean clean-girl look, dewy luminous glass skin, warm fair skin tone, " +
  "soft natural makeup, straight soft eyebrows, gradient tinted coral lips, refined delicate feminine features, " +
  "slim v-line jaw, photogenic korean instagram idol style, soft natural cinematic lighting, DSLR 85mm, " +
  "shallow depth of field, photorealistic, highly detailed, sharp focus";

// 와이드 배너 프레이밍: 얼굴이 온전히 프레임 안(상단 헤드룸), 중앙 구도, 모던 캐주얼.
// 'official art/key visual/detailed background'는 판타지·전통복·왕관 아티팩트를 유발해 배제.
function buildHeroPrompt(desc, style) {
  return style === "anime"
    ? `${desc}, solo, 1girl, upper body, looking at viewer, soft gentle smile, ` +
      `modern casual outfit, contemporary fashion, no headwear, bare head, ` +
      `full head and face clearly visible, entire head inside the frame, top of the hair visible, ` +
      `wide empty space above the head, zoomed out, head in the lower center of the frame, ` +
      `plain soft gradient studio background, cinematic soft lighting, depth of field`
    : `solo, one woman, fully clothed, tasteful, ${desc}, waist up, upper body, looking at camera, ` +
      `modern casual chic outfit, head fully in frame with generous headroom above the head, centered, ` +
      `soft blurred studio background, cinematic soft lighting, editorial fashion photography, ${KOREAN_BEAUTY}`;
}

const DEFAULT_NAMES = ["정유나", "강하린", "한미나", "김하나", "윤세라"];
const names = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_NAMES;

for (const name of names) {
  const { data: bot } = await supa
    .from("bot_profiles")
    .select("id, appearance_desc, image_style, image_seed")
    .eq("name", name)
    .single();
  if (!bot) { console.error(`[${name}] not found`); continue; }

  const prompt = buildHeroPrompt(bot.appearance_desc, bot.image_style);
  // 구도 재시도용 seed 오버라이드(HERO_SEED). 정체성 태그는 유지되어 얼굴은 유사, 구도만 달라짐.
  const seed = process.env.HERO_SEED ? Number(process.env.HERO_SEED) : bot.image_seed;
  console.error(`[${name}] generating hero ${W}x${H} (${bot.image_style}, seed ${seed})…`);
  const t0 = Date.now();
  const resp = await fetch(IMG_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.ATLAS_IMAGE_API_KEY || "local"}` },
    body: JSON.stringify({ prompt, style: bot.image_style, seed, steps: bot.image_style === "anime" ? 26 : 22, width: W, height: H }),
  });
  if (!resp.ok) { console.error(`[${name}] gen failed ${resp.status}: ${(await resp.text()).slice(0, 300)}`); continue; }
  const data = await resp.json();
  const b64 = data.b64 || data?.data?.[0]?.b64_json;
  if (!b64) { console.error(`[${name}] no image in response`); continue; }
  const bytes = Buffer.from(b64, "base64");
  console.error(`[${name}] generated in ${Math.round((Date.now() - t0) / 1000)}s (${bytes.length}B)`);

  const path = `heroes/${bot.id}.png`;
  const up = await supa.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) { console.error(`[${name}] upload err: ${up.error.message}`); continue; }

  // 기존 hero primary 해제 후 새 대표 반영. 경로 고정(heroes/<id>.png) → uniq_charimg_path 충돌 시 upsert.
  await supa.from("character_images").update({ is_primary: false }).eq("bot_profile_id", bot.id).eq("category", "hero");
  const { error: insErr } = await supa.from("character_images").upsert({
    bot_profile_id: bot.id,
    category: "hero",
    storage_path: path,
    content_type: "image/png",
    byte_size: bytes.length,
    width: W,
    height: H,
    is_primary: true,
    review_status: "approved",
  }, { onConflict: "storage_path" });
  if (insErr) { console.error(`[${name}] db err: ${insErr.message}`); continue; }
  console.error(`[${name}] ✅ hero set`);
}
console.error("done");
