// Atlas Cloud LLM 래퍼 (OpenAI Chat Completions 호환, CLAUDE.md 4-A).
// baseURL만 Atlas로 교체. 키는 서버 전용. 모더레이션은 호출부(라우트)가 책임 —
// 이 래퍼는 "호출"만 하고 무엇을 호출해도 되는지 판단하지 않는다(atlas-integration 규칙).
import OpenAI from "openai";
import type { ChatMessage } from "./types";

function client() {
  const baseURL = process.env.ATLAS_LLM_BASE_URL;
  const apiKey = process.env.ATLAS_LLM_API_KEY;
  if (!baseURL || !apiKey) throw new Error("ATLAS_LLM env not configured"); // TODO(운영주체 확인)
  return new OpenAI({ baseURL, apiKey });
}

// 무상태 LLM → 매 요청 컨텍스트 전체 재전송(system + history + new).
// opts.model로 모델 오버라이드(예: 이미지 프롬프트 번역은 영어 깨끗한 별도 모델).
// 타임아웃은 로컬 대형 모델(14B, 16GB) 콜드 로드를 감안해 넉넉히(env 조정).
export async function chatComplete(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number; timeoutMs?: number; maxTokens?: number; maxRetries?: number }
): Promise<string> {
  const model = opts?.model ?? process.env.ATLAS_LLM_MODEL;
  if (!model) throw new Error("ATLAS_LLM_MODEL not set"); // TODO(운영주체 확인)
  // 이미지 경로의 보조 호출(장면요약·프롬프트번역)은 짧은 timeoutMs + maxRetries:0으로 즉시 폴백해
  // Vercel 함수 60초 예산 초과(504)를 막는다. (OpenAI SDK 기본 maxRetries=2라 타임아웃이 3배로 곱해짐)
  const resp = await client().chat.completions.create(
    { model, messages, temperature: opts?.temperature ?? 0.8, max_tokens: opts?.maxTokens ?? 800 },
    {
      timeout: opts?.timeoutMs ?? Number(process.env.ATLAS_LLM_TIMEOUT_MS ?? 180_000),
      maxRetries: opts?.maxRetries ?? 1,
    }
  );
  const content = resp.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty LLM response");
  return content;
}

// 스트리밍 변형: 토큰 델타가 올 때마다 onToken(delta)을 부르고, 완료 시 전체 텍스트를 반환한다.
// 라우트가 SSE로 클라이언트에 흘려 '실시간 타이핑' 체감을 준다. 모더레이션 책임은 여전히 호출부.
export async function chatStream(
  messages: ChatMessage[],
  onToken: (delta: string, full: string) => void | Promise<void>,
  opts?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const model = opts?.model ?? process.env.ATLAS_LLM_MODEL;
  if (!model) throw new Error("ATLAS_LLM_MODEL not set");
  const stream = await client().chat.completions.create({
    model,
    messages,
    temperature: opts?.temperature ?? 0.8,
    max_tokens: opts?.maxTokens ?? 800,
    stream: true,
  });
  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (!delta) continue;
    full += delta;
    await onToken(delta, full);
  }
  if (!full) throw new Error("empty LLM response");
  return full;
}
