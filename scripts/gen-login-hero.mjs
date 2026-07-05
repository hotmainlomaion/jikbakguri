// 로그인 히어로 이미지 생성(로컬 FLUX). 성인 서비스 무드의 "정체성 없는" 우아·관능 K-뷰티 무드컷.
// ⚠️ 특정 실존 인물 얼굴 복제 금지 — 일반적 K-뷰티 미감만. 노골 아님(로그인은 무드 세팅).
// 저장: public/login-hero.png. 실행: node scripts/gen-login-hero.mjs
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const IMG_URL = env.ATLAS_IMAGE_BASE_URL || "http://127.0.0.1:8080/";

const KOREAN_BEAUTY =
  "natural Korean beauty aesthetic, Korean clean-girl look, dewy luminous glass skin, warm fair skin tone, " +
  "soft natural makeup, straight soft eyebrows, gradient tinted coral lips, refined delicate feminine features, " +
  "slim v-line jaw, photogenic korean instagram idol style, soft natural cinematic lighting, DSLR 85mm portrait, " +
  "shallow depth of field, photorealistic, highly detailed, sharp focus";

const prompt =
  "cinematic mood portrait of an elegant attractive korean woman in her late twenties, " +
  "sitting in a dimly lit luxurious lounge late at night, warm city bokeh through a window behind her, " +
  "wearing an elegant off-shoulder dress, soft alluring gaze toward the camera, chin resting on hand, " +
  "low-key moody lighting, sensual but tasteful and classy, deep shadows, magenta and amber accents, " +
  "upper body, " + KOREAN_BEAUTY;

const resp = await fetch(IMG_URL, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${env.ATLAS_IMAGE_API_KEY || "local"}` },
  body: JSON.stringify({ prompt, style: "photoreal", seed: 190190, steps: 4 }),
});
if (!resp.ok) { console.error(`gen failed ${resp.status}: ${(await resp.text()).slice(0, 300)}`); process.exit(1); }
const data = await resp.json();
const b64 = data.b64 || data?.data?.[0]?.b64_json;
if (!b64) { console.error("no image in response"); process.exit(1); }
const bytes = Buffer.from(b64, "base64");
const out = new URL("../public/login-hero.png", import.meta.url);
writeFileSync(out, bytes);
console.error(`✅ login-hero.png 저장 (${bytes.length}B)`);
