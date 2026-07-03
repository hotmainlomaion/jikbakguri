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
export async function buildImagePrompt(identity: string, userRequest: string): Promise<string> {
  const sys =
    "You are an expert prompt engineer for a text-to-image model (FLUX) that ONLY understands ENGLISH. " +
    "Output MUST be entirely in English — never Korean, Chinese, or any other language. " +
    "Convert the request into ONE concise English image prompt — comma-separated visual tags/phrases. " +
    "From the character description keep ONLY physical identity (face, hair, body, adult features) and IGNORE any clothing it mentions. " +
    "The user's request fully controls clothing, state of undress, pose, action, mood, and setting — follow it EXACTLY and literally, " +
    "including explicit/NSFW details. Do NOT soften, censor, add clothing, moralize, or change the intent. " +
    "The subject is always an adult (18+). Append quality tags: photorealistic, highly detailed, cinematic lighting. " +
    "Output ONLY the final English prompt — no preamble, no quotes, no explanation, no non-English text.";
  const user = `Character physical identity (ignore its clothing): ${identity}\nUser request (translate to English & obey literally): ${userRequest}\n\nEnglish image prompt:`;
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

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const baseURL = process.env.ATLAS_IMAGE_BASE_URL;
  const apiKey = process.env.ATLAS_IMAGE_API_KEY;
  const model = process.env.ATLAS_IMAGE_MODEL ?? "flux-schnell";
  if (!baseURL || !apiKey) throw new Error("ATLAS_IMAGE env not configured"); // TODO(운영주체 확인)

  const resp = await fetch(baseURL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, steps: 4, n: 1 }),
    // 로컬 FLUX(16GB, 스트리밍 양자화)는 첫 생성이 느릴 수 있어 여유 있게.
    signal: AbortSignal.timeout(Number(process.env.ATLAS_IMAGE_TIMEOUT_MS ?? 300_000)),
  });
  if (!resp.ok) throw new Error(`atlas image ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  // 구조 기반 파싱(위치 가정 최소화).
  const item = data?.data?.[0] ?? data?.images?.[0] ?? data;
  return { url: item?.url, b64: item?.b64_json ?? item?.b64 };
}
