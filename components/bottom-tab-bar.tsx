"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MOBILE_NAV, isActive } from "./nav-shared";

// 모바일 하단 고정 탭바. lg 이상에서는 NavSidebar가 담당하므로 숨김(상호배타).
// 채팅(/chat/*)에는 렌더하지 않는다 — 입력바가 최하단을 독점하므로 호출부에서 제외.
// useSearchParams는 Suspense 경계 필요(정적 프리렌더 페이지 대응) → 내부에서 래핑.
export function BottomTabBar() {
  return (
    <Suspense fallback={<Bar path="" view={null} />}>
      <BottomTabBarInner />
    </Suspense>
  );
}

function BottomTabBarInner() {
  const path = usePathname();
  const view = useSearchParams().get("view");
  return <Bar path={path} view={view} />;
}

function Bar({ path, view }: { path: string; view: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg2/95 pb-safe backdrop-blur lg:hidden">
      {MOBILE_NAV.map(({ href, label, Icon }) => {
        const active = isActive(href, path, view);
        return (
          <Link
            key={label}
            href={href}
            className={
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium " +
              (active ? "text-primary" : "text-subtle")
            }
          >
            <Icon className="h-[22px] w-[22px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
