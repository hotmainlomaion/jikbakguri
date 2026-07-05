// ============================================================
// 모더레이션 단일 진입점 (CLAUDE.md 7-B, 섹션 9).
// 모든 AI 라우트(chat/image, 입력/출력)는 반드시 이 모듈을 통과한다.
// 우회 경로 금지 — chat/image 라우트는 직접 분류 API를 호출하지 말 것.
// ============================================================
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { heuristicScan, type BlockCategory } from "./categories";

export type Channel = "chat_in" | "chat_out" | "image_in" | "image_out";

export type ModerationResult =
  | { pass: true }
  | { pass: false; category: BlockCategory | string; detail?: string };

interface ModerateArgs {
  userId: string | null;
  channel: Channel;
  text?: string; // 텍스트/프롬프트
  imageUrl?: string; // 출력 이미지 스크리닝용
  heuristicOnly?: boolean; // 결정론적 heuristic만(LLM 분류기 생략) — 이미 1차 검사된 파생 텍스트 재검사용(지연 절감)
}

// 외부 텍스트 분류 API. 미설정 시 휴리스틱만으로 동작(fail-safe: 미설정이라고 통과시키지 않음).
async function classifyText(text: string, heuristicOnly = false): Promise<ModerationResult> {
  const url = process.env.MODERATION_TEXT_URL;
  const key = process.env.MODERATION_TEXT_API_KEY;

  // 1차: 결정론적 휴리스틱 백스톱 (항상 실행).
  const hit = heuristicScan(text);
  if (hit) return { pass: false, category: hit, detail: "heuristic" };

  // heuristicOnly: 이미 1차 검사된 입력에서 파생된 텍스트(번역된 이미지 프롬프트 등) 재검사 —
  // heuristic(미성년/불법 결정론 필터)만으로 충분하고, 추가 LLM 호출을 생략해 이미지 경로 지연을 줄인다.
  if (heuristicOnly) return { pass: true };

  // 2차(권장): LLM 기반 의미 분류기(OpenAI 호환) — MODERATION_TEXT_MODEL 설정 시 활성.
  // 성인 콘텐츠는 통과, 미성년/불법만 차단. heuristic이 놓치는 완곡/우회 표현을 잡는다.
  if (process.env.MODERATION_TEXT_MODEL) return classifyTextLLM(text);

  // 2차(대체): 커스텀 외부 분류 API({flagged, category} 계약).
  if (!url || !key) {
    // 미설정 시: 개발은 휴리스틱만으로 진행(pass), 운영(production)은 기본 fail-closed로 차단(#3) —
    // heuristic이 놓치는 완곡/우회 벡터가 무검열 모델에 도달하지 않도록 배포 게이트로 분류기 설정 강제.
    // 단 비공개 지인테스트 한정 MODERATION_TEXT_FAILOPEN=1이면 heuristic(위에서 항상 실행되는 미성년/불법
    // 1차 필터)만으로 통과. 미성년 필터는 그대로 유지되며, 공개/확대 전 반드시 외부 분류기(MODERATION_TEXT_URL) 연결.
    if (process.env.NODE_ENV === "production" && process.env.MODERATION_TEXT_FAILOPEN !== "1")
      return { pass: false, category: "text_screening_unconfigured", detail: "no classifier (prod fail-closed)" };
    return { pass: true };
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ input: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`moderation api ${resp.status}`);
    const data = await resp.json();
    // 구조 기반 파싱(위치 가정 금지). flagged=true 이면 차단.
    if (data?.flagged || data?.results?.[0]?.flagged) {
      const category =
        data?.category ?? data?.results?.[0]?.categories?.[0] ?? "flagged";
      return { pass: false, category, detail: "api" };
    }
    return { pass: true };
  } catch (e) {
    // 분류 실패 시 안전 우선(fail-closed): 통과시키지 않고 차단.
    return { pass: false, category: "moderation_error", detail: String(e) };
  }
}

