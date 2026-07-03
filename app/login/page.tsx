// S3. 로그인/가입 — 이메일 매직링크(MVP). 가입 후 성인 인증(S2)으로 유도.
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
    else setSent(true);
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
        <form onSubmit={submit} className="card space-y-4">
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
          <button className="btn-primary w-full">로그인 링크 받기</button>
          <p className="text-xs text-muted">
            로그인 후 성인 인증을 완료해야 서비스를 이용할 수 있습니다.
          </p>
        </form>
      )}
    </main>
  );
}
