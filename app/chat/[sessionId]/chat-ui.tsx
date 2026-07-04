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

type Msg = { id?: string; role: "user" | "assistant"; content: string; imageUrl?: string; selfie?: boolean };
type Bot = ProfileBot;
type Hist = { id: string; name: string; lastActive: string };
type Mood = { state: string; intensity: number; label: string; emoji: string };
type Relationship = { intimacy: number; stage: string; label: string; emoji: string; progress: number };
type Recall = { daysSince: number; firstMetLabel: string; messageCount: number; imageUrl: string | null };

const BLOCK_MSG: Record<string, string> = {
  blocked: "입력이 안전 정책에 의해 차단되었습니다.",
  blocked_output: "생성된 응답이 안전 정책에 의해 차단되었습니다.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  daily_limit: "오늘 이미지 생성 한도를 초과했습니다.",
  ai_unavailable: "AI 서비스에 일시적으로 연결할 수 없습니다.",
};

// F32 오프너 빠른 답장 칩(성인 톤, 노골 아님 — 탭하면 그대로 전송).
const OPENER_CHIPS = ["응, 나도 보고 싶었어", "무슨 생각 하고 있었어?", "가까이 와서 얘기하자"];

export function ChatUI({
  sessionId,
  bot,
  scenarioTitle,
  initial,
  mood: initialMood,
  relationship: initialRel,
  recall,
  history,
}: {
  sessionId: string;
  bot: Bot;
  scenarioTitle: string | null;
  initial: Msg[];
  mood: Mood;
  relationship: Relationship;
  recall: Recall | null;
  history: Hist[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "chat" | "image">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>(initialMood);
  const [rel, setRel] = useState<Relationship>(initialRel);
  const [stageUp, setStageUp] = useState<string | null>(null);
  const [tab, setTab] = useState<"daily" | "flutter">("daily");
  const [sheet, setSheet] = useState<null | "profile">(null);
  const [studio, setStudio] = useState(false);
  const [safeView, setSafeView] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [recallShown, setRecallShown] = useState(!!recall);
  const [kbInset, setKbInset] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, image, kbInset]);

  // F46 세이프뷰: 선택 지속(localStorage) + 흔들기(devicemotion) 즉시 발동.
  useEffect(() => {
    try {
      if (localStorage.getItem("jb_safeview") === "1") setSafeView(true);
    } catch {}
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
      if (mag > 42) setSafeView(true); // 강하게 흔들면 즉시 가림
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);
  function toggleSafeView() {
    setSafeView((v) => {
      const n = !v;
      try {
        localStorage.setItem("jb_safeview", n ? "1" : "0");
      } catch {}
      return n;
    });
  }

  // iOS 소프트 키보드 대응(키보드 높이만큼 padding-bottom).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(inset > 60 ? inset : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  function err(code?: string) {
    setNotice(BLOCK_MSG[code ?? ""] ?? "요청을 처리하지 못했습니다.");
  }

  // F32: 오프닝 상태 = 봇 인사만 있고 아직 사용자 발화 없음.
  const isOpening = msgs.length <= 1 && !msgs.some((m) => m.role === "user");

  async function sendText(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setNotice(null);
    setMsgs((m) => [...m, { role: "user", content: t }]);
    setBusy("chat");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message: t }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return err(data.error);
    setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
    if (data.mood) setMood((prev) => ({ ...prev, ...data.mood })); // F12 감정 갱신
    // F10 관계 단계/친밀도 갱신 + 단계업 알림.
    if (data.relationship) {
      const r = data.relationship;
      setRel((prev) => ({ ...prev, intimacy: r.intimacy, stage: r.stage, label: r.label, emoji: r.emoji, progress: r.progress ?? prev.progress }));
      if (r.stageUp) {
        setStageUp(`${r.emoji} 관계가 «${r.label}» 단계로 깊어졌어요`);
        setTimeout(() => setStageUp(null), 5000);
      }
    }
    // F20 인챗 셀피: 사진 요청 감지 시 캐릭터가 셀카를 "보낸다"(별도 이미지 파이프라인/모더레이션).
    if (data.selfie) runImage(data.selfie, { asSelfie: true });
  }
  const send = () => sendText(input);

  // 공용 이미지 생성 — 스튜디오(F17)·셀카(F20) 공통. /api/image가 style/seed·모더레이션 담당.
  async function runImage(prompt: string, opts?: { asSelfie?: boolean }) {
    if (busy || !prompt.trim()) return;
    setNotice(null);
    setBusy("image");
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, prompt }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return err(data.error);
    setImage(data.url);
    setMsgs((m) => [
      ...m,
      { role: "assistant", content: "", imageUrl: data.url, selfie: opts?.asSelfie },
    ]);
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

  const sceneImg = image ?? bot.avatarUrl ?? null; // F32: 생성물 없으면 대표컷을 오프닝 이미지로
  const sceneBlurred = safeView && !!sceneImg && peekId !== "scene";

  return (
    <div
      className="flex h-[100dvh] overflow-hidden bg-bg"
      style={kbInset ? { paddingBottom: kbInset } : undefined}
    >
      <IconRail />
      <HistoryPanel history={history} active={sessionId} />

      {/* 중앙: 헤더 + [씬 이미지 | 메시지] */}
      <section className="relative flex min-w-0 flex-1 flex-col">
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
            {/* F10 관계 단계 배지 + 친밀도 게이지 */}
            <RelationshipBadge rel={rel} />
            {/* F12 감정 칩 — 평온이 아니면 노출 */}
            <MoodChip mood={mood} />
            {/* F46 세이프뷰 토글 */}
            <button
              onClick={toggleSafeView}
              title={safeView ? "세이프뷰 켜짐 — 탭하면 해제" : "세이프뷰 — 화면 즉시 가리기"}
              aria-label="세이프뷰"
              className={
                "rounded-full px-2.5 py-1 text-sm " +
                (safeView ? "bg-primary text-white" : "bg-surface text-muted hover:text-text")
              }
            >
              {safeView ? "🙈" : "👁️"}
            </button>
            <span className="hidden items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-gold sm:flex">
              <IcCoin className="h-3.5 w-3.5" /> 1,900
            </span>
            {/* 모바일: 프로필 시트 열기 */}
            <button
              onClick={() => setSheet("profile")}
              className="-m-1 rounded-full p-1 text-muted hover:text-text lg:hidden"
              aria-label="프로필"
            >
              <Avatar name={bot.name} size={28} />
            </button>
          </div>
        </header>

        {/* F10 단계업 토스트 */}
        {stageUp && (
          <div className="pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2 animate-fadeIn">
            <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg">
              {stageUp}
            </span>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* 씬 이미지 — 모바일 상단 스트립 / 데스크톱 좌측 세로패널 */}
          <div className="relative h-40 w-full shrink-0 border-b border-line lg:h-auto lg:w-[42%] lg:border-b-0 lg:border-r">
            <div className="absolute inset-0" style={{ background: gradientFor(bot.name) }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
            {!sceneImg && (
              <span className="absolute inset-0 flex items-center justify-center text-[72px] font-black text-white/10 lg:text-[140px]">
                {bot.name.slice(0, 1)}
              </span>
            )}
            {sceneImg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sceneImg}
                alt="장면 이미지"
                onPointerDown={() => safeView && setPeekId("scene")}
                onPointerUp={() => setPeekId(null)}
                onPointerLeave={() => setPeekId(null)}
                className={
                  "absolute inset-0 h-full w-full object-cover transition-[filter] duration-200 " +
                  (sceneBlurred ? "blur-2xl" : "")
                }
              />
            )}
            {sceneBlurred && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/80">
                🙈 눌러서 보기
              </div>
            )}
            <div className="absolute left-4 top-4 flex items-center gap-2 text-xs text-white/80">
              <span className="h-4 w-4 rounded-full border border-white/40" />
              {image ? "생성 이미지" : bot.avatarUrl ? "대표컷" : `${msgs.length}턴`}
            </div>
            <button
              onClick={() => setStudio(true)}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/90 backdrop-blur hover:bg-black/70"
            >
              🎨 변형 스튜디오 ▾
            </button>
          </div>

          {/* 메시지 + 입력 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-5">
              {/* F09 오늘의 회상 카드 */}
              {recall && recallShown && (
                <RecallCard
                  recall={recall}
                  botName={bot.name}
                  safeView={safeView}
                  onClose={() => setRecallShown(false)}
                />
              )}
              {msgs.map((m, i) => (
                <MessageRow
                  key={m.id ?? i}
                  msg={m}
                  botName={bot.name}
                  safeView={safeView}
                  peek={peekId === String(i)}
                  onPeekStart={() => safeView && m.imageUrl && setPeekId(String(i))}
                  onPeekEnd={() => setPeekId(null)}
                />
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

            {/* F32 오프너 빠른 답장 칩 */}
            {isOpening && !busy && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1 sm:px-5">
                {OPENER_CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => sendText(c)}
                    className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20"
                  >
                    {c}
                  </button>
                ))}
              </div>
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
                  <button
                    onClick={() => setStudio(true)}
                    className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-muted hover:bg-surface3"
                  >
                    <IcSpark className="h-3.5 w-3.5" /> <span className="hidden sm:inline">변형 스튜디오</span>
                  </button>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={() => setStudio(true)}
                  disabled={!!busy}
                  title="변형 스튜디오"
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

      {/* F17 변형 스튜디오 바텀시트 */}
      {studio && (
        <StudioSheet
          botName={bot.name}
          busy={busy === "image"}
          onClose={() => setStudio(false)}
          onGenerate={(prompt) => {
            setStudio(false);
            runImage(prompt);
          }}
        />
      )}

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

// F10 관계 단계 배지 + 친밀도 게이지.
function RelationshipBadge({ rel }: { rel: Relationship }) {
  return (
    <span
      title={`관계: ${rel.label} · 친밀도 ${rel.intimacy}/100`}
      className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs text-muted"
    >
      <span className="text-sm leading-none">{rel.emoji}</span>
      <span className="hidden sm:inline">{rel.label}</span>
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-surface3">
        <span
          className="block h-full rounded-full bg-danger"
          style={{ width: `${Math.min(100, Math.max(6, rel.progress))}%` }}
        />
      </span>
    </span>
  );
}

// F12 감정 칩 — 평온/0이면 숨김.
function MoodChip({ mood }: { mood: Mood }) {
  if (!mood || mood.state === "neutral" || mood.intensity <= 0) return null;
  return (
    <span
      title={`${bot_moodTitle(mood)}`}
      className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs text-muted"
    >
      <span className="text-sm leading-none">{mood.emoji}</span>
      <span className="hidden sm:inline">{mood.label}</span>
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-surface3">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(8, mood.intensity))}%` }}
        />
      </span>
    </span>
  );
}
function bot_moodTitle(mood: Mood) {
  return `지금 기분: ${mood.label} (${mood.intensity}/100)`;
}

// F09 오늘의 회상 카드.
function RecallCard({
  recall,
  botName,
  safeView,
  onClose,
}: {
  recall: Recall;
  botName: string;
  safeView: boolean;
  onClose: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-surface2 p-3">
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-2 top-2 text-subtle hover:text-text"
      >
        ✕
      </button>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">✨ 오늘의 회상</p>
      <div className="flex items-center gap-3">
        {recall.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recall.imageUrl}
            alt="추억"
            className={
              "h-16 w-16 shrink-0 rounded-lg object-cover " + (safeView ? "blur-md" : "")
            }
          />
        ) : (
          <Avatar name={botName} size={56} />
        )}
        <div className="min-w-0 text-sm">
          <p className="font-medium text-text">{recall.firstMetLabel}</p>
          <p className="text-xs text-muted">
            그동안 {recall.messageCount}번의 이야기를 나눴어요. {botName}와의 순간, 이어서 볼까요?
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  msg,
  botName,
  safeView,
  peek,
  onPeekStart,
  onPeekEnd,
}: {
  msg: Msg;
  botName: string;
  safeView: boolean;
  peek: boolean;
  onPeekStart: () => void;
  onPeekEnd: () => void;
}) {
  // 이미지 메시지(생성 이미지 / 셀카) 렌더.
  if (msg.imageUrl) {
    const blurred = safeView && !peek;
    return (
      <div className="flex gap-2">
        <Avatar name={botName} size={28} />
        <div className="min-w-0">
          {msg.selfie && <p className="mb-1 text-xs text-primary">📷 {botName}가 셀카를 보냈어요</p>}
          <div className="relative w-56 max-w-[70%] overflow-hidden rounded-2xl rounded-tl-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={msg.imageUrl}
              alt="생성 이미지"
              onPointerDown={onPeekStart}
              onPointerUp={onPeekEnd}
              onPointerLeave={onPeekEnd}
              className={"w-full object-cover transition-[filter] duration-200 " + (blurred ? "blur-2xl" : "")}
            />
            {blurred && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white/90">
                🙈 눌러서 보기
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
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

// ---------- F17 변형 스튜디오 ----------
// 캐릭터 정체성(고정 seed·appearance_desc)은 라우트가 잠근다. 여기선 장면/포즈/의상만 조합.
// 프리셋은 성인 전제이되 운영자-안전(미성년 암시 옵션 없음). 노골 강도는 자유입력으로.
const STUDIO_GROUPS: { key: string; label: string; options: string[] }[] = [
  { key: "pose", label: "포즈", options: ["앉아서", "서서", "누워서", "뒤돌아보며", "기대어"] },
  { key: "outfit", label: "의상", options: ["지금 그대로", "캐주얼", "원피스", "잠옷", "수영복", "속옷 차림"] },
  { key: "expr", label: "표정", options: ["미소", "부끄러운", "무표정", "유혹적인", "장난스런"] },
  { key: "bg", label: "배경", options: ["침실", "거실", "카페", "해변", "도시 야경"] },
  { key: "shot", label: "구도", options: ["클로즈업", "상반신", "전신", "셀카 앵글"] },
];

function StudioSheet({
  botName,
  busy,
  onClose,
  onGenerate,
}: {
  botName: string;
  busy: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  const [free, setFree] = useState("");

  function pick(group: string, opt: string) {
    setSel((s) => ({ ...s, [group]: s[group] === opt ? "" : opt }));
  }
  const chosen = STUDIO_GROUPS.map((g) => sel[g.key]).filter(Boolean);
  function build() {
    const parts = [...chosen];
    if (free.trim()) parts.push(free.trim());
    return parts.join(", ");
  }
  const canGen = (chosen.length > 0 || free.trim().length > 0) && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 animate-fadeIn sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl bg-bg2 p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-text">🎨 {botName} 변형 스튜디오</h3>
          <button onClick={onClose} className="text-subtle hover:text-text">✕</button>
        </div>
        <p className="mb-3 text-xs text-subtle">
          같은 {botName}로 장면만 바꿔 생성해요. 원하는 걸 탭하거나 직접 적어주세요.
        </p>
        <div className="max-h-[46vh] space-y-3 overflow-y-auto">
          {STUDIO_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 text-xs font-medium text-muted">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {g.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => pick(g.key, opt)}
                    className={
                      "rounded-full px-3 py-1.5 text-xs " +
                      (sel[g.key] === opt
                        ? "bg-primary text-white"
                        : "border border-border text-muted hover:bg-surface3")
                    }
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">직접 묘사 (선택)</p>
            <textarea
              value={free}
              onChange={(e) => setFree(e.target.value)}
              rows={2}
              placeholder="원하는 장면·분위기·수위를 자유롭게 적어주세요"
              className="input resize-none text-sm"
            />
          </div>
        </div>
        <button
          onClick={() => onGenerate(build())}
          disabled={!canGen}
          className="btn-primary mt-4 w-full disabled:opacity-50"
        >
          {busy ? "생성 중…" : "이미지 생성"}
        </button>
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
      <ProfileImage name={bot.name} imageUrl={bot.avatarUrl} className="aspect-[4/5]" />
      <div className="px-5 pb-8">
        <ProfileDetails bot={bot} onReport={onReport} />
      </div>
    </aside>
  );
}