// 클라우드 텍스트 분류기(OpenAI 호환 LLM). 성인 콘텐츠는 통과, 미성년/불법만 차단.
// heuristicScan(항상 실행되는 결정론적 미성년/불법 1차 필터)이 1차, 이건 완곡·우회 표현을 잡는 2차 의미 분류.
// base/key 미지정 시 ATLAS_LLM_* 재사용. 인프라 오류 시 heuristic이 이미 통과했으므로 앱 중단 방지 위해 통과.
async function classifyTextLLM(text: string): Promise<ModerationResult> {
  const baseURL = process.env.MODERATION_TEXT_BASE_URL ?? process.env.ATLAS_LLM_BASE_URL;
  const apiKey = process.env.MODERATION_TEXT_API_KEY ?? process.env.ATLAS_LLM_API_KEY;
  const model = process.env.MODERATION_TEXT_MODEL!;
  if (!baseURL || !apiKey) return { pass: true }; // 설정 불완전 → heuristic만(항상 실행)
  try {
    const openai = new OpenAI({ baseURL, apiKey });
    const resp = await openai.chat.completions.create(
      {
        model,
        max_tokens: 6,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a child-safety filter for an ADULT (18+) fiction chat where explicit sexual content between " +
              "consenting adults is normal and fully ALLOWED. ASSUME every character is an adult unless the text " +
              "EXPLICITLY names or clearly implies a minor (a child, or an under-18 / young-student figure in a sexual " +
              "context). Output EXACTLY one token. Output BLOCK ONLY when there is an explicit, unambiguous sexual " +
              "reference to a MINOR/child, child sexual abuse, or a real identifiable non-consenting person. For ALL " +
              "other content — including explicit undressing, nudity, body parts, and hardcore sex between adults — " +
              "output OK. When uncertain, output OK. Text may be Korean.",
          },
          { role: "user", content: text.slice(0, 4000) },
        ],
      },
      { timeout: Number(process.env.MODERATION_TEXT_TIMEOUT_MS ?? 8000), maxRetries: 1 }
    );
    const out = (resp.choices?.[0]?.message?.content ?? "").toUpperCase();
    if (out.includes("BLOCK")) return { pass: false, category: "minor", detail: "text-llm" };
    return { pass: true };
  } catch {
    // 분류기 인프라 오류 → heuristic 1차 필터가 이미 통과했으므로 앱 중단 방지 위해 통과(미성년 필터는 유지).
    return { pass: true };
  }
}

async function classifyImage(imageUrl: string): Promise<ModerationResult> {
  const url = process.env.MODERATION_IMAGE_URL;
  const key = process.env.MODERATION_IMAGE_API_KEY;
  const prod = process.env.NODE_ENV === "production";
  // 인프라 오류(스크리너 미설정/타임아웃/에러) 처리: 프로덕션은 fail-closed(차단),
  // 로컬/개발은 fail-open(통과) — 입력에서 이미 미성년 필터를 통과했고, 16GB 로컬에서
  // 비전모델 콜드로드가 메모리 압박으로 자주 실패하기 때문(진짜 미성년 판정은 항상 차단).
  const infraFail = (category: string, detail?: string): ModerationResult =>
    prod ? { pass: false, category, detail } : { pass: true };

  // (A) 커스텀 분류 엔드포인트(로컬 llava 등 {flagged, category} 계약).
  if (url && key) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ image_url: imageUrl }),
        signal: AbortSignal.timeout(Number(process.env.MODERATION_IMAGE_TIMEOUT_MS ?? 180000)),
      });
      if (!resp.ok) throw new Error(`image moderation api ${resp.status}`);
      const data = await resp.json();
      if (data?.flagged) {
        const cat = String(data?.category ?? "flagged");
        if (cat === "screen_error" || cat === "no_image_url") return infraFail(cat, "screener error");
        return { pass: false, category: cat, detail: "api" };
      }
      return { pass: true };
    } catch (e) {
      return infraFail("moderation_error", String(e));
    }
  }

  // (B) 클라우드 비전 LLM(OpenAI 호환) — 로컬 llava 대체(Vercel 등 클라우드). 미성년만 차단, 성인은 통과.
  //     MODERATION_VISION_MODEL 설정 시 활성. base/key 미지정 시 ATLAS_LLM_* 재사용.
  if (process.env.MODERATION_VISION_MODEL) {
    return classifyImageVision(imageUrl, infraFail);
  }

  // (C) 미설정: 프로덕션은 fail-closed(전면 차단)로 안전. 단 비공개 지인테스트 한정으로 IMAGE_SCREENING_FAILOPEN=1
  //     설정 시에만 통과(입력측 미성년 필터·character_age>=18은 여전히 활성). 공개 전 반드시 (A)/(B) 연결.
  if (process.env.IMAGE_SCREENING_FAILOPEN === "1") return { pass: true };
  return infraFail("image_screening_unconfigured", "no classifier");
}

