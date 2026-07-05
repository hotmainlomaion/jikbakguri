// GET/POST /api/cron/warm — 핫패스 모델을 주기적으로 데워 콜드스타트 스파이크를 없앤다.
// 뜸하게 쓰다 처음 요청할 때의 지연(모델 GPU 미상주)이 챗·이미지 느림의 숨은 주범이라,
// 5분마다 아주 작은 핑을 보내 모델을 상주시킨다.
//  · LLM(챗 Stheno + 프롬프트빌더 폴백 + 모더레이션 Qwen): Featherless 구독 정액 → 추가비용 없음 → 항상 워밍.
//  · 이미지 모델(Atlas 실사 flux + Novita 애니): 핑마다 소액 과금 → IMAGE_KEEP_WARM=1일 때만.
// 보호: purge와 동일하게 CRON_SECRET Bearer 필요(공개 호출 방지).
import { NextResponse } from "next/server";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

// OpenAI 호환 LLM(Featherless)에 1토큰 완성 핑 → 모델을 GPU에 상주시킴(정액이라 무과금).
async function warmLLM(model: string | undefined): Promise<string> {
  const baseURL = process.env.ATLAS_LLM_BASE_URL;
  const apiKey = process.env.ATLAS_LLM_API_KEY;
  if (!baseURL || !apiKey || !model) return "skip";
  try {
    const r = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1, temperature: 0, messages: [{ role: "user", content: "hi" }] }),
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok ? "warmed" : `err_${r.status}`;
  } catch {
    return "err";
  }
}

// Atlas 이미지(실사 flux) 최소 제출로 모델 로드(fire-and-forget, 소액 과금).
async function warmAtlasImage(): Promise<string> {
  const key = process.env.ATLASCLOUD_API_KEY;
  const base = process.env.ATLASCLOUD_BASE ?? "https://api.atlascloud.ai";
  const model = process.env.ATLASCLOUD_MODEL_PHOTOREAL;
  if (!key || !model) return "skip";
  try {
    const r = await fetch(`${base}/api/v1/model/generateImage`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: "portrait, woman" }),
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok ? "warmed" : `err_${r.status}`;
  } catch {
    return "err";
  }
}

// Novita(애니) 최소 생성 제출로 모델 상주(폴링/저장/모더레이션 없음).
async function warmNovita(model: string | undefined): Promise<string> {
  const key = process.env.NOVITA_API_KEY;
  const base = process.env.NOVITA_BASE_URL ?? "https://api.novita.ai";
  if (!key || !model) return "skip";
  try {
    const r = await fetch(`${base}/v3/async/txt2img`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        extra: { response_image_type: "jpeg" },
        request: {
          model_name: model, prompt: "1girl", negative_prompt: "",
          width: 256, height: 256, image_num: 1, steps: 4, guidance_scale: 1.5,
          sampler_name: "Euler a", seed: -1,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok ? "warmed" : `err_${r.status}`;
  } catch {
    return "err";
  }
}

async function warm() {
  // LLM 워밍은 항상(무과금): 챗/프롬프트빌더(Stheno) + 모더레이션(Qwen).
  const llm = await Promise.allSettled([
    warmLLM(process.env.ATLAS_LLM_MODEL),
    warmLLM(process.env.MODERATION_TEXT_MODEL),
  ]);
  const out: Record<string, unknown> = {
    llm: llm.map((r) => (r.status === "fulfilled" ? r.value : "rejected")),
  };
  // 이미지 모델 워밍은 과금 → 플래그 하에서만: Atlas 실사 + Novita 애니.
  if (process.env.IMAGE_KEEP_WARM === "1") {
    const img = await Promise.allSettled([warmAtlasImage(), warmNovita(process.env.NOVITA_MODEL_ANIME)]);
    out.image = { enabled: true, results: img.map((r) => (r.status === "fulfilled" ? r.value : "rejected")) };
  } else {
    out.image = { enabled: false };
  }
  return out;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await warm());
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await warm());
}
