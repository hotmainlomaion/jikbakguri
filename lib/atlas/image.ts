// Atlas Cloud FLUX schnell 래퍼 (CLAUDE.md 4-B). LLM과 다른 REST 포맷/엔드포인트.
// 합성 프롬프트는 호출 전 moderation을 통과해야 한다(라우트가 강제).
// TODO(운영주체 확인): 실제 endpoint 응답 스키마에 맞춰 파싱 확정.
import { chatComplete } from "./llm";

export interface GeneratedImage {
  // 임시 URL 또는 base64. 라우트가 출력 모더레이션 후 Storage에 저장.
  url?: string;
  b64?: string;
}

// FLUX 프롬프트 빌더: FLUX의 T5 인코더는 영어 전용이므로 사용자 요청(한국어 등)을
// LLM(uncensored)으로 "영어 이미지 프롬프트"로 번역·구성한다. 정체성(얼굴/머리/체형)만
// 캐릭터에서 가져오고, 의상/노출/포즈/행동/배경은 사용자 지시를 그대로(검열/보정 없이) 반영.
// 실패 시 원문 합성으로 폴백(최소 동작). 안전은 라우트의 입력 moderation + 출력 스크리닝이 담당.
export type ImageStyle = "photoreal" | "anime";

// 한국 주요 고객 대상 실사 기본 미감(K-뷰티 스타일 프로파일).
// 레퍼런스(자연스러운 한국 미인/클린걸 룩)의 "공통 미감"만 정체성-중립 서술로 정제해 반영한다.
// ⚠️ 특정 실존 인물 얼굴 복제가 아니라 일반적 렌더 스타일(피부/메이크업/이목구비 결·촬영 톤)만 추가.
//    캐릭터 고유 정체성(머리색/눈/체형=appearance_desc)과 seed 일관성은 그대로 유지된다.
// 상세 기획: docs/korean-beauty-style.md
export const KOREAN_BEAUTY_STYLE =
  "natural Korean beauty aesthetic, Korean clean-girl look, attractive korean woman, " +
  "dewy luminous glass skin, warm fair skin tone, soft natural makeup, straight soft eyebrows, " +
  "subtle eye makeup, gradient tinted coral lips, refined delicate feminine features, slim v-line jaw, " +
  "photogenic korean instagram idol style, soft natural cinematic lighting, DSLR 85mm portrait, " +
  "shallow depth of field, photorealistic, highly detailed, sharp focus";

