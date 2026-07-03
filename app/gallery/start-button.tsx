"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartSessionButton({ botId }: { botId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botProfileId: botId }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/chat/${data.sessionId}`);
    else setLoading(false);
  }

  return (
    <button onClick={start} disabled={loading} className="btn-primary mt-4">
      {loading ? "세션 시작 중…" : "대화 시작"}
    </button>
  );
}
