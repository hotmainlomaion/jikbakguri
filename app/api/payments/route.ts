// 결제 라우트 — 크레딧 충전.
//  · GET  : 판매 중 충전 패키지 목록(가격표).
//  · POST : 충전. 실 PG 연동 전까지는 'dev 즉시 충전'(PAYMENTS_DEV_TOPUP=1일 때만) — checkout(pending) +
//           apply_payment(paid 확정)을 한 번에 수행해 크레딧 자동 적용을 검증한다.
//    ▶ 상용화: checkout은 pending payment만 만들고 PG 결제창으로 보낸 뒤, PG 웹훅이 apply_payment를 호출한다
//      (멱등: provider_ref UNIQUE + applied_at 클레임 + ledger idem). 그 흐름을 그대로 재사용.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyPayment, getWallet } from "@/lib/economy";

export async function GET() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("credit_packages")
    .select("code, label, price_krw, base_credits, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return NextResponse.json({ packages: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  // 실 PG 미연동: dev 즉시 충전은 명시적 플래그로만 허용(무료 크레딧 남용 방지).
  if (process.env.PAYMENTS_DEV_TOPUP !== "1")
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });

  const { packageCode } = await req.json().catch(() => ({}));
  if (!packageCode || typeof packageCode !== "string")
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: pkg } = await admin
    .from("credit_packages")
    .select("id, price_krw, base_credits")
    .eq("code", packageCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!pkg) return NextResponse.json({ error: "package_not_found" }, { status: 404 });

  // checkout: pending payment 선기록(멱등 앵커 provider_ref). dev는 유니크 ref 생성.
  const providerRef = `dev-${gate.userId.slice(0, 8)}-${Date.now()}`;
  const { data: pay, error: perr } = await admin
    .from("payments")
    .insert({
      user_id: gate.userId,
      package_id: (pkg as any).id,
      amount_krw: (pkg as any).price_krw,
      base_credits: (pkg as any).base_credits, // 스냅샷(폴백 방지)
      provider: "dev",
      provider_ref: providerRef,
    })
    .select("id")
    .single();
  if (perr || !pay) return NextResponse.json({ error: "checkout_failed" }, { status: 500 });

  // (dev) 즉시 결제 확정 → 크레딧 자동 적용(기본+티어 보너스, 누적KRW, 티어 승급). 멱등.
  try {
    const res = await applyPayment((pay as any).id);
    const wallet = await getWallet(gate.userId);
    return NextResponse.json({
      ok: true,
      paymentId: (pay as any).id,
      credited: Number(res?.credited ?? 0),
      base: Number(res?.base ?? 0),
      bonus: Number(res?.bonus ?? 0),
      wallet,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "apply_failed", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
