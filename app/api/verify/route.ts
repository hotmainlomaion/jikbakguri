// POST /api/verify — 성인 인증 콜백 (7-A).
// 실제 본인확인은 외부 인증기관(휴대폰/아이핀)에서 수행되고, 그 결과(참조값)만 여기서 검증·기록한다.
// 개인정보 최소화: 신분증 원본/주민번호 저장 금지 — provider_ref(트랜잭션 참조)만.
// TODO(운영주체 확인): 실제 provider 연동(서명 검증, 콜백 스키마)으로 교체. 현재는 스텁.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TODO(운영주체 확인): 실제 인증기관(휴대폰 본인인증/아이핀) API로 providerRef를 서버 검증.
// 서명/트랜잭션 재조회로 위조 불가하게. 지금은 미구현 → 연동 전까지 production에서 라우트가 501로 막힌다.
async function verifyWithProvider(_method: string, _providerRef: string): Promise<boolean> {
  throw new Error("age-verify provider not implemented");
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { method, providerRef } = await req.json().catch(() => ({}));
  if (!["mobile_auth", "ipin"].includes(method) || !providerRef)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // 운영 봉쇄(#2): 실제 인증기관(AGE_VERIFY_PROVIDER) 미연동 상태에선 production에서 자가통과 스텁을
  // 비활성(501). 개발/PoC(NODE_ENV!=production)에서만 스텁으로 진행. 7-A: 체크박스식 자가인증은 위법.
  const providerConfigured = !!process.env.AGE_VERIFY_PROVIDER && !!process.env.AGE_VERIFY_API_KEY;
  if (process.env.NODE_ENV === "production" && !providerConfigured)
    return NextResponse.json({ error: "verification_unavailable" }, { status: 501 });

  // TODO(운영주체 확인): providerRef 를 인증기관 API로 서버 검증. 스텁은 존재만 확인(개발 전용).
  const verifiedAtProvider = providerConfigured
    ? await verifyWithProvider(method, providerRef)
    : true; // 개발 스텁
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
