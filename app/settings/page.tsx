// S7. 설정 — 계정, 탈퇴(데이터 완전 삭제, 7-D).
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export default function SettingsPage() {
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
