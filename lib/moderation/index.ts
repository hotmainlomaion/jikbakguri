// ============================================================
// 모더레이션 단일 진입점 (CLAUDE.md 7-B, 섹션 9).
// 모든 AI 라우트(chat/image, 입력/출력)는 반드시 이 모듈을 통과한다.
// 우회 경로 금지 — chat/image 라우트는 직접 분류 API를 호출하지 말 것.
// ============================================================
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
}

// 외부 텍스트 분류 API. 미설정 시 휴리스틱만으로 동작(fail-safe: 미설정이라고 통과시키지 않음).
async function classifyText(text: string): Promise<ModerationResult> {
  const url = process.env.MODERATION_TEXT_URL;
  const key = process.env.MODERATION_TEXT_API_KEY;

  // 1차: 결정론적 휴리스틱 백스톱 (항상 실행).
  const hit = heuristicScan(text);
  if (hit) return { pass: false, category: hit, detail: "heuristic" };

  // 2차: 외부 분류 API. TODO(운영주체 확인): 실제 API 스키마에 맞춰 파싱.
  if (!url || !key) {
    // API 미설정 — 휴리스틱만으로 판정. 운영 배포 전 반드시 설정할 것.
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

async function classifyImage(imageUrl: string): Promise<ModerationResult> {
  const url = process.env.MODERATION_IMAGE_URL;
  const key = process.env.MODERATION_IMAGE_API_KEY;
  if (!url || !key) {
    // 이미지 출력 스크리닝은 필수(7-B). 미설정이면 fail-closed로 차단.
    // TODO(운영주체 확인): 이미지 분류기 채택 후 활성화.
    return { pass: false, category: "image_screening_unconfigured", detail: "no classifier" };
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ image_url: imageUrl }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`image moderation api ${resp.status}`);
    const data = await resp.json();
    if (data?.flagged) return { pass: false, category: data?.category ?? "flagged", detail: "api" };
    return { pass: true };
  } catch (e) {
    return { pass: false, category: "moderation_error", detail: String(e) };
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
    result = await classifyText(args.text ?? "");
  }
  await log(args.userId, args.channel, result);
  return result;
}
