"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Avatar, gradientFor } from "@/components/ui";
import {
  IcHome,
  IcCompass,
  IcCrown,
  IcChatBubble,
  IcHeart,
  IcImage,
  IcGear,
  IcBack,
  IcCoin,
  IcChart,
  IcRefresh,
  IcPlus,
  IcSpark,
  IcVoice,
} from "@/components/icons";
import { ProfileImage, ProfileDetails, type ProfileBot } from "@/components/profile-panel";
import { MobileProfileSheet } from "@/components/mobile-profile-sheet";

type Msg = { id?: string; role: "user" | "assistant"; content: string };
type Bot = ProfileBot;
type Hist = { id: string; name: string; lastActive: string };

const BLOCK_MSG: Record<string, string> = {
  blocked: "입력이 안전 정책에 의해 차단되었습니다.",
  blocked_output: "생성된 응답이 안전 정책에 의해 차단되었습니다.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  daily_limit: "오늘 이미지 생성 한도를 초과했습니다.",
  ai_unavailable: "AI 서비스에 일시적으로 연결할 수 없습니다.",
};

export function ChatUI({
  sessionId,
  bot,
  scenarioTitle,
  initial,
  history,
}: {
  sessionId: string;
  bot: Bot;
  scenarioTitle: string | null;
  initial: Msg[];
  history: Hist[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "chat" | "image">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [tab, setTab] = useState<"daily" | "flutter">("daily");
  const [sheet, setSheet] = useState<null | "profile">(null);
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
    else err(data.error);
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
    if (res.ok) setImage(data.url);
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
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <IconRail />
      <HistoryPanel history={history} active={sessionId} />

      {/* 중앙: 헤더 + [씬 이미지 | 메시지] */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-3 pt-safe py-3 sm:px-4">
          <Link href="/gallery" className="-m-2 p-2 text-muted hover:text-text">
            <IcBack />
          </Link>
          <Avatar name={bot.name} size={32} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-text">{bot.name}</p>
            {scenarioTitle && <p className="truncate text-[11px] text-subtle">{scenarioTitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
              1턴 <b className="text-text">100냥</b> · {msgs.length}턴
            </span>
            <span className="hidden items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-gold sm:flex">
              <IcCoin className="h-3.5 w-3.5" /> 1,900
            </span>
            <span className="hidden items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs text-muted sm:flex">
              <IcChart className="h-3.5 w-3.5" /> 0
            </span>
            {/* 모바일: 프로필 시트 열기(데스크톱은 우측 패널 상시 노출) */}
            <button
              onClick={() => setSheet("profile")}
              className="-m-1 rounded-full p-1 text-muted hover:text-text lg:hidden"
              aria-label="프로필"
            >
              <Avatar name={bot.name} size={28} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* 씬 이미지 — 모바일 상단 스트립 / 데스크톱 좌측 세로패널 */}
          <div className="relative h-40 w-full shrink-0 border-b border-line lg:h-auto lg:w-[42%] lg:border-b-0 lg:border-r">
            <div className="absolute inset-0" style={{ background: gradientFor(bot.name) }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
            <span className="absolute inset-0 flex items-center justify-center text-[72px] font-black text-white/10 lg:text-[140px]">
              {bot.name.slice(0, 1)}
            </span>
            <div className="absolute left-4 top-4 flex items-center gap-2 text-xs text-white/80">
              <span className="h-4 w-4 rounded-full border border-white/40" />
              0% · {image ? "1 / 1" : `${msgs.length} / ${msgs.length}`}
            </div>
            <button className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60">
              <IcRefresh className="h-4 w-4" />
            </button>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="생성 이미지" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <button className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/90 backdrop-blur hover:bg-black/70">
              🖼️ 장면 선택 ▾
            </button>
          </div>

          {/* 메시지 + 입력 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-5">
              {msgs.map((m, i) => (
                <MessageRow key={m.id ?? i} msg={m} botName={bot.name} />
              ))}
              {busy && (
                <div className="flex items-center gap-2">
                  <Avatar name={bot.name} size={28} />
                  <div className="rounded-2xl rounded-tl-sm bg-surface2 px-4 py-2 text-sm text-muted">
                    <span className="inline-flex gap-1">
                      {busy === "image" ? "이미지 생성 중…" : "입력 중"}
                      <span className="animate-pulse">···</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {notice && (
              <p className="mx-3 mb-2 rounded-lg bg-surface2 px-3 py-2 text-xs text-gold sm:mx-5">{notice}</p>
            )}

            {/* 입력바 */}
            <div className="border-t border-line px-3 py-3 pb-safe sm:px-4">
              <div className="no-scrollbar mb-2 flex items-center gap-2 overflow-x-auto text-xs">
                <button
                  onClick={() => setTab("daily")}
                  className={
                    "shrink-0 rounded-full px-3 py-1 " +
                    (tab === "daily" ? "bg-primary text-white" : "border border-border text-muted")
                  }
                >
                  💬 일상톡
                </button>
                <button
                  onClick={() => setTab("flutter")}
                  className={
                    "shrink-0 rounded-full px-3 py-1 " +
                    (tab === "flutter" ? "bg-primary text-white" : "border border-border text-muted")
                  }
                >
                  ♡ 설렘톡
                </button>
                <div className="ml-auto flex shrink-0 gap-2">
                  <button className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-muted hover:bg-surface3">
                    <IcSpark className="h-3.5 w-3.5" /> <span className="hidden sm:inline">상황추가</span>
                  </button>
                  <button className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-muted hover:bg-surface3">
                    <IcPlus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">추천답장</span>
                  </button>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={genImage}
                  disabled={!!busy}
                  title="이미지 생성"
                  className="btn-ghost shrink-0 !px-2.5"
                >
                  <IcImage className="h-5 w-5" />
                </button>
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
                    placeholder={`${bot.name}에게 메시지 보내기...`}
                    className="input max-h-32 resize-none pr-10"
                  />
                  <button
                    onClick={send}
                    disabled={!!busy}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                  >
                    <IcVoice className="h-5 w-5" />
                  </button>
                </div>
                <button onClick={send} disabled={!!busy} className="btn-primary shrink-0">
                  전송
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 모바일 프로필 바텀시트 */}
      <MobileProfileSheet
        bot={bot}
        onReport={report}
        open={sheet === "profile"}
        onClose={() => setSheet(null)}
      />

      <ProfilePanel bot={bot} onReport={report} />
    </div>
  );
}

function MessageRow({ msg, botName }: { msg: Msg; botName: string }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] break-words rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-white sm:max-w-[80%]">
          {msg.content}
        </div>
      </div>
    );
  }
  // 나레이션(「」)과 대사 분리 렌더.
  const isNarration = /^\s*[「『].*[」』]\s*$/.test(msg.content.trim());
  if (isNarration) {
    return (
      <p className="px-3 text-center text-[13px] italic leading-relaxed text-muted sm:px-6">{msg.content}</p>
    );
  }
  return (
    <div className="flex gap-2">
      <Avatar name={botName} size={28} />
      <div className="min-w-0">
        <p className="mb-1 text-xs text-subtle">{botName}</p>
        <div className="max-w-[80%] break-words rounded-2xl rounded-tl-sm bg-surface2 px-4 py-2.5 text-sm text-text sm:max-w-[85%]">
          {msg.content}
        </div>
      </div>
    </div>
  );
}

