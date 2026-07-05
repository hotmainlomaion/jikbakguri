// lib/engagement/attendance — 출석체크(daily check-in). 서버 전용(service_role RPC).
// DB(0023): attendance_checkins + daily_checkin RPC(멱등·KST·연속보너스). 포인트는 grant_credits로 지급.
import { createAdminClient } from "@/lib/supabase/admin";

export const CHECKIN_BASE = 20; // 기본 출석 포인트(RPC와 동일 — 미리보기 계산용)

// KST(UTC+9) 달력 날짜 'YYYY-MM-DD'. offsetDays로 어제/그제 계산.
function kstDate(offsetDays = 0): string {
  const ms = Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

// RPC와 동일한 보상식(미리보기): 기본 20 + 연속(+5/일, 최대+30) + 7일마다 +100.
function rewardFor(streak: number): number {
  let bonus = Math.min((streak - 1) * 5, 30);
  if (streak % 7 === 0) bonus += 100;
  return CHECKIN_BASE + bonus;
}

export interface AttendanceView {
  todayChecked: boolean; // 오늘(KST) 출석했는가
  streak: number; // 표시용 연속일(오늘 체크했으면 오늘값, 아니면 지금 체크 시 될 값)
  previewReward: number; // 지금 출석 시 받을 포인트
  today: string; // 오늘 KST 날짜
  monthDates: string[]; // 이번 달(KST) 출석한 날짜들
  monthCount: number;
  totalCount: number;
}

export async function getAttendance(userId: string): Promise<AttendanceView> {
  const admin = createAdminClient();
  const today = kstDate(0);
  const yesterday = kstDate(-1);
  const monthPrefix = today.slice(0, 7); // 'YYYY-MM'

  const { data: rows } = await admin
    .from("attendance_checkins")
    .select("check_date, streak")
    .eq("user_id", userId)
    .order("check_date", { ascending: false })
    .limit(400);
  const list = (rows ?? []) as { check_date: string; streak: number }[];
  const last = list[0];

  const todayChecked = !!last && last.check_date === today;
  let streak: number;
  if (todayChecked) streak = last.streak;
  else if (last && last.check_date === yesterday) streak = last.streak + 1;
  else streak = 1;

  const monthDates = list.map((r) => r.check_date).filter((d) => d.startsWith(monthPrefix));
  return {
    todayChecked,
    streak,
    previewReward: rewardFor(streak),
    today,
    monthDates,
    monthCount: monthDates.length,
    totalCount: list.length,
  };
}

export interface CheckinResult {
  ok: boolean;
  already: boolean; // 이미 오늘 출석했었음(중복 → 추가 지급 없음)
  credited: number;
  streak: number;
  balance: number;
  checkedDate: string;
}

export async function checkin(userId: string): Promise<CheckinResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("daily_checkin", { p_user: userId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    ok: !!row.ok,
    already: !!row.already,
    credited: Number(row.credited ?? 0),
    streak: Number(row.streak ?? 0),
    balance: Number(row.balance ?? 0),
    checkedDate: String(row.checked_date ?? ""),
  };
}
