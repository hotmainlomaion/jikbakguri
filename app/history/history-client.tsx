"use client";
// 내 채팅 리스트(클라이언트) — 썸네일 + 관계 단계 배지 + 마지막 대화 미리보기 + 삭제.
// 카드 본문은 /chat/[id]로 이동, 우측 삭제 버튼은 확인 모달 후 DELETE /api/session/[id].
import { useState } from "react";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { stageForIntimacy, stageProgress } from "@/lib/persona/relationship";

export type HistoryItem = {
  id: string;
  name: string;
  thumb: string | null; // 마지막 생성이미지 → 아바타 → null
  hasImage: boolean; // 썸네일이 실제 생성 이미지인지(아바타 대비)
  intimacy: number;
  lastMessage: string | null;
  lastRole: string | null; // 'user' | 'assistant'
  lastActive: string;
};

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export function HistoryClient({ items }: { items: HistoryItem[] }) {
  const [list, setList] = useState(items);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const target = list.find((x) => x.id === confirmId) ?? null;

  async function remove(id: string) {
    setDeleting(id);
    setErr(null);
    try {
      const res = await fetch(`/api/session/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setList((l) => l.filter((x) => x.id !== id));
      setConfirmId(null);
    } catch {
      setErr("삭제에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6 sm:py-10 lg:pb-10">
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-semibold sm:text-2xl">내 채팅</h1>
          <Link href="/gallery" className="text-sm text-muted hover:text-text">
            홈
          </Link>
        </header>

        {list.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <p className="text-muted">아직 대화가 없어요.</p>
            <Link href="/gallery" className="btn-primary">
              캐릭터 둘러보기
            </Link>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {list.map((s) => {
              const stage = stageForIntimacy(s.intimacy);
              const prog = stageProgress(s.intimacy);
              const isDel = deleting === s.id;
              return (
                <li key={s.id} className="relative">
                  <Link
                    href={`/chat/${s.id}`}
                    className={
                      "flex items-center gap-3 rounded-xl border border-border bg-surface p-3 pr-12 transition-colors hover:bg-surface2 " +
                      (isDel ? "pointer-events-none opacity-50" : "")
                    }
                  >
                    {/* 썸네일 */}
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface2">
                      {s.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-subtle">
                          {s.name.slice(0, 1)}
                        </div>
                      )}
                      {s.hasImage && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] leading-tight text-white">
                          📷
                        </span>
                      )}
                    </div>

                    {/* 본문 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface2 px-2 py-0.5 text-[11px] text-muted">
                          {stage.emoji} {stage.label}
                        </span>
                      </div>
                      {/* 관계 진행 게이지 */}
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface3">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${prog}%` }} />
                      </div>
                      <p className="mt-1.5 truncate text-xs text-muted">
                        {s.lastMessage ? (
                          <>
                            <span className="text-subtle">{s.lastRole === "user" ? "나: " : ""}</span>
                            {s.lastMessage}
                          </>
                        ) : (
                          <span className="text-subtle">대화를 시작해보세요</span>
                        )}
                      </p>
                    </div>

                    <span className="absolute right-11 top-3 shrink-0 whitespace-nowrap text-[11px] text-subtle">
                      {relTime(s.lastActive)}
                    </span>
                  </Link>

                  {/* 삭제 버튼(링크 밖) */}
                  <button
                    type="button"
                    aria-label="대화 삭제"
                    disabled={isDel}
                    onClick={() => setConfirmId(s.id)}
                    className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface3 hover:text-red-400 disabled:opacity-40"
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* 삭제 확인 모달 */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => deleting || setConfirmId(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">대화를 삭제할까요?</h2>
            <p className="mt-1.5 text-sm text-muted">
              <span className="text-text">{target.name}</span>님과의 대화와 생성된 이미지가 모두 삭제됩니다. 되돌릴 수 없어요.
            </p>
            {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                disabled={!!deleting}
                onClick={() => setConfirmId(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                disabled={!!deleting}
                onClick={() => remove(target.id)}
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomTabBar />
    </>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
