"use client";
import { useEffect, useState } from "react";
import type { WalletClient } from "@/components/credit-badge";

// 출석 다이어리 — 매일 1회 출석 → 포인트 획득. 자체적으로 /api/attendance 조회·체크인.
type Attendance = {
  todayChecked: boolean;
  streak: number;
  previewReward: number;
  today: string; // 'YYYY-MM-DD' (KST)
  monthDates: string[];
  monthCount: number;
  totalCount: number;
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function AttendanceView({
  wallet,
  onWallet,
}: {
  wallet: WalletClient;
  onWallet: (w: WalletClient) => void;
}) {
  const [data, setData] = useState<Attendance | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/attendance")
      .then((r) => r.json())
      .then((d) => setData(d.attendance ?? null))
      .catch(() => setErr("출석 현황을 불러오지 못했어요."));
  }, []);

  async function doCheckin() {
    if (busy || data?.todayChecked) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/attendance", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setErr("출석에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setData(d.attendance);
      if (d.result?.already) {
        setFlash("오늘은 이미 출석했어요 😊");
      } else {
        setFlash(`✅ +${d.result.credited}P 획득! 🔥 연속 ${d.result.streak}일`);
        if (typeof d.result?.balance === "number")
          onWallet({ ...wallet, balance: d.result.balance });
      }
    } catch {
      setErr("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (err && !data)
    return <div className="mt-8 text-center text-sm text-muted">{err}</div>;
  if (!data)
    return <div className="mt-8 text-center text-sm text-muted">불러오는 중…</div>;

  // 이번 달(KST) 달력 구성.
  const [y, m] = data.today.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayDay = Number(data.today.slice(8, 10));
  const checkedSet = new Set(data.monthDates);
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <section className="mx-auto mt-5 max-w-lg pb-8">
      <div className="mb-4">
        <h2 className="text-base font-bold text-text sm:text-lg">출석 다이어리 📅</h2>
        <p className="text-xs text-muted sm:text-sm">매일 출석하고 포인트를 받아요</p>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-surface px-3 py-3 text-center">
          <div className="text-lg font-extrabold text-primary">🔥 {data.streak}</div>
          <div className="text-[11px] text-muted">{data.todayChecked ? "연속 출석" : "출석 시 연속"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-3 py-3 text-center">
          <div className="text-lg font-extrabold text-text">{data.monthCount}</div>
          <div className="text-[11px] text-muted">이번 달</div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-3 py-3 text-center">
          <div className="text-lg font-extrabold text-gold">+{data.previewReward}P</div>
          <div className="text-[11px] text-muted">{data.todayChecked ? "내일 보상" : "오늘 보상"}</div>
        </div>
      </div>

      {/* 출석 버튼 */}
      <button
        onClick={doCheckin}
        disabled={busy || data.todayChecked}
        className={
          "mt-3 w-full rounded-xl px-4 py-3.5 text-sm font-bold transition-colors " +
          (data.todayChecked
            ? "cursor-default border border-border bg-surface2 text-muted"
            : "bg-primary text-white hover:bg-primaryHover disabled:opacity-60")
        }
      >
        {data.todayChecked
          ? "오늘 출석 완료 ✓"
          : busy
          ? "출석 중…"
          : `오늘 출석하고 +${data.previewReward}P 받기`}
      </button>
      {flash && <p className="mt-2 text-center text-sm font-semibold text-primary">{flash}</p>}
      {err && data && <p className="mt-2 text-center text-sm text-red-400">{err}</p>}

      {/* 달력 */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 text-center text-sm font-semibold text-text">
          {y}년 {m}월
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEK.map((w, i) => (
            <div key={w} className={"pb-1 text-[11px] " + (i === 0 ? "text-red-400" : i === 6 ? "text-sky-400" : "text-subtle")}>
              {w}
            </div>
          ))}
          {cells.map((day, idx) => {
            if (day === null) return <div key={"e" + idx} />;
            const dateStr = `${y}-${pad(m)}-${pad(day)}`;
            const checked = checkedSet.has(dateStr);
            const isToday = day === todayDay;
            return (
              <div
                key={dateStr}
                className={
                  "flex aspect-square items-center justify-center rounded-lg text-xs " +
                  (checked
                    ? "bg-primary/20 font-bold text-primary"
                    : "text-muted") +
                  (isToday ? " ring-1 ring-primary" : "")
                }
              >
                {checked ? "🔥" : day}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">
        매일 +{CHECKIN_BASE_LABEL}P · 연속 출석 보너스(+5/일, 최대 +30) · 7일마다 +100P 보너스
      </p>
    </section>
  );
}

const CHECKIN_BASE_LABEL = 20;
