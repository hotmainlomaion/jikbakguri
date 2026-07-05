// S3. 로그인/가입 — 성인(19+) AI 캐릭터 챗 무드. 풀블리드 히어로(로컬 이미지 엔진 생성물
// /login-hero.jpg) 위에 글래스 카드로 브랜드/카피 + 인증 폼. 인증 로직(매직링크/데모 비밀번호)은 기존 유지.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function signInPassword() {
    setErr(null);
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/gallery"); // 미인증 시 서버 게이트가 /verify 로 보냄
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-bg text-text">
      {/* 풀블리드 히어로 (로컬 이미지 엔진 생성물, 없으면 딥 그라디언트 폴백) */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(12,9,17,0.45) 0%, rgba(12,9,17,0.75) 55%, rgba(12,9,17,0.97) 100%), url('/login-hero.png')",
          backgroundColor: "#140f1c",
        }}
      />
      {/* 좌하단 브랜딩(데스크톱) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-6 sm:p-8">
        <span className="badge-19">19</span>
        <span className="text-lg font-extrabold tracking-tight text-white drop-shadow">직박구리</span>
      </div>

      {/* 콘텐츠: 하단 정렬(모바일), 중앙(데스크톱) */}
      <div className="relative z-10 flex min-h-[100dvh] items-end justify-center px-5 pb-10 pt-24 sm:items-center sm:py-10">
        <div className="w-full max-w-sm">
          {/* 카피 */}
          <div className="mb-5 text-center sm:text-left">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary/90">
              After Midnight
            </p>
            <h2 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">
              12시가 지나면,<br />그녀가 당신을 부른다.
            </h2>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/70 sm:mx-0">
              큐레이션된 성인 AI 캐릭터와의 은밀한 대화. 검열 없는 몰입, 완전한 프라이버시.
            </p>
          </div>

          {/* 글래스 카드 */}
          <div className="rounded-2xl border border-white/10 bg-black/50 p-5 shadow-2xl backdrop-blur-xl">
            {sent ? (
              <div>
                <p className="text-sm leading-relaxed text-white/90">
                  <b className="text-white">{email}</b> 로 로그인 링크를 보냈습니다.<br />
                  메일함을 확인해 주세요.
                </p>
                <button onClick={() => setSent(false)} className="btn-ghost mt-4 w-full">
                  다른 이메일로 시도
                </button>
              </div>
            ) : (
              <form onSubmit={sendLink} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm text-white/70">이메일</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                  />
                </div>

                {err && <p className="text-sm text-red-400">{err}</p>}

                <button disabled={busy} className="btn-primary w-full">
                  로그인 링크 받기 (이메일)
                </button>

                {/* 데모/로컬: 비밀번호 로그인 */}
                <div className="border-t border-white/10 pt-4">
                  <label className="mb-1.5 block text-sm text-white/70">비밀번호 (데모 로그인)</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="비밀번호"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && email && password) {
                        e.preventDefault();
                        signInPassword();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={signInPassword}
                    disabled={busy || !email || !password}
                    className="btn-ghost mt-2 w-full"
                  >
                    비밀번호로 로그인
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-4 px-1 text-center text-xs leading-relaxed text-white/50 sm:text-left">
            본 서비스는 <b className="text-white/70">만 19세 이상</b> 성인 전용이며, 로그인 후{" "}
            <b className="text-white/70">성인 인증</b>을 완료해야 이용할 수 있습니다. 청소년 유해 매체물 포함.
          </p>
        </div>
      </div>
    </main>
  );
}
