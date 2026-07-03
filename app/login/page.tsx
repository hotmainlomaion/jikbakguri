// S3. 로그인/가입 — 이메일 매직링크(MVP) + 비밀번호 로그인(데모/로컬).
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

  // 매직링크(프로덕션 기본).
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

  // 비밀번호 로그인(데모/로컬 — 이메일 인프라 없이 즉시 진입).
  async function signInPassword() {
    setErr(null);
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/gallery"); // 미인증 시 서버 게이트가 /verify 로 보냄
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="badge-19">19</span>
        <h1 className="text-xl font-semibold">로그인 / 가입</h1>
      </div>

      {sent ? (
        <div className="card">
          <p className="text-sm">
            <b>{email}</b> 로 로그인 링크를 보냈습니다. 메일함을 확인하세요.
          </p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="card space-y-4">
          <div>
            <label className="mb-1 block text-sm text-muted">이메일</label>
            <input
              type="email"
              required
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
          <div className="border-t border-border pt-4">
            <label className="mb-1 block text-sm text-muted">비밀번호 (데모 로그인)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="비밀번호"
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

          <p className="text-xs text-muted">
            로그인 후 성인 인증을 완료해야 서비스를 이용할 수 있습니다.
          </p>
        </form>
      )}
    </main>
  );
}
