// GET/POST /api/cron/warm — Novita 모델 웜 유지(opt-in). 이미지가 느린 주원인은 모델 콜드스타트라,
// 주기적으로 아주 작은 생성 핑을 보내 실사/애니 모델을 GPU에 상주시켜 사용자 요청을 빠르게 한다.
// 기본 비활성: IMAGE_KEEP_WARM=1 일 때만 동작(핑마다 소액 Novita 과금 → 켤지는 운영자 선택).
// 보호: purge와 동일하게 CRON_SECRET Bearer 필요(공개 호출로 크레딧 소모 방지).
import { NextResponse } from "next/server";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

// 모델을 GPU에 로드시키기 위한 최소 생성 제출(결과는 기다리지 않음 — fire-and-forget).
// 256x256/4step은 무게 로드만 유발(비용 최소). 폴링/저장/모더레이션 없음.
async function warmModel(model: string): Promise<string> {
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
  if (process.env.IMAGE_KEEP_WARM !== "1") return { enabled: false };
  const models = [process.env.NOVITA_MODEL_PHOTOREAL, process.env.NOVITA_MODEL_ANIME].filter(Boolean) as string[];
  const results = await Promise.allSettled(models.map((m) => warmModel(m)));
  return { enabled: true, results: results.map((r) => (r.status === "fulfilled" ? r.value : "rejected")) };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await warm());
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await warm());
}