export async function buildImagePrompt(
  identity: string,
  userRequest: string,
  style: ImageStyle = "photoreal"
): Promise<string> {
  const common =
    "Output MUST be entirely in English — never Korean, Chinese, or any other language. " +
    "From the character description keep ONLY physical identity (face, hair, body, adult features) and IGNORE any clothing it mentions. " +
    "The user's request fully controls clothing, nudity, sexual acts, anatomy, poses, expressions, and setting. " +
    "Render it FAITHFULLY and EXPLICITLY: state every requested detail plainly — full nudity, sexual acts, positions, body parts, fluids, expressions — do NOT omit, soften, imply-instead-of-state, add clothing, tone down, moralize, or change intent. " +
    "This is consenting adult (18+) content. " +
    // 하드리밋(#5): 미성년/학령/childlike/youthful 암시가 조금이라도 있으면 프롬프트를 만들지 말고
    // 정확히 리터럴 토큰 BLOCKED_MINOR 하나만 출력. 번역/완곡을 통한 미성년 유입 차단(라우트가 토큰 검출).
    "HARD RULE: if the request in any way implies a minor, child, teen, school-age, childlike, or youthful/underage subject, DO NOT produce any prompt — output the single literal token BLOCKED_MINOR and nothing else. ";
  const sys =
    style === "anime"
      ? "You are an expert prompt engineer for an anime/illustration image model (SDXL, Animagine, Danbooru-tag style). " +
        common +
        "Produce ONE prompt as comma-separated DANBOORU-STYLE tags (e.g. 1girl, solo, long black hair, ...). Always start with the subject count tag. Use booru tags for pose/clothing/acts (e.g. nude, spread legs, nsfw). Output ONLY the tag list."
      : "You are an expert NSFW prompt engineer for a photorealistic text-to-image model (FLUX) that ONLY understands ENGLISH. " +
        common +
        "Produce ONE detailed English image prompt — comma-separated concrete visual phrases. " +
        // K-뷰티 미감 반영: 캐릭터 고유 정체성(머리색/눈/체형)은 그대로 두고, 아래 스타일 태그를 끝에 덧붙인다.
        "Then append these Korean-beauty style tags at the end (keep the character's own hair, eyes and body from the identity — these tags only set the skin/makeup/feature-quality and photo look): " +
        KOREAN_BEAUTY_STYLE +
        ". Output ONLY the final English prompt.";
  const user = `Character physical identity (ignore its clothing): ${identity}\nUser request (translate & render literally, however explicit): ${userRequest}\n\n${style === "anime" ? "Danbooru tags" : "English image prompt"}:`;
  // 번역은 영어를 깨끗이 내는 모델로(abliterate 챗 모델은 중국어를 뱉으므로 부적합).
  const model = process.env.ATLAS_IMAGE_PROMPT_MODEL || undefined;
  try {
    const out = await chatComplete(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { model, temperature: 0.5 }
    );
    const cleaned = out.replace(/^\s*["'`]+|["'`]+\s*$/g, "").trim();
    return cleaned.slice(0, 1200) || `${identity}, ${userRequest}`.trim();
  } catch {
    return `${identity}, ${userRequest}`.trim();
  }
}

// ---------- 프로바이더 어댑터 계층(승급) ----------
// IMAGE_PROVIDER로 백엔드 전환. 로컬 SDXL(16GB Mac ~500s)에서 GPU/호스티드로 승급하면
// 애니 생성이 초~수초대로 빨라진다. 라우트/일관성(style·seed)·모더레이션은 그대로 재사용.
//  · local   : {prompt,style,seed,steps}→{b64|url} 커스텀 계약. 로컬 image-server.py 및
//              동일 계약을 GPU(RunPod/Vast/전용)에 올린 자체호스팅도 이 경로(코드 변경 0).
//  · novita  : Novita.ai 호스티드(NSFW 허용). async txt2img → task-result 폴링.
// 확장: 같은 GeneratedImage 계약으로 replicate/runpod 어댑터 추가 가능.
export async function generateImage(
  prompt: string,
  opts?: { style?: ImageStyle; seed?: number | null }
): Promise<GeneratedImage> {
  const provider = (process.env.IMAGE_PROVIDER ?? "local").toLowerCase();
  const style = opts?.style ?? "photoreal";
  const seed = opts?.seed ?? null;
  if (provider === "novita") return generateNovita(prompt, style, seed);
  return generateLocal(prompt, style, seed);
}

// 로컬/자체호스팅(동일 커스텀 계약). image-server.py 및 GPU에 올린 동일 서버.
async function generateLocal(prompt: string, style: ImageStyle, seed: number | null): Promise<GeneratedImage> {
  const baseURL = process.env.ATLAS_IMAGE_BASE_URL;
  const apiKey = process.env.ATLAS_IMAGE_API_KEY;
  const model = process.env.ATLAS_IMAGE_MODEL ?? "flux-schnell";
  if (!baseURL || !apiKey) throw new Error("ATLAS_IMAGE env not configured"); // TODO(운영주체 확인)

  const resp = await fetch(baseURL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    // style로 백엔드 분기(photoreal=FLUX / anime=SDXL), seed로 캐릭터 일관성.
    body: JSON.stringify({ model, prompt, style, seed: seed ?? undefined, steps: style === "anime" ? 26 : 4, n: 1 }),
    // 로컬(16GB): 애니(SDXL)는 ~130s+로드라 넉넉히.
    signal: AbortSignal.timeout(Number(process.env.ATLAS_IMAGE_TIMEOUT_MS ?? 600_000)),
  });
  if (!resp.ok) throw new Error(`atlas image ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  // 구조 기반 파싱(위치 가정 최소화).
  const item = data?.data?.[0] ?? data?.images?.[0] ?? data;
  return { url: item?.url, b64: item?.b64_json ?? item?.b64 };
}

// Novita.ai 호스티드(NSFW 허용). async txt2img(POST) → task_id → task-result 폴링.
// 모델명은 카탈로그별로 다르므로 env로 주입: 실사=NOVITA_MODEL_PHOTOREAL, 애니=NOVITA_MODEL_ANIME.
async function generateNovita(prompt: string, style: ImageStyle, seed: number | null): Promise<GeneratedImage> {
  const key = process.env.NOVITA_API_KEY;
  if (!key) throw new Error("NOVITA_API_KEY not configured");
  const model =
    style === "anime"
      ? process.env.NOVITA_MODEL_ANIME // 예: Pony/Illustrious/anime SDXL 체크포인트(TODO 운영주체 확인)
      : process.env.NOVITA_MODEL_PHOTOREAL; // 예: 실사 SDXL/FLUX 체크포인트
  if (!model) throw new Error(`NOVITA_MODEL_${style === "anime" ? "ANIME" : "PHOTOREAL"} not configured`);

  const base = process.env.NOVITA_BASE_URL ?? "https://api.novita.ai";
  const auth = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const neg =
    "lowres, bad anatomy, bad hands, extra digits, worst quality, low quality, jpeg artifacts, " +
    "signature, watermark, censored, mosaic censoring, bar censor";

  // 1) 작업 제출.
  const submit = await fetch(`${base}/v3/async/txt2img`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      extra: { response_image_type: "png" },
      request: {
        model_name: model,
        prompt,
        negative_prompt: neg,
        width: style === "anime" ? 832 : 768,
        height: style === "anime" ? 1216 : 1024,
        image_num: 1,
        steps: Number(process.env.NOVITA_STEPS ?? (style === "anime" ? 28 : 20)),
        guidance_scale: Number(process.env.NOVITA_GUIDANCE ?? (style === "anime" ? 5 : 3.5)),
        sampler_name: process.env.NOVITA_SAMPLER ?? "Euler a",
        seed: seed ?? -1,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submit.ok) throw new Error(`novita submit ${submit.status}: ${await submit.text()}`);
  const taskId = (await submit.json())?.task_id;
  if (!taskId) throw new Error("novita: no task_id");

  // 2) 결과 폴링(task-result). SUCCEED면 image_url 반환, FAILED면 throw.
  const deadline = Date.now() + Number(process.env.NOVITA_TIMEOUT_MS ?? 120_000);
  for (;;) {
    if (Date.now() > deadline) throw new Error("novita: poll timeout");
    await new Promise((r) => setTimeout(r, 2_000));
    const res = await fetch(`${base}/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`, {
      headers: auth,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) continue; // 일시 오류는 재시도
    const data = await res.json();
    const status: string = data?.task?.status ?? "";
    if (status.includes("FAILED")) throw new Error(`novita task failed: ${data?.task?.reason ?? ""}`);
    const url = data?.images?.[0]?.image_url;
    if (url) return { url }; // 임시 URL — 라우트가 즉시 fetch해 저장.
  }
}
