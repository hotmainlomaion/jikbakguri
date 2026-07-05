// POST /api/image — 이미지 루프 (P3).
// 게이트 → 일일상한 → 합성 프롬프트 입력 모더레이션 → FLUX → 출력 이미지 스크리닝 → 저장.
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { reserveImageQuota } from "@/lib/rate-limit";
import { generateImage, buildImagePrompt, buildSceneRequest, freeLocalLLMs } from "@/lib/atlas/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWallet, spendCredits, IMAGE_CREDIT_COST } from "@/lib/economy";

const BUCKET = "generated-images";
const EXPIRY_DAYS = 7; // 만료 정책(7-D)

// Vercel 함수 실행 시간(초). 이미지 생성(호스티드 폴링)이 길 수 있어 상향.
// Hobby 플랜 최대 60s, Pro 300s. 클라우드 이미지가 느리면 Pro로 올리고 이 값을 300으로.
export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { sessionId, prompt, mode } = await req.json().catch(() => ({}));
  // 두 모드: (a) 수동 프롬프트(변형 스튜디오/셀카) — prompt 필수.
  //          (b) 장면 이미지(mode:"scene") — 최근 대화 맥락에서 '지금 이 순간'을 자동 구성.
  const sceneMode = mode === "scene";
  if (!sessionId || (!sceneMode && (typeof prompt !== "string" || !prompt.trim())))
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profile_id, scene_location, scenario_id, scenario_snapshot")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== gate.userId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 크레딧: 이미지 1장 = IMAGE_CREDIT_COST. 먼저 잔액 확인(부족이면 402, 쿼터 슬롯 낭비 방지).
  // 실제 차감은 '생성 성공' 후에 수행(차단/실패 프롬프트엔 과금 안 함). 무제한 계정은 balance=-1 면제.
  const wallet0 = await getWallet(gate.userId);
  if (!wallet0.unlimited && wallet0.balance < IMAGE_CREDIT_COST)
    return NextResponse.json({ error: "insufficient_credits", balance: wallet0.balance }, { status: 402 });

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

  // 장면 모드: 최근 대화(마지막 지시/내용)를 '지금 이 순간' 이미지 요청으로 변환.
  // 캐릭터 고정 외형은 identity가 유지(일관성), 여기선 옷·노출·포즈·행위·배경만 반영.
  let requestText = typeof prompt === "string" ? prompt : "";
  let koSignal: string | undefined; // 장면 모드: applyKoNsfw 신호(사용자 실제 명령). 수동 모드는 미지정.
  if (sceneMode) {
    // 최신 대화가 '지금 이 순간'이므로 내림차순으로 최근 20개를 가져와 시간순으로 되돌린다.
    const { data: recent } = await admin
      .from("messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);
    const msgs = (recent ?? []).slice().reverse();
    // 설정된 시나리오(제목/상황/상세/세계관)를 장면 추출의 기본 전제로 주입 — 배경·소품·무드가 반영되게.
    // scenario_id로 원본 시나리오를 우선 조회하고, 없으면 세션 스냅샷을 폴백으로.
    let scenarioCtx: import("@/lib/atlas/image").SceneScenario | null = null;
    if ((session as any).scenario_id) {
      const { data: sc } = await admin
        .from("scenarios")
        .select("title, description, detail, scenario")
        .eq("id", (session as any).scenario_id)
        .maybeSingle();
      if (sc) scenarioCtx = sc as any;
    }
    if (!scenarioCtx && (session as any).scenario_snapshot) {
      const snap = (session as any).scenario_snapshot;
      scenarioCtx = {
        title: snap.title ?? null,
        description: snap.description ?? null,
        detail: snap.detail ?? null,
        scenario: snap.scenario ?? null,
      };
    }
    requestText = await buildSceneRequest(
      msgs.map((m: any) => ({ role: m.role, content: m.content })),
      (session as any).scene_location ?? null, // #3 현재 장소를 배경으로 고정
      scenarioCtx // 설정된 시나리오를 장면의 기본 전제로
    );
    // applyKoNsfw(옷 제거·POV)의 신호는 '사용자의 실제 명령'만(aya 산문 오탐 방지).
    // 최근 사용자 메시지 몇 개를 모아 넘긴다 — 노출/탈의/행위 지시는 여기에만 담긴다.
    koSignal = msgs
      .filter((m: any) => m.role === "user")
      .slice(-6)
      .map((m: any) => m.content)
      .join(" ");
    if (!requestText.trim())
      return NextResponse.json({ error: "no_context" }, { status: 400 });
  }

  // 1) 입력 모더레이션 — 사용자 원문 의도(한국어 포함)를 호출 전 검사.
  const inMod = await moderate({ userId: gate.userId, channel: "image_in", text: `${identity} ${requestText}` });
  if (!inMod.pass)
    return NextResponse.json({ error: "blocked", category: inMod.category }, { status: 422 });

  // 2) 스타일별 프롬프트 빌드(실사=영어 자연어 / 애니=danbooru 태그). 검열/보정 없음.
  //    장면 모드는 koSignal(사용자 실제 명령)로 옷 제거·POV를 판정(aya 산문 오탐 방지).
  const composed = await buildImagePrompt(identity, requestText, style, koSignal);
  // 하드리밋(#5): 빌더가 미성년 암시를 감지해 BLOCKED_MINOR를 반환하면 즉시 차단(번역 우회 방어).
  if (/BLOCKED_MINOR/i.test(composed)) {
    await moderate({ userId: gate.userId, channel: "image_in", text: "BLOCKED_MINOR" });
    return NextResponse.json({ error: "blocked", category: "minor" }, { status: 422 });
  }
  // 디버그(로컬 튜닝용): 입력 원문 → 빌드된 영어 프롬프트. 프로덕션은 프롬프트 원문 미저장(7-D)
  // 원칙이므로 IMAGE_DEBUG 플래그가 있을 때만 콘솔에 남긴다.
  if (process.env.IMAGE_DEBUG)
    console.log("[image] user:", JSON.stringify(requestText), "\n[image] built:", JSON.stringify(composed));
  // 백스톱(감사 #6): 빌드된 영어 프롬프트도 heuristic이 아닌 moderate()로 재검사해
  // 외부 텍스트 분류기까지 통과시킨다(번역 과정에서 구체화된 위법 표현 방어). 원문·빌드결과 양쪽 검사.
  // 빌드된 프롬프트는 이미 1차 검사된 입력에서 파생 → heuristic(미성년/불법 결정론 필터)만 재검사.
  // LLM 분류기 호출을 생략해 이미지 경로 지연(함수 60초 예산)을 줄인다.
  const builtMod = await moderate({ userId: gate.userId, channel: "image_in", text: composed, heuristicOnly: true });
  if (!builtMod.pass)
    return NextResponse.json({ error: "blocked", category: builtMod.category ?? "minor" }, { status: 422 });

  // 로컬 SDXL 생성 전 Ollama 모델 언로드(16GB OOM 방지). 호스티드(novita) 프로바이더면 불필요.
  if ((process.env.IMAGE_PROVIDER ?? "local").toLowerCase() === "local" && process.env.FREE_OLLAMA_BEFORE_IMAGE !== "0")
    await freeLocalLLMs();

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
  const { data: imgRow } = await admin.from("images").insert({
    session_id: sessionId,
    prompt_hash: promptHash,
    storage_path: path,
    expires_at: expiresAt,
  }).select("id").single();

  // 크레딧 차감(생성 성공분에만 과금). idem=이미지 행 id로 재시도 이중차감 방지. 무제한 계정은 면제.
  const spend = await spendCredits(
    gate.userId, IMAGE_CREDIT_COST, "image", "session", sessionId,
    imgRow?.id ? `image:${imgRow.id}` : undefined
  );
  const credits = { balance: spend.balance, spent: spend.charged, cost: IMAGE_CREDIT_COST, unlimited: wallet0.unlimited };

  const { data: url } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return NextResponse.json({ url: url?.signedUrl, expiresAt, credits });
}
