"use client";
import { useState, useEffect } from "react";
import { IcCoin } from "@/components/icons";

// 지갑 뷰(클라이언트) — 서버 getWallet과 형태 일치(필요 필드만).
export type WalletClient = {
  balance: number;
  tier: string;
  level: number;
  label: string; // '골드 III'
  bonusPct: number;
  cumulativeKrw: number;
  nextLabel: string | null;
  nextKrw: number | null;
  toNextKrw: number | null;
  unlimited: boolean;
};

const TIER_COLOR: Record<string, string> = {
  bronze: "text-amber-700 border-amber-700/40 bg-amber-700/10",
  silver: "text-slate-300 border-slate-300/40 bg-slate-300/10",
  gold: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  diamond: "text-cyan-300 border-cyan-300/40 bg-cyan-300/10",
  platinum: "text-teal-200 border-teal-200/40 bg-teal-200/10",
  master: "text-fuchsia-400 border-fuchsia-400/40 bg-fuchsia-400/10",
};
const TIER_EMOJI: Record<string, string> = {
  bronze: "🥉", silver: "🥈", gold: "🥇", diamond: "💎", platinum: "🔷", master: "👑",
};

const won = (n: number) => n.toLocaleString("ko-KR");

// 헤더용 잔액+티어 배지. 클릭 시 충전 모달. 잔액은 부모가 소유(chat/image 차감 응답으로 갱신).
export function CreditBadge({ wallet, onWallet }: { wallet: WalletClient; onWallet: (w: WalletClient) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-2.5 py-1 text-sm hover:bg-surface2"
        title={`멤버십 ${wallet.label} · 충전 보너스 ${wallet.bonusPct}%`}
      >
        <span className={"whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-bold " + (TIER_COLOR[wallet.tier] ?? "")}>
          {TIER_EMOJI[wallet.tier] ?? "🥉"} {wallet.label}
        </span>
        <span className="flex items-center gap-1 font-semibold text-gold">
          <IcCoin className="h-4 w-4" />
          {wallet.unlimited ? "∞" : won(wallet.balance)}
        </span>
      </button>
      {open && <ChargeModal wallet={wallet} onClose={() => setOpen(false)} onWallet={onWallet} />}
    </>
  );
}

type Pkg = { code: string; label: string; price_krw: number; base_credits: number };

function ChargeModal({ wallet, onClose, onWallet }: { wallet: WalletClient; onClose: () => void; onWallet: (w: WalletClient) => void }) {
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payments").then((r) => r.json()).then((d) => setPkgs(d.packages ?? [])).catch(() => setPkgs([]));
  }, []);

  async function charge(code: string) {
    setBusy(code);
    setNotice(null);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageCode: code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setNotice(
        data.error === "payments_not_configured"
          ? "결제 연동 준비 중입니다(실 PG 연동 예정)."
          : "충전에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
      return;
    }
    if (data.wallet) onWallet(data.wallet);
    setNotice(`✅ ${won(data.credited)} 크레딧 충전 완료!${data.bonus ? ` (보너스 +${won(data.bonus)})` : ""}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 animate-fadeIn sm:items-center sm:px-4" onClick={onClose}>
      <div className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-border bg-surface animate-slideUp sm:max-w-md sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 px-5 pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-text">크레딧 충전</h3>
            <button onClick={onClose} className="text-muted hover:text-text">✕</button>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span className={"rounded-full border px-1.5 py-0.5 text-[10px] font-bold " + (TIER_COLOR[wallet.tier] ?? "")}>
              {TIER_EMOJI[wallet.tier]} {wallet.label}
            </span>
            <span>보너스 +{wallet.bonusPct}%</span>
            <span className="text-gold">보유 {wallet.unlimited ? "∞" : won(wallet.balance)}</span>
          </div>
          {wallet.nextLabel && wallet.toNextKrw != null && (
            <p className="mt-1 text-xs text-subtle">다음 등급 «{wallet.nextLabel}»까지 ₩{won(wallet.toNextKrw)} 누적 결제</p>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {pkgs === null && <p className="py-6 text-center text-sm text-muted">불러오는 중…</p>}
          {pkgs?.map((p) => {
            const bonus = Math.floor((p.base_credits * wallet.bonusPct) / 100);
            return (
              <button
                key={p.code}
                onClick={() => charge(p.code)}
                disabled={!!busy}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface2 px-4 py-3 text-left transition-colors hover:border-primary/60 disabled:opacity-60"
              >
                <div>
                  <p className="font-semibold text-text">{p.label}</p>
                  <p className="text-xs text-muted">
                    {won(p.base_credits)} 크레딧{bonus > 0 && <span className="text-gold"> + 보너스 {won(bonus)}</span>}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-sm font-bold text-gold">
                  <IcCoin className="h-4 w-4" /> {won(p.base_credits + bonus)}
                </span>
              </button>
            );
          })}
          {notice && <p className="pt-1 text-center text-sm text-primary">{notice}</p>}
          <p className="pt-2 text-center text-[11px] text-subtle">
            결제금액이 누적될수록 멤버십 등급이 오르고 충전 보너스가 커집니다.
          </p>
        </div>
      </div>
    </div>
  );
}
