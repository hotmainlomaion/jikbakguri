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
  opts?: { model?: string; temperature?: number }
): Promise<string> {
  const model = opts?.model ?? process.env.ATLAS_LLM_MODEL;
  if (!model) throw new Error("ATLAS_LLM_MODEL not set"); // TODO(운영주체 확인)
  const resp = await client().chat.completions.create(
    { model, messages, temperature: opts?.temperature ?? 0.8, max_tokens: 800 },
    { timeout: Number(process.env.ATLAS_LLM_TIMEOUT_MS ?? 180_000) }
  );
  const content = resp.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty LLM response");
  return content;
}
