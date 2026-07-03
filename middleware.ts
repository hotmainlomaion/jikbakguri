// 엣지 미들웨어: 세션 갱신 + 보호 라우트 1차 게이트.
// 최종 성인/차단 검증은 서버 라우트/페이지의 requireVerifiedUser()가 담당(심층 방어).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 인증 없이 접근 가능한 경로.
const PUBLIC = ["/", "/login", "/verify", "/auth"];

function isPublic(path: string) {
  return PUBLIC.some((p) => path === p || path.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // env 미설정(예: 시크릿 없는 데모 코드스페이스): 인증 불가 → fail-closed.
  // 공개 페이지(랜딩/로그인)만 렌더, 보호 라우트는 로그인으로 리다이렉트. 보안 약화 아님.
  if (!url || !anon) {
    if (!isPublic(path) && !path.startsWith("/api")) {
      const u = req.nextUrl.clone();
      u.pathname = "/login";
      return NextResponse.redirect(u);
    }
    return res;
  }

  const supabase = createServerClient(
    url,
    anon,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미로그인 사용자가 보호 페이지 접근 → 로그인으로.
  if (!user && !isPublic(path) && !path.startsWith("/api")) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/login";
    return NextResponse.redirect(dest);
  }

  return res;
}

export const config = {
  // 정적 자산 제외 전 경로.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
