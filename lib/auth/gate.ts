// 서버단 인증/성인 게이트 (CLAUDE.md 7-A). 클라이언트 신뢰 금지 — 항상 서버에서 검증.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type GateResult =
  | { ok: true; userId: string; isAdmin: boolean }
  | { ok: false; reason: "unauthenticated" | "not_verified" | "banned" };

// 로그인 + 성인 인증 + 계정 상태를 서버 DB 기준으로 확인.
export async function requireVerifiedUser(): Promise<GateResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  // service role로 신뢰 가능한 상태 조회(클라이언트가 못 바꾸는 값).
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("users")
    .select("is_adult_verified, status")
    .eq("id", user.id)
    .single();

  if (!row) return { ok: false, reason: "unauthenticated" };
  if (row.status === "banned" || row.status === "suspended")
    return { ok: false, reason: "banned" };
  if (!row.is_adult_verified) return { ok: false, reason: "not_verified" };

  const { data: adminRow } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { ok: true, userId: user.id, isAdmin: !!adminRow };
}

export async function requireAdmin(): Promise<GateResult> {
  const res = await requireVerifiedUser();
  if (!res.ok) return res;
  if (!res.isAdmin) return { ok: false, reason: "banned" };
  return res;
}
