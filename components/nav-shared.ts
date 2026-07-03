// 네비게이션 단일 소스 — NavSidebar(데스크톱)와 BottomTabBar(모바일)가 공유.
import {
  IcHome,
  IcCompass,
  IcCrown,
  IcChatBubble,
  IcHeart,
  IcImage,
  IcPaw,
  IcGear,
} from "./icons";

export type NavItem = { href: string; label: string; Icon: typeof IcHome };

// 데스크톱 사이드바 전체(8항목).
export const NAV: NavItem[] = [
  { href: "/gallery", label: "홈", Icon: IcHome },
  { href: "/gallery?view=explore", label: "탐색", Icon: IcCompass },
  { href: "/gallery?view=ranking", label: "랭킹", Icon: IcCrown },
  { href: "/history", label: "내 채팅", Icon: IcChatBubble },
  { href: "/gallery?view=favorites", label: "즐겨찾기", Icon: IcHeart },
  { href: "/gallery?view=collection", label: "컬렉션", Icon: IcImage },
  { href: "/gallery?view=attendance", label: "출석 체크", Icon: IcPaw },
  { href: "/settings", label: "설정", Icon: IcGear },
];

// 모바일 하단 탭바(5항목으로 압축 — TopToon 패턴).
// TODO(운영주체 확인): 즐겨찾기/컬렉션/출석의 모바일 진입점(홈 내부 흡수 등).
export const MOBILE_NAV: NavItem[] = [
  { href: "/gallery", label: "홈", Icon: IcHome },
  { href: "/gallery?view=explore", label: "탐색", Icon: IcCompass },
  { href: "/gallery?view=ranking", label: "랭킹", Icon: IcCrown },
  { href: "/history", label: "내 채팅", Icon: IcChatBubble },
  { href: "/settings", label: "설정", Icon: IcGear },
];

// 활성 판정: path + 현재 ?view 값 기준.
export function isActive(href: string, path: string, view: string | null): boolean {
  const [base, query] = href.split("?");
  if (base !== path) return false;
  const hrefView = query ? new URLSearchParams(query).get("view") : null;
  if (base === "/gallery") return (view ?? null) === hrefView;
  return true;
}
