// GET /api/wallet — 현재 사용자의 크레딧 잔액 + 멤버십 티어 뷰. UI 헤더/충전 화면용.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { getWallet } from "@/lib/economy";

export async function GET() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const wallet = await getWallet(gate.userId);
  return NextResponse.json({ wallet });
}
