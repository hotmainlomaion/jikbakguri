// GET  /api/attendance — 출석 현황(오늘 체크 여부·연속일·이번달 달력·미리보기 보상)
// POST /api/attendance — 오늘 출석체크(멱등: 하루 1회) → 포인트 지급 + 갱신 잔액 반환
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { getAttendance, checkin } from "@/lib/engagement/attendance";

export async function GET() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const attendance = await getAttendance(gate.userId);
  return NextResponse.json({ attendance });
}

export async function POST() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const result = await checkin(gate.userId);
  // 체크 후 최신 현황도 함께 반환(달력·연속일 즉시 갱신용).
  const attendance = await getAttendance(gate.userId);
  return NextResponse.json({ result, attendance });
}
