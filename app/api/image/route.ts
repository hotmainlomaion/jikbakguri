// POST /api/image — 이미지 루프 (P3).
// 게이트 → 일일상한 → 합성 프롬프트 입력 모더레이션 → FLUX → 출력 이미지 스크리닝 → 저장.
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { reserveImageQuota } from "@/lib/rate-limit";
import { generateImage, buildImagePrompt } from "@/lib/atlas/image";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "generated-images";
const EXPIRY_DAYS = 7; // 만료 정책(7-D)

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { sessionId, prompt } = await req.json().catch(() => ({}));
  if (!sessionId || typeof prompt !== "string" || !prompt.trim())
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profile_id")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== gate.userId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 일일 상한을 '시도' 단위로 원자 예약(감사 #3·#4). 입력 모더레이션 전에 소모해
  // 차단/실패 프롬프트도 쿼터를 쓰게 하고(비용 가드), 동시요청 TOCTOU를 제거한다.
  if (!(await reserveImageQuota(gate.userId)))
    return NextResponse.json({ error: "daily_limit" }, { status: 429 });

  // 봇 외형 고정 프롬프트 + 사용자 요청 합성.
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("appearance_desc, image_style, image_seed")
    .eq("id", session.bot_profile_id)
    .single();
  const identity = bot?.appearance_desc ?? "";
  const style = (bot?.image_style === "anime" ? "anime" : "photoreal") as "anime" | "photoreal";
  const seed = bot?.image_seed ?? null;

  // 1) 입력 모더레이션 — 사용자 원문 의도(한국어 포함)를 호출 전 검사.
  const inMod = await moderate({ userId: gate.userId, channel: "image_in", text: `${identity} ${prompt}` });
  if (!inMod.pass)
    return NextResponse.json({ error: "blocked", category: inMod.category }, { status: 422 });

  // 2) 스타일별 프롬프트 빌드(실사=영어 자연어 / 애니=danbooru 태그). 검열/보정 없음.
  const composed = await buildImagePrompt(identity, prompt, style);
  // 하드리밋(#5): 빌더가 미성년 암시를 감지해 BLOCKED_MINOR를 반환하면 즉시 차단(번역 우회 방어).
  if (/BLOCKED_MINOR/i.test(composed)) {
    await moderate({ userId: gate.userId, channel: "image_in", text: "BLOCKED_MINOR" });
    return NextResponse.json({ error: "blocked", category: "minor" }, { status: 422 });
  }
  // 디버그(로컬 튜닝용): 입력 원문 → 빌드된 영어 프롬프트. 프로덕션은 프롬프트 원문 미저장(7-D)
  // 원칙이므로 IMAGE_DEBUG 플래그가 있을 때만 콘솔에 남긴다.
  if (process.env.IMAGE_DEBUG)
    console.log("[image] user:", JSON.stringify(prompt), "\n[image] built:", JSON.stringify(composed));
  // 백스톱(감사 #6): 빌드된 영어 프롬프트도 heuristic이 아닌 moderate()로 재검사해
  // 외부 텍스트 분류기까지 통과시킨다(번역 과정에서 구체화된 위법 표현 방어). 원문·빌드결과 양쪽 검사.
  const builtMod = await moderate({ userId: gate.userId, channel: "image_in", text: composed });
  if (!builtMod.pass)
    return NextResponse.json({ error: "blocked", category: builtMod.category ?? "minor" }, { status: 422 });

  // 3) 생성(캐릭터 style/seed로 백엔드 분기 + 일관성).
  let img;
  try {
    img = await generateImage(composed, { style, seed });
  } catch {
    return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });
  }

  // 바이트 확보.
  let bytes: Buffer;
  if (img.b64) bytes = Buffer.from(img.b64, "base64");
  else if (img.url) {
    const r = await fetch(img.url);
    bytes = Buffer.from(await r.arrayBuffer());
  } else return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });

  // 3) 출력 이미지 스크리닝 — 저장/반환 전 (7-B 필수).
  // 분류기에 넘길 임시 서명 URL 대신, 우선 Storage에 임시 업로드 후 스크리닝.
  const path = `${gate.userId}/${sessionId}/${Date.now()}.png`;
  await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: false });
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 120);

  const outMod = await moderate({
    userId: gate.userId,
    channel: "image_out",
    imageUrl: signed?.signedUrl,
  });
  if (!outMod.pass) {
    // 차단 → 즉시 삭제, 미반환.
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: "blocked_output", category: outMod.category }, { status: 422 });
  }

  // 통과 → 메타 저장(프롬프트는 해시로, 7-D).
  const promptHash = createHash("sha256").update(composed).digest("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 864e5).toISOString();
  await admin.from("images").insert({
    session_id: sessionId,
    prompt_hash: promptHash,
    storage_path: path,
    expires_at: expiresAt,
  });

  const { data: url } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return NextResponse.json({ url: url?.signedUrl, expiresAt });
}
