// S5 채팅 UI. 텍스트 대화 + 이미지 생성 버튼 + "생성 중…" 큐 상태 + 신고.
"use client";
import { useState, useRef, useEffect } from "react";

type Msg = { id?: string; role: "user" | "assistant"; content: string };
type ImgState = { url: string; expiresAt: string } | null;

const BLOCK_MSG: Record<string, string> = {
  blocked: "입력이 안전 정책에 의해 차단되었습니다.",
  blocked_output: "생성된 응답이 안전 정책에 의해 차단되었습니다.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  daily_limit: "오늘 이미지 생성 한도를 초과했습니다.",
  ai_unavailable: "AI 서비스에 일시적으로 연결할 수 없습니다.",
};

export function ChatUI({
  sessionId,
  botName,
  initial,
}: {
  sessionId: string;
  botName: string;
  initial: Msg[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "chat" | "image">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [image, setImage] = useState<ImgState>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, image]);

  function err(code?: string) {
    setNotice(BLOCK_MSG[code ?? ""] ?? "요청을 처리하지 못했습니다.");
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setNotice(null);
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setBusy("chat");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message: text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
    else err(data.error ?? data.category ? "blocked" : undefined);
  }

  async function genImage() {
    if (busy) return;
    const prompt = window.prompt("생성할 이미지를 설명해 주세요");
    if (!prompt?.trim()) return;
    setNotice(null);
    setBusy("image");
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, prompt }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) setImage({ url: data.url, expiresAt: data.expiresAt });
    else err(data.error);
  }

  async function report() {
    const reason = window.prompt("신고 사유를 입력해 주세요");
    if (!reason?.trim()) return;
    await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, reason }),
    });
    setNotice("신고가 접수되었습니다. 운영자가 검토합니다.");
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-border py-3">
        <div className="flex items-center gap-2">
          <a href="/gallery" className="text-muted">
            ←
          </a>
          <h1 className="font-medium">{botName}</h1>
        </div>
        <button onClick={report} className="text-xs text-muted hover:text-red-400">
          신고
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {msgs.map((m, i) => (
          <div
            key={m.id ?? i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                "max-w-[80%] rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user" ? "bg-primary text-white" : "bg-surface2")
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {image && (
          <div className="flex justify-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt="생성 이미지"
              className="max-w-[80%] rounded-2xl border border-border"
            />
          </div>
        )}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-surface2 px-4 py-2 text-sm text-muted">
              {busy === "image" ? "이미지 생성 중… (순차 처리)" : "응답 생성 중…"}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {notice && (
        <p className="mb-2 rounded-lg bg-surface2 px-3 py-2 text-xs text-yellow-300">
          {notice}
        </p>
      )}

      <div className="flex items-end gap-2 border-t border-border py-3">
        <button onClick={genImage} disabled={!!busy} className="btn-ghost shrink-0" title="이미지 생성">
          🖼️
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="메시지를 입력하세요"
          className="input resize-none"
        />
        <button onClick={send} disabled={!!busy} className="btn-primary shrink-0">
          전송
        </button>
      </div>
    </main>
  );
}
