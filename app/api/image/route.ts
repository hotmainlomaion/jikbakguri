// POST /api/image — 이미지 루프 (P3).
// 게이트 → 일일상한 → 합성 프롬프트 입력 모더레이션 → FLUX → 출력 이미지 스크리닝 → 저장.
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { heuristicScan } from "@/lib/moderation/categories";
import { checkDailyImageLimit } from "@/lib/rate-limit";
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

  if (!(await checkDailyImageLimit(gate.userId)))
    return NextResponse.json({ error: "daily_limit" }, { status: 429 });

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profile_id")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== gate.userId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 봇 외형 고정 프롬프트 + 사용자 요청 합성.
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("appearance_desc")
    .eq("id", session.bot_profile_id)
    .single();
  const identity = bot?.appearance_desc ?? "";

  // 1) 입력 모더레이션 — 사용자 원문 의도(한국어 포함)를 호출 전 검사.
  const inMod = await moderate({ userId: gate.userId, channel: "image_in", text: `${identity} ${prompt}` });
  if (!inMod.pass)
    return NextResponse.json({ error: "blocked", category: inMod.category }, { status: 422 });

  // 2) 영어 이미지 프롬프트 빌드(FLUX는 영어 전용 → 번역·의도 반영, 검열/보정 없음).
  const composed = await buildImagePrompt(identity, prompt);
  // 디버그(로컬 튜닝용): 입력 원문 → 빌드된 영어 프롬프트. 프로덕션은 프롬프트 원문 미저장(7-D)
  // 원칙이므로 IMAGE_DEBUG 플래그가 있을 때만 콘솔에 남긴다.
  if (process.env.IMAGE_DEBUG)
    console.log("[image] user:", JSON.stringify(prompt), "\n[image] built:", JSON.stringify(composed));
  // 백스톱: 빌드된 프롬프트에 미성년/불법 흔적이 유입되지 않았는지 재검사.
  if (heuristicScan(composed))
    return NextResponse.json({ error: "blocked", category: "minor" }, { status: 422 });

  // 3) 생성.
  let img;
  try {
    img = await generateImage(composed);
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
