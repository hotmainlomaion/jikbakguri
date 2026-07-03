// POST /api/verify — 성인 인증 콜백 (7-A).
// 실제 본인확인은 외부 인증기관(휴대폰/아이핀)에서 수행되고, 그 결과(참조값)만 여기서 검증·기록한다.
// 개인정보 최소화: 신분증 원본/주민번호 저장 금지 — provider_ref(트랜잭션 참조)만.
// TODO(운영주체 확인): 실제 provider 연동(서명 검증, 콜백 스키마)으로 교체. 현재는 스텁.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { method, providerRef } = await req.json().catch(() => ({}));
  if (!["mobile_auth", "ipin"].includes(method) || !providerRef)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // TODO(운영주체 확인): providerRef 를 인증기관 API로 서버 검증. 여기서는 존재만 확인.
  const verifiedAtProvider = true;
  if (!verifiedAtProvider)
    return NextResponse.json({ error: "verification_failed" }, { status: 403 });

  const admin = createAdminClient();
  await admin.from("age_verifications").insert({
    user_id: user.id,
    method,
    provider_ref: providerRef, // 식별정보 원본 아님
  });
  await admin.from("users").update({ is_adult_verified: true }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}
