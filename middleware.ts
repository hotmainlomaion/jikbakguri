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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const path = req.nextUrl.pathname;

  // 미로그인 사용자가 보호 페이지 접근 → 로그인으로.
  if (!user && !isPublic(path) && !path.startsWith("/api")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // 정적 자산 제외 전 경로.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
