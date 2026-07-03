// ============================================================
// /api/admin/images — 캐릭터 이미지 DB (운영자 전용).
// POST 멀티파트 업로드: requireAdmin → MIME 화이트리스트 + 매직바이트 + 크기 + 텍스트 스크리닝
//   → 비공개 버킷 저장 → review_status='pending' insert (검수 전 미노출).
// PATCH: 검수(approve/reject)·대표지정·정렬·location. DELETE: 버킷 remove 선행 → 메타 delete.
// 안전: 바이트가 서버 메모리를 반드시 경유(우회 불가). SVG/GIF 금지. approved 자동승격 금지.
// ============================================================
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderate } from "@/lib/moderation";
import { heuristicScan } from "@/lib/moderation/categories";

const BUCKET = "character-images";
const MAX_BYTES = Number(process.env.ADMIN_IMAGE_MAX_BYTES ?? 8388608); // 8MB
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// 매직바이트 검증 — file.type는 위조 가능하므로 실제 시그니처로 재확인.
function magicOk(b: Buffer, contentType: string): boolean {
  if (contentType === "image/png")
    return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (contentType === "image/jpeg")
    return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (contentType === "image/webp")
    return (
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    );
  return false;
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  const botProfileId = String(form.get("botProfileId") ?? "");
  const category = String(form.get("category") ?? "");
  const location = (form.get("location") ? String(form.get("location")) : "").trim() || null;

  if (!(file instanceof File) || !botProfileId || !["avatar", "collection", "scene"].includes(category))
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // 1) MIME 화이트리스트 (png/jpeg/webp만; SVG·GIF 금지).
  const ct = file.type;
  if (!ALLOWED[ct]) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });

  // 2) 크기 상한(파싱 전 선검사).
  if (file.size <= 0 || file.size > MAX_BYTES)
    return NextResponse.json({ error: "too_large", max: MAX_BYTES }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());

  // 3) 매직바이트 (선언 타입과 실제 바이트 일치).
  if (!magicOk(bytes, ct))
    return NextResponse.json({ error: "content_mismatch" }, { status: 415 });

  // 4) 텍스트 스크리닝 — 파일명·location에 미성년 암시 라벨 차단.
  //    파일명은 '_'/'.'/'-' 등으로 단어가 붙어 \b 경계를 회피할 수 있으므로(예: child_teen.png)
  //    구분자를 공백으로 정규화한 뒤 검사한다.
  const rawLabel = `${file.name} ${location ?? ""}`.trim();
  const label = rawLabel.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (heuristicScan(label))
    return NextResponse.json({ error: "blocked_label" }, { status: 422 });
  await moderate({ userId: gate.userId, channel: "image_in", text: `admin_upload: ${label}` });

  const admin = createAdminClient();

  // 봇 존재 확인.
  const { data: bot } = await admin.from("bot_profiles").select("id").eq("id", botProfileId).single();
  if (!bot) return NextResponse.json({ error: "bot_not_found" }, { status: 404 });

  const ext = ALLOWED[ct];
  const path = `${botProfileId}/${category}/${randomUUID()}.${ext}`;

  // 5) 저장 — contentType은 서버 검증값으로 고정(폴리글롯 방어).
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: ct, upsert: false });
  if (upErr) return NextResponse.json({ error: "upload_failed" }, { status: 500 });

  // 6) (선택) 이미지 자동 스크리닝 — 분류기 설정 시에만. 실패 시 rejected(자동 approve 금지).
  let reviewStatus = "pending";
  if (process.env.MODERATION_IMAGE_URL && process.env.MODERATION_IMAGE_API_KEY) {
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 120);
    const scr = await moderate({ userId: gate.userId, channel: "image_out", imageUrl: signed?.signedUrl });
    if (!scr.pass) reviewStatus = "rejected";
  }

  // 7) 정렬 순서 = 현재 max+1.
  const { data: last } = await admin
    .from("character_images")
    .select("sort_order")
    .eq("bot_profile_id", botProfileId)
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: row, error: insErr } = await admin
    .from("character_images")
    .insert({
      bot_profile_id: botProfileId,
      category,
      location,
      storage_path: path,
      content_type: ct,
      byte_size: bytes.length,
      review_status: reviewStatus,
      sort_order: (last?.sort_order ?? 0) + 1,
      created_by: gate.userId,
    })
    .select("id")
    .single();

  if (insErr) {
    await admin.storage.from(BUCKET).remove([path]); // 메타 실패 시 고아 방지
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ id: row.id, needsApproval: reviewStatus === "pending" }, { status: 201 });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, review_status, sort_order, location, is_primary, review_note } = body;
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: img } = await admin
    .from("character_images")
    .select("id, bot_profile_id, category, review_status")
    .eq("id", id)
    .single();
  if (!img) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const patch: Record<string, any> = {};

  if (review_status !== undefined) {
    if (!["pending", "approved", "rejected"].includes(review_status))
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    patch.review_status = review_status; // approved 전이는 운영자 수동 액션으로만.
    patch.reviewed_at = new Date().toISOString();
    if (review_note !== undefined) patch.review_note = String(review_note).slice(0, 500);
  }

  if (location !== undefined) {
    const loc = String(location).trim() || null;
    if (loc && heuristicScan(loc.replace(/[^\p{L}\p{N}]+/gu, " ")))
      return NextResponse.json({ error: "blocked_label" }, { status: 422 });
    patch.location = loc;
  }

  if (sort_order !== undefined) patch.sort_order = Number(sort_order) | 0;

  if (is_primary === true) {
    // 대표컷: avatar + approved 여야. 기존 primary 해제 후 지정(부분 유니크 인덱스가 최종 방어).
    if (img.category !== "avatar")
      return NextResponse.json({ error: "not_avatar" }, { status: 422 });
    const nextStatus = patch.review_status ?? img.review_status;
    if (nextStatus !== "approved")
      return NextResponse.json({ error: "must_be_approved" }, { status: 422 });
    await admin
      .from("character_images")
      .update({ is_primary: false })
      .eq("bot_profile_id", img.bot_profile_id)
      .eq("category", "avatar")
      .eq("is_primary", true);
    patch.is_primary = true;
  } else if (is_primary === false) {
    patch.is_primary = false;
  }

  const { error } = await admin.from("character_images").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: img } = await admin
    .from("character_images")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!img) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 버킷 객체 선삭제 → 메타 삭제(고아 방지). remove 실패 시 메타 유지(재시도 가능).
  const { error: rmErr } = await admin.storage.from(BUCKET).remove([img.storage_path]);
  if (rmErr) return NextResponse.json({ error: "storage_remove_failed" }, { status: 500 });
  await admin.from("character_images").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
