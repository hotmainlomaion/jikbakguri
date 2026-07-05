// ============================================================
// lib/economy — 크레딧 경제(지갑·차감·결제·멤버십) 앱 레이어. 서버 전용(service_role RPC 호출).
// DB(0021_economy): wallets/credit_ledger/payments/membership_tiers/credit_packages + 원자·멱등 RPC.
// 모든 증감은 여기(service_role)에서만. 클라 직접 접근 불가(RLS SELECT만 + execute revoke).
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";

// 가격(크레딧). 1크레딧=₩10. ENV로 조정 가능.
export const CHAT_CREDIT_COST = Number(process.env.CHAT_CREDIT_COST ?? 5); // 채팅 1턴
export const IMAGE_CREDIT_COST = Number(process.env.IMAGE_CREDIT_COST ?? 100); // 이미지 1장
export const WELCOME_CREDITS = Number(process.env.WELCOME_CREDITS ?? 300);

export interface WalletView {
  balance: number;
  tier: string; // bronze..master
  level: number; // 1~5
  label: string; // '골드 III'
  bonusPct: number; // 현재 티어 충전 보너스율(%)
  cumulativeKrw: number;
  nextLabel: string | null; // 다음 등급 라벨
  nextKrw: number | null; // 다음 등급 진입 누적KRW
  toNextKrw: number | null; // 다음 등급까지 남은 KRW
  unlimited: boolean; // 데모/무제한 계정(차감 면제)
}

// 데모/무제한 계정(차감 면제) — 기존 IMAGE_UNLIMITED_EMAILS 재사용.
export async function isUnlimited(userId: string): Promise<boolean> {
  const list = (process.env.IMAGE_UNLIMITED_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("email").eq("id", userId).maybeSingle();
  return !!(data?.email && list.includes(data.email.toLowerCase()));
}

// 지갑 뷰(잔액 + 멤버십 티어 + 다음 등급). 지갑 없으면 ensure_wallet로 lazy-init(환영 크레딧 지급).
export async function getWallet(userId: string): Promise<WalletView> {
  const admin = createAdminClient();
  let { data: w } = await admin
    .from("wallets")
    .select("balance, tier, level, cumulative_krw")
    .eq("user_id", userId)
    .maybeSingle();
  if (!w) {
    await admin.rpc("ensure_wallet", { p_user: userId, p_welcome: WELCOME_CREDITS });
    ({ data: w } = await admin
      .from("wallets")
      .select("balance, tier, level, cumulative_krw")
      .eq("user_id", userId)
      .maybeSingle());
  }
  const bal = Number((w as any)?.balance ?? 0);
  const tier = (w as any)?.tier ?? "bronze";
  const level = Number((w as any)?.level ?? 1);
  const cum = Number((w as any)?.cumulative_krw ?? 0);

  // 티어 사다리에서 현재/다음 등급 메타.
  const { data: tiers } = await admin
    .from("membership_tiers")
    .select("tier, level, rank, min_cumulative_krw, topup_bonus_pct, label")
    .order("rank", { ascending: true });
  const rows = (tiers ?? []) as any[];
  const cur = rows.find((r) => r.tier === tier && r.level === level);
  const curRank = cur?.rank ?? 0;
  const next = rows.find((r) => r.rank === curRank + 1) ?? null;

  const unlimited = await isUnlimited(userId);
  return {
    balance: bal,
    tier,
    level,
    label: cur?.label ?? "브론즈 I",
    bonusPct: Number(cur?.topup_bonus_pct ?? 0),
    cumulativeKrw: cum,
    nextLabel: next?.label ?? null,
    nextKrw: next?.min_cumulative_krw ?? null,
    toNextKrw: next ? Math.max(0, Number(next.min_cumulative_krw) - cum) : null,
    unlimited,
  };
}

export interface SpendResult { ok: boolean; balance: number; failReason: string | null; charged: number }

// 크레딧 차감(원자·음수불가). 무제한 계정은 면제(차감 없이 ok). 잔액부족이면 ok=false.
export async function spendCredits(
  userId: string,
  amount: number,
  reason: string,
  refType?: string,
  refId?: string,
  idem?: string
): Promise<SpendResult> {
  if (amount <= 0) return { ok: true, balance: -1, failReason: null, charged: 0 };
  if (await isUnlimited(userId)) return { ok: true, balance: -1, failReason: null, charged: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("spend_credits", {
    p_user: userId, p_amount: amount, p_reason: reason,
    p_ref_type: refType ?? null, p_ref_id: refId ?? null, p_idem: idem ?? null,
  });
  if (error) return { ok: false, balance: 0, failReason: "spend_error", charged: 0 };
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return {
    ok: !!row?.ok,
    balance: Number(row?.balance ?? 0),
    failReason: row?.fail_reason ?? null,
    charged: row?.ok ? amount : 0,
  };
}

// 결제 확정 → 크레딧 자동 적용(기본+티어 보너스, 멱등). 실 PG 웹훅이 이 함수를 호출.
export async function applyPayment(paymentId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_payment", { p_payment_id: paymentId });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as any;
}
