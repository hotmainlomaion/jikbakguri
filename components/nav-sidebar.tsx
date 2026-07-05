"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo, Avatar } from "./ui";
import { NAV, isActive } from "./nav-shared";

export type RankItem = { id: string; name: string; tag: string; score: number };

export function NavSidebar({ ranking = [] }: { ranking?: RankItem[] }) {
  const path = usePathname();
  const view = useSearchParams().get("view");

  return (
    <aside className="hidden">
      <div className="px-5 py-4">
        <Link href="/gallery">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={label}
            href={href}
            className={"nav-item" + (isActive(href, path, view) ? " nav-item-active" : "")}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </Link>
        ))}
      </nav>

      {/* 이벤트 */}
      <div className="mt-6 px-5">
        <p className="mb-2 text-xs font-semibold text-subtle">이벤트</p>
        <Link
          href="/gallery"
          className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-text hover:bg-surface3"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-xs">🔥</span>
          끝까지, 깊게
        </Link>
      </div>

      {/* 실시간 랭킹 */}
      <div className="mt-6 flex-1 overflow-y-auto px-5 no-scrollbar">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" />
          <p className="text-xs font-semibold text-text">실시간 캐릭터 랭킹</p>
        </div>
        <ol className="space-y-3">
          {ranking.slice(0, 3).map((r, i) => (
            <li key={r.id} className="flex items-center gap-2.5">
              <Avatar name={r.name} size={36} rounded="rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{r.name}</p>
                <p className="truncate text-[11px] text-subtle">#{r.tag}</p>
              </div>
              <span className="text-xs font-semibold text-primary">● {r.score}</span>
            </li>
          ))}
        </ol>
        <button className="mt-4 w-full rounded-lg border border-border py-2 text-xs text-muted hover:bg-surface">
          전체보기
        </button>
      </div>
    </aside>
  );
}
