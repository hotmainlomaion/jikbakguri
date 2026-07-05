"use client";
// 멀티 캐릭터 플롯 채팅 UI — 제타식 모바일-온리(중앙 좁은 컬럼). 화자별 이름·아바타 말풍선.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { IcBack } from "@/components/icons";

export type PlotBubble = {
  role: "user" | "assistant";
  speaker?: string | null; // 캐릭터 이름(assistant), 나레이션이면 null
  avatarUrl?: string | null;
  content: string;
};

export function PlotChatUI({
  sessionId,
  title,
  protagonistName,
  initial,
}: {
  sessionId: string;
  title: string;
  protagonistName: string;
  initial: PlotBubble[];
}) {
  const [msgs, setMsgs] = useState<PlotBubble[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "novel">("chat"); // 대화모드 ↔ 소설모드
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    setNotice(null);
    setMsgs((m) => [...m, { role: "user", content: t }]);
    setBusy(true);
    try {
      const r = await fetch("/api/plot/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message: t }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(data.bubbles)) {
        setBusy(false);
        setNotice(data.error === "insufficient_credits" ? "크레딧이 부족해요." : "응답을 받지 못했어요. 다시 시도해주세요.");
        return;
      }
      // 화자별 말풍선 순차 노출(카톡식).
      for (let i = 0; i < data.bubbles.length; i++) {
        if (i > 0) await new Promise((res) => setTimeout(res, Math.min(1400, 400 + data.bubbles[i].content.length * 18)));
        setMsgs((m) => [...m, { role: "assistant", ...data.bubbles[i] }]);
      }
      setBusy(false);
    } catch {
      setBusy(false);
      setNotice("응답을 받지 못했어요. 다시 시도해주세요.");
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col bg-bg">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-3 pt-safe py-3 backdrop-blur">
        <Link href="/plots" className="-m-2 p-2 text-muted hover:text-text">
          <IcBack />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-subtle">내 캐릭터: {protagonistName}</div>
        </div>
        {/* 대화모드 ↔ 소설모드 토글 */}
        <div className="flex shrink-0 overflow-hidden rounded-full border border-border text-[11px]">
          {(["chat", "novel"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={"px-2.5 py-1 " + (mode === m ? "bg-primary text-white" : "text-muted")}
            >
              {m === "chat" ? "대화" : "소설"}
            </button>
          ))}
        </div>
      </header>

      {/* 타임라인 */}
      <main className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        <p className="mx-auto w-fit rounded-full bg-surface2 px-3 py-1 text-[11px] text-subtle">이 이야기는 AI가 생성한 가상의 콘텐츠예요</p>
        {mode === "novel" ? (
          <div className="space-y-2.5 px-1 text-[14.5px] leading-[1.75]">
            {msgs.map((m, i) => (
              <NovelLine key={i} m={m} />
            ))}
          </div>
        ) : (
          msgs.map((m, i) => <Bubble key={i} m={m} />)
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="inline-flex gap-1">
              등장인물이 반응 중<span className="animate-pulse">···</span>
            </span>
          </div>
        )}
        <div ref={endRef} />
      </main>

      {notice && <p className="mx-3 mb-1 rounded-lg bg-surface2 px-3 py-2 text-xs text-gold">{notice}</p>}

      {/* 입력 */}
      <div className="border-t border-line px-3 py-3 pb-safe">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
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
              placeholder="내 대사를 입력하세요…"
              className="input max-h-32 resize-none"
            />
          </div>
          <button onClick={send} disabled={busy} className="btn-primary shrink-0">
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

// 소설모드: 대사·지문을 산문처럼 한 줄씩. 화자는 볼드+대사, 지문은 이탤릭, 내 발화는 강조색.
function NovelLine({ m }: { m: PlotBubble }) {
  if (m.role === "user")
    return (
      <p className="text-primary">
        <b>나</b> “{m.content}”
      </p>
    );
  if (!m.speaker) return <p className="italic text-muted">{m.content}</p>;
  return (
    <p>
      <b className="text-text">{m.speaker}</b> <span className="text-subtle">“</span>
      {m.content}
      <span className="text-subtle">”</span>
    </p>
  );
}

function Bubble({ m }: { m: PlotBubble }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] break-words rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-white">{m.content}</div>
      </div>
    );
  }
  // 나레이션(지문)
  if (!m.speaker) {
    return (
      <div className="my-1 flex justify-center">
        <div className="max-w-[92%] rounded-lg border border-line/60 bg-surface2/50 px-3.5 py-2 text-center text-[12.5px] italic leading-relaxed text-muted">
          {m.content}
        </div>
      </div>
    );
  }
  // 캐릭터 발화(이름 + 아바타 + 말풍선)
  return (
    <div className="flex gap-2">
      <Avatar name={m.speaker} size={30} src={m.avatarUrl ?? undefined} />
      <div className="min-w-0">
        <div className="mb-0.5 text-[11px] text-subtle">{m.speaker}</div>
        <div className="max-w-[80%] break-words rounded-2xl rounded-tl-sm bg-surface2 px-4 py-2.5 text-sm">{m.content}</div>
      </div>
    </div>
  );
}