// 클라우드 비전 미성년 스크리너(OpenAI 호환 vision). 성인 콘텐츠는 통과, 미성년/아동만 'minor'로 차단.
async function classifyImageVision(
  imageUrl: string,
  infraFail: (c: string, d?: string) => ModerationResult
): Promise<ModerationResult> {
  const baseURL = process.env.MODERATION_VISION_BASE_URL ?? process.env.ATLAS_LLM_BASE_URL;
  const apiKey = process.env.MODERATION_VISION_API_KEY ?? process.env.ATLAS_LLM_API_KEY;
  const model = process.env.MODERATION_VISION_MODEL!;
  if (!baseURL || !apiKey) return infraFail("image_screening_unconfigured", "vision not configured");
  try {
    const openai = new OpenAI({ baseURL, apiKey });
    const resp = await openai.chat.completions.create(
      {
        model,
        max_tokens: 8,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a strict child-safety image classifier. Judge ONLY apparent age. " +
              "Reply with exactly one word: MINOR if the depicted person appears to be a child/teen/under 18 (or ambiguously youthful), otherwise ADULT. Adult sexual content is allowed and must be ADULT.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Does this image depict a minor (under 18)? Answer MINOR or ADULT." },
              { type: "image_url", image_url: { url: imageUrl } },
            ] as any,
          },
        ],
      },
      { timeout: Number(process.env.MODERATION_IMAGE_TIMEOUT_MS ?? 60000), maxRetries: 1 }
    );
    const out = (resp.choices?.[0]?.message?.content ?? "").toUpperCase();
    if (out.includes("MINOR")) return { pass: false, category: "minor", detail: "vision" };
    if (out.includes("ADULT")) return { pass: true };
    return infraFail("screen_error", "unparseable vision response"); // 판독 불가 → 인프라오류 처리
  } catch (e) {
    return infraFail("moderation_error", String(e));
  }
}

async function log(
  userId: string | null,
  channel: Channel,
  result: ModerationResult
) {
  try {
    const admin = createAdminClient();
    await admin.from("moderation_logs").insert({
      user_id: userId,
      channel,
      verdict: result.pass ? "pass" : "blocked",
      reason: result.pass ? null : (result as any).category,
    });
  } catch {
    // 로깅 실패가 요청을 막지 않도록. (감사 로그는 best-effort지만 차단 판정은 유지)
  }
}

// 공용 모더레이션 함수. 입력·출력 양방향에서 호출.
export async function moderate(args: ModerateArgs): Promise<ModerationResult> {
  let result: ModerationResult;
  if (args.imageUrl) {
    result = await classifyImage(args.imageUrl);
  } else {
    result = await classifyText(args.text ?? "", args.heuristicOnly);
  }
  await log(args.userId, args.channel, result);
  return result;
}
