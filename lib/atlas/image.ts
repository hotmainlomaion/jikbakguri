// Atlas Cloud FLUX schnell 래퍼 (CLAUDE.md 4-B). LLM과 다른 REST 포맷/엔드포인트.
// 합성 프롬프트는 호출 전 moderation을 통과해야 한다(라우트가 강제).
// TODO(운영주체 확인): 실제 endpoint 응답 스키마에 맞춰 파싱 확정.

export interface GeneratedImage {
  // 임시 URL 또는 base64. 라우트가 출력 모더레이션 후 Storage에 저장.
  url?: string;
  b64?: string;
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
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`atlas image ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  // 구조 기반 파싱(위치 가정 최소화).
  const item = data?.data?.[0] ?? data?.images?.[0] ?? data;
  return { url: item?.url, b64: item?.b64_json ?? item?.b64 };
}
