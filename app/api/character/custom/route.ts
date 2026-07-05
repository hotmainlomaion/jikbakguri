// POST /api/character/custom — A안: AI 생성 커스텀 캐릭터(사진 업로드 없음).
// ⚠️ 안전(다중 방어):
//  (1) 정의 텍스트(이름/외모/성격/시나리오) 모더레이션 — 미성년·불법 암시 차단.
//  (2) character_age >= 18 — DB CHECK가 미성년 캐릭터를 스키마 레벨에서 원천 차단.
//  (3) 아바타는 buildImagePrompt(BLOCKED_MINOR 토큰 + clearly-adult 강제) + 출력 스크리닝.
//  (4) assertAdultCanon — 세션 시작 시 미성년 캐논 거부(pinPersonaSnapshot, 기존).
// 커스텀 봇은 is_published=false(갤러리 비노출) + created_by=소유자(비공개).
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildImagePrompt, generateImage } from "@/lib/atlas/image";

export const maxDuration = 300; // 아바타 생성(호스티드 폴링) 여유.

const MAX_CUSTOM_PER_USER = 12; // 남용 방지 상한
const AVATAR_BUCKET = "generated-images";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 40);
  const appearance = String(body.appearance ?? "").trim().slice(0, 600);
  const persona = String(body.persona ?? "").trim().slice(0, 800);
  const scenario = String(body.scenario ?? "").trim().slice(0, 600);
  const style = body.style === "anime" ? "anime" : "photoreal";
  const characterAge = Math.floor(Number(body.characterAge) || 0);

  if (!name || !appearance || !persona)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (characterAge < 18)
    return NextResponse.json({ error: "underage", message: "캐릭터는 만 18세 이상이어야 합니다." }, { status: 422 });

  const admin = createAdminClient();

  // 남용 방지: 사용자당 커스텀 캐릭터 수 상한.
  const { count } = await admin
    .from("bot_profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_custom", true)
    .eq("created_by", gate.userId);
  if ((count ?? 0) >= MAX_CUSTOM_PER_USER)
    return NextResponse.json(
      { error: "limit", message: `커스텀 캐릭터는 최대 ${MAX_CUSTOM_PER_USER}개까지 만들 수 있어요.` },
      { status: 429 }
    );

  // (1) 정의 텍스트 모더레이션 — 새 영구 정의라 LLM 분류기까지 검사(미성년/불법 암시 차단).
  const mod = await moderate({ userId: gate.userId, channel: "chat_in", text: `${name}\n${appearance}\n${persona}\n${scenario}` });
  if (!mod.pass)
    return NextResponse.json({ error: "blocked", category: mod.category, message: "미성년·불법을 암시하는 설정은 만들 수 없습니다." }, { status: 422 });

  // (2) 봇 프로필 생성 — character_age>=18 CHECK가 DB 레벨에서 미성년 차단.
  const seed = Math.floor(Math.random() * 2_000_000_000); // 고정 시드 → 아바타↔장면 이미지 일관성.
  const systemPrompt = `${name}. ${persona}`.slice(0, 1200);
  // canon은 INSERT 트리거가 없어 직접 채운다(0003 백필과 동일 구조). identity.age가 assertAdultCanon의 기준.
  const canon = {
    identity: { name, age: characterAge, backstory: persona },
    voice: { register: persona, tics: [], language: "ko" },
    appearance,
    boundaries: ["성인(18+) 캐릭터로만 행동", "미성년 역할·묘사 금지", "비동의/착취 묘사 금지"],
    canon_facts: [],
  };
  const { data: bot, error: insErr } = await admin
    .from("bot_profiles")
    .insert({
      name,
      persona,
      appearance_desc: appearance,
      system_prompt: systemPrompt,
      character_age: characterAge,
      image_style: style,
      image_seed: seed,
      canon,
      is_custom: true,
      is_published: false,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (insErr || !bot) {
    const underage = insErr?.message?.toLowerCase().includes("character_age");
    return NextResponse.json(
      { error: underage ? "underage" : "create_failed", message: underage ? "캐릭터는 만 18세 이상이어야 합니다." : undefined },
      { status: underage ? 422 : 500 }
    );
  }

  // (3) 아바타 생성(clothed 포트레이트, clearly-adult). buildImagePrompt이 미성년 암시 시 BLOCKED_MINOR 반환.
  try {
    const prompt = await buildImagePrompt(
      appearance,
      "clothed portrait, upper body, gentle friendly smile, looking at camera, adult woman",
      style
    );
    if (/BLOCKED_MINOR/i.test(prompt)) {
      await admin.from("bot_profiles").delete().eq("id", bot.id); // 미성년 암시 → 캐릭터 폐기
      return NextResponse.json({ error: "blocked", category: "minor", message: "미성년을 암시하는 설정은 만들 수 없습니다." }, { status: 422 });
    }
    const img = await generateImage(prompt, { style, seed });
    let bytes: Buffer | null = null;
    if (img.b64) bytes = Buffer.from(img.b64, "base64");
    else if (img.url) {
      const r = await fetch(img.url, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) bytes = Buffer.from(await r.arrayBuffer());
    }
    if (bytes) {
      const path = `custom-avatars/${gate.userId}/${bot.id}.png`;
      await admin.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
      // 출력 이미지 스크리닝(image_out) — 통과분만 아바타로 채택.
      const { data: signed } = await admin.storage.from(AVATAR_BUCKET).createSignedUrl(path, 120);
      const outMod = await moderate({ userId: gate.userId, channel: "image_out", imageUrl: signed?.signedUrl });
      if (outMod.pass) await admin.from("bot_profiles").update({ avatar_path: path }).eq("id", bot.id);
      else await admin.storage.from(AVATAR_BUCKET).remove([path]); // 차단 → 아바타 없이(이니셜 폴백)
    }
  } catch (e) {
    // 아바타 생성 실패는 치명적이지 않음 — 캐릭터는 생성됨(아바타는 이니셜 폴백, 나중에 재생성 가능).
    console.error("[custom] avatar gen failed:", String(e));
  }

  return NextResponse.json({ botId: bot.id });
}
