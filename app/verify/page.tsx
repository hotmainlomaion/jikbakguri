// S2. 성인 인증 — 본인확인(휴대폰/아이핀) 플로우. 실패 시 진입 불가(7-A).
// TODO(운영주체 확인): 실제 인증기관 SDK/리다이렉트 연동. 아래는 콜백 참조값을 받는 골격.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function verify(method: "mobile_auth" | "ipin") {
    setLoading(true);
    setErr(null);
    // 실제 구현: 인증기관 팝업/리다이렉트 → 성공 시 트랜잭션 참조값 수신.
    // 데모 골격에서는 참조값을 즉시 전달. (프로덕션에서는 서버가 참조값을 인증기관에 재검증)
    const providerRef = `TODO-${method}-${crypto.randomUUID()}`;
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, providerRef }),
    });
    setLoading(false);
    if (res.ok) router.push("/gallery");
    else setErr("인증에 실패했습니다. 다시 시도해 주세요.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="badge-19">19</span>
        <h1 className="text-xl font-semibold">성인 인증</h1>
      </div>
      <div className="card space-y-4">
        <p className="text-sm text-muted">
          본 서비스는 만 19세 이상만 이용할 수 있습니다. 본인확인 인증을 완료해
          주세요. 신분증 원본·주민등록번호는 저장되지 않으며, 인증 결과만
          기록됩니다.
        </p>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex flex-col gap-2">
          <button
            disabled={loading}
            onClick={() => verify("mobile_auth")}
            className="btn-primary"
          >
            휴대폰 본인인증
          </button>
          <button
            disabled={loading}
            onClick={() => verify("ipin")}
            className="btn-ghost"
          >
            아이핀 인증
          </button>
        </div>
        <p className="text-xs text-muted">
          {/* TODO(운영주체 확인): 실제 인증기관 연동 전까지 데모 골격 */}
          인증기관 연동은 운영주체 확정 후 활성화됩니다.
        </p>
      </div>
    </main>
  );
}