function IconRail() {
  const items = [
    { Icon: IcHome, href: "/gallery" },
    { Icon: IcCompass, href: "/gallery" },
    { Icon: IcCrown, href: "/gallery" },
    { Icon: IcChatBubble, href: "/history" },
    { Icon: IcHeart, href: "/gallery" },
    { Icon: IcImage, href: "/gallery" },
    { Icon: IcGear, href: "/settings" },
  ];
  return (
    <nav className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-bg2 py-4 xl:flex">
      <Link href="/gallery" className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-danger text-sm font-black text-white">
        T
      </Link>
      {items.map(({ Icon, href }, i) => (
        <Link key={i} href={href} className="nav-rail-item">
          <Icon />
        </Link>
      ))}
    </nav>
  );
}

function HistoryPanel({ history, active }: { history: Hist[]; active: string }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-bg2 xl:flex">
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-text">
          <IcChatBubble className="h-4 w-4" /> 대화 내역
        </h2>
        <Link href="/gallery" className="text-muted hover:text-text">
          <IcPlus className="h-5 w-5" />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {history.map((h) => (
          <Link
            key={h.id}
            href={`/chat/${h.id}`}
            className={
              "mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 " +
              (h.id === active ? "bg-surface" : "hover:bg-surface")
            }
          >
            <Avatar name={h.name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{h.name}</p>
              <p className="truncate text-[11px] text-subtle">
                {new Date(h.lastActive).toLocaleDateString("ko-KR")}
              </p>
            </div>
          </Link>
        ))}
        {history.length === 0 && <p className="px-3 py-6 text-center text-sm text-subtle">대화 내역이 없어요</p>}
      </div>
    </aside>
  );
}

// 데스크톱 우측 프로필 패널 — 모바일은 MobileProfileSheet가 동일 본문 공유.
function ProfilePanel({ bot, onReport }: { bot: Bot; onReport: () => void }) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-bg2 lg:flex">
      <ProfileImage name={bot.name} className="aspect-[4/5]" />
      <div className="px-5 pb-8">
        <ProfileDetails bot={bot} onReport={onReport} />
      </div>
    </aside>
  );
}
