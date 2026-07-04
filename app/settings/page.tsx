// S7. 설정 — 계정, 선톡(F02), 탈퇴(데이터 완전 삭제, 7-D).
"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { BottomTabBar } from "@/components/bottom-tab-bar";

type Freq = "off" | "sometimes" | "often";
const FREQ_LABEL: Record<Freq, string> = { off: "끄기", sometimes: "가끔", often: "자주" };

export default function SettingsPage() {
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // F02 선톡 설정.
  const [freq, setFreq] = useState<Freq>("off");
  const [quietStart, setQuietStart] = useState(0);
  const [quietEnd, setQuietEnd] = useState(8);
  const [pSaved, setPSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.proactive_freq) setFreq(d.proactive_freq);
        if (typeof d?.quiet_start === "number") setQuietStart(d.quiet_start);
        if (typeof d?.quiet_end === "number") setQuietEnd(d.quiet_end);
      })
      .catch(() => {});
  }, []);

  async function saveProactive(next: { freq?: Freq; quietStart?: number; quietEnd?: number }) {
    const f = next.freq ?? freq;
    const qs = next.quietStart ?? quietStart;
    const qe = next.quietEnd ?? quietEnd;
    setFreq(f); setQuietStart(qs); setQuietEnd(qe); setPSaved(false);
    // 조용시간 서버 판정용 tz를 브라우저에서 감지해 함께 저장(#10).
    let tz = "Asia/Seoul";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch {}
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proactive_freq: f, quiet_start: qs, quiet_end: qe, timezone: tz }),
    });
    if (res.ok) { setPSaved(true); setTimeout(() => setPSaved(false), 2000); }
  }

  async function deleteAccount() {
    setMsg(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      await createClient().auth.signOut();
      location.href = "/";
    } else setMsg("탈퇴 처리에 실패했습니다.");
  }

  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/";
  }

  return (
    <>
    <main className="mx-auto max-w-md px-4 py-6 pb-24 sm:px-6 sm:py-10 lg:pb-10">
      <h1 className="mb-4 text-xl font-semibold sm:mb-6 sm:text-2xl">설정</h1>

      <div className="card mb-4">
        <button onClick={signOut} className="btn-ghost w-full">
          로그아웃
        </button>
      </div>

      {/* F02 선톡 설정 */}
      <div className="card mb-4">
        <h2 className="mb-1 font-medium text-text">💬 선톡 (캐릭터가 먼저 연락)</h2>
        <p className="mb-3 text-sm text-muted">
          한동안 대화가 없으면 캐릭터가 시간대·맥락에 맞춰 먼저 말을 걸어요.
        </p>
        <div className="mb-4 flex gap-2">
          {(["off", "sometimes", "often"] as Freq[]).map((f) => (
            <button
              key={f}
              onClick={() => saveProactive({ freq: f })}
              className={
                "flex-1 rounded-lg px-3 py-2 text-sm " +
                (freq === f ? "bg-primary text-white" : "border border-border text-muted hover:bg-surface3")
              }
            >
              {FREQ_LABEL[f]}
            </button>
          ))}
        </div>
        {freq !== "off" && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>조용시간</span>
            <select
              value={quietStart}
              onChange={(e) => saveProactive({ quietStart: Number(e.target.value) })}
              className="rounded-md border border-border bg-surface px-2 py-1 text-text"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}시</option>
              ))}
            </select>
            <span>~</span>
            <select
              value={quietEnd}
              onChange={(e) => saveProactive({ quietEnd: Number(e.target.value) })}
              className="rounded-md border border-border bg-surface px-2 py-1 text-text"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}시</option>
              ))}
            </select>
            <span className="text-subtle">엔 발송 안 함</span>
          </div>
        )}
        {pSaved && <p className="mt-2 text-xs text-primary">저장됐어요</p>}
      </div>

      <div className="card border-red-900/50">
        <h2 className="mb-2 font-medium text-red-400">회원 탈퇴</h2>
        <p className="mb-4 text-sm text-muted">
          탈퇴 시 대화·이미지·인증 기록 등 모든 개인 데이터가 완전히 삭제되며
          복구할 수 없습니다.
        </p>
        {msg && <p className="mb-2 text-sm text-red-400">{msg}</p>}
        {confirming ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={deleteAccount} className="btn flex-1 bg-red-600 text-white">
              영구 삭제 확인
            </button>
            <button onClick={() => setConfirming(false)} className="btn-ghost flex-1">
              취소
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="btn-ghost">
            회원 탈퇴
          </button>
        )}
      </div>
    </main>
    <BottomTabBar />
    </>
  );
}
