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
  IcChart,
  IcRefresh,
  IcPlus,
  IcSpark,
  IcVoice,
} from "@/components/icons";
import { ProfileImage, ProfileDetails, type ProfileBot } from "@/components/profile-panel";
import { MobileProfileSheet } from "@/components/mobile-profile-sheet";
import { CreditBadge, type WalletClient } from "@/components/credit-badge";

type Msg = { id?: string; role: "user" | "assistant"; content: string; imageUrl?: string; selfie?: boolean; kind?: string; pending?: boolean };
type Bot = ProfileBot;
type Hist = { id: string; name: string; lastActive: string; avatar?: string | null };
type Mood = { state: string; intensity: number; label: string; emoji: string };
type Relationship = { intimacy: number; stage: string; label: string; emoji: string; progress: number; level: number };
type Suggestion = { text: string; crowns: number };
type Recall = { daysSince: number; firstMetLabel: string; messageCount: number; imageUrl: string | null };

const BLOCK_MSG: Record<string, string> = {
  blocked: "입력이 안전 정책에 의해 차단되었습니다.",
  blocked_output: "생성된 응답이 안전 정책에 의해 차단되었습니다.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  daily_limit: "오늘 이미지 생성 한도를 초과했습니다.",
  insufficient_credits: "크레딧이 부족해요. 상단 잔액을 눌러 충전해 주세요.",
  ai_unavailable: "AI 서비스에 일시적으로 연결할 수 없습니다.",
};

// F32 오프너 빠른 답장 칩(성인 톤, 노골 아님 — 탭하면 그대로 전송).

export function ChatUI({
  sessionId,
  bot,
  scenarioTitle,
  scenarioIntro,
  initial,
  initialImage,
  mood: initialMood,
  relationship: initialRel,
  recall,
  history,
  wallet: initialWallet,
}: {
  sessionId: string;
  bot: Bot;
  scenarioTitle: string | null;
  scenarioIntro?: { title: string; detail: string | null; tags: string[]; intensity: number } | null;
  initial: Msg[];
  initialImage?: string | null;
  mood: Mood;
  relationship: Relationship;
  recall: Recall | null;
  history: Hist[];
  wallet: WalletClient;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "chat" | "image">(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 재진입 시 마지막 생성 이미지를 히어로로 복원(없으면 대표컷 폴백).
  const [image, setImage] = useState<string | null>(initialImage ?? null);
  const [mood, setMood] = useState<Mood>(initialMood);
  const [rel, setRel] = useState<Relationship>(initialRel);
  const [wallet, setWallet] = useState<WalletClient>(initialWallet);
  const [stageUp, setStageUp] = useState<string | null>(null);
  const [tab, setTab] = useState<"daily" | "flutter">("daily");
  const [sheet, setSheet] = useState<null | "profile">(null);
  const [studio, setStudio] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]); // 맥락 반영 추천 답장(왕관 게임)
  const [pointFlash, setPointFlash] = useState<string | null>(null); // 게임: 이번 턴 획득 포인트 '+N' 플래시
  const [pendingSelfie, setPendingSelfie] = useState<string | null>(null);
  const [safeView, setSafeView] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [recallShown, setRecallShown] = useState(!!recall);
  const [streaming, setStreaming] = useState(false); // 스트리밍 중(타이핑 인디케이터 대신 라이브 말풍선)
  const [imgPending, setImgPending] = useState(false); // 이미지 생성 진행 중(논블로킹 — 채팅은 계속 가능)
  // 컨테이너 높이를 '실제 보이는 영역'에 정확히 맞추기 위한 뷰포트 상태(아래 effect가 구동).
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, image]);

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

  // 모바일 뷰포트 정합(iOS Safari·인앱브라우저·소프트 키보드).
  // 100dvh는 (1)소프트 키보드를 반영하지 못하고 (2)하단 툴바 계산이 브라우저마다 어긋나
  // 키보드가 없는데도 하단이 잘리거나 검은 여백이 생긴다. visualViewport.height는 툴바·키보드를
  // 모두 제외한 '실제 보이는 높이'라, 이걸로 컨테이너 높이를 직접 구동한다. 키보드가 뜨며 페이지가
  // 위로 밀리면 offsetTop만큼 translateY로 되돌려(고정 컨테이너) 항상 가시영역에 딱 맞춘다.
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () =>
      setViewport(vv ? { height: vv.height, top: vv.offsetTop } : { height: window.innerHeight, top: 0 });
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  function err(code?: string) {
    setNotice(BLOCK_MSG[code ?? ""] ?? "요청을 처리하지 못했습니다.");
  }

  // 맥락 반영 추천 답장 갱신(best-effort, 비동기 — 응답을 막지 않음).
  async function fetchSuggestions() {
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.suggestions))
        setSuggestions(
          data.suggestions
            .map((s: any) => (typeof s === "string" ? { text: s, crowns: 0 } : { text: String(s?.text ?? ""), crowns: Number(s?.crowns) || 0 }))
            .filter((s: Suggestion) => s.text)
        );
    } catch {}
  }
  // 진입 시 1회: 현재까지 대화(오프닝 포함)를 반영한 추천 로드.
  useEffect(() => {
    fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F32: 오프닝 상태 = 봇 인사만 있고 아직 사용자 발화 없음.

  // 응답 완료 후 부가정보(감정·관계·크레딧·셀피) 반영 — 스트리밍/비스트리밍 공용.
  function applyMeta(data: any, crowns: number) {
    if (data.mood) setMood((prev) => ({ ...prev, ...data.mood })); // F12 감정
    if (data.relationship) {
      const r = data.relationship; // F10 관계 단계/친밀도 + 레벨업/포인트 플래시
      setRel((prev) => ({
        ...prev,
        intimacy: r.intimacy,
        stage: r.stage,
        label: r.label,
        emoji: r.emoji,
        progress: r.progress ?? prev.progress,
        level: r.level ?? prev.level,
      }));
      if (r.gained > 0) {
        setPointFlash(`+${r.gained}${crowns > 0 ? " 👑" : ""}`);
        setTimeout(() => setPointFlash(null), 1400);
      }
      if (r.stageUp) {
        setStageUp(`🎉 Lv.${r.level} «${r.label}» ${r.emoji} 로 관계 레벨업!`);
        setTimeout(() => setStageUp(null), 5000);
      }
    }
    if (data.credits && !data.credits.unlimited && data.credits.balance >= 0)
      setWallet((w) => ({ ...w, balance: data.credits.balance }));
    if (data.selfie) setPendingSelfie(data.selfie); // F20 셀피 확인 칩
  }

  // 스트리밍 채팅: NDJSON 이벤트(scene/token/done/blocked)를 읽어 라이브 말풍선에 실시간 누적.
  async function sendText(text: string, crowns = 0) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setNotice(null);
    setMsgs((m) => [...m, { role: "user", content: t }]);
    setSuggestions([]); // 이전 추천 즉시 숨김(응답 후 새 맥락으로 갱신)
    setBusy("chat");
    const streamId = `stream-${Date.now()}`; // 라이브 말풍선 안정 참조
    let streamStarted = false;
    const removeStream = () => setMsgs((m) => m.filter((x) => x.id !== streamId));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message: t, crowns }),
      });
      if (!res.ok || !res.body) {
        setBusy(null);
        const d = await res.json().catch(() => ({}));
        return err(d.error);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalData: any = null;
      let blockedErr: string | undefined;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: any;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "scene" && ev.sceneCard?.content) {
            setMsgs((m) => [...m, { id: ev.sceneCard.id ?? undefined, role: "assistant", content: ev.sceneCard.content, kind: "scene" }]);
          } else if (ev.type === "token") {
            streamStarted = true;
            setStreaming(true);
            setMsgs((m) => {
              const i = m.findIndex((x) => x.id === streamId);
              if (i < 0) return [...m, { id: streamId, role: "assistant", content: ev.delta }];
              const c = m.slice();
              c[i] = { ...c[i], content: c[i].content + ev.delta };
              return c;
            });
          } else if (ev.type === "done") {
            finalData = ev;
          } else if (ev.type === "blocked" || ev.type === "error") {
            blockedErr = ev.error;
          }
        }
      }
      setStreaming(false);
      setBusy(null);
      if (blockedErr) {
        removeStream(); // 표시된 스트리밍분 회수(차단/에러)
        return err(blockedErr);
      }
      if (finalData) {
        // 라이브 말풍선을 최종 reply(한자정제본)로 확정. 토큰이 하나도 안 왔으면 새로 추가.
        if (finalData.reply)
          setMsgs((m) => {
            const i = m.findIndex((x) => x.id === streamId);
            if (i < 0) return streamStarted ? m : [...m, { id: streamId, role: "assistant", content: finalData.reply }];
            const c = m.slice();
            c[i] = { ...c[i], content: finalData.reply };
            return c;
          });
        applyMeta(finalData, crowns);
      }
      fetchSuggestions(); // 새 맥락 기반 추천 답장 갱신
    } catch {
      setStreaming(false);
      setBusy(null);
      removeStream();
      err();
    }
  }
  const send = () => sendText(input);

  // 이미지 생성(논블로킹): "그리는 중" 플레이스홀더를 즉시 넣고 백그라운드로 생성 → 준비되면 그 자리에 채운다.
  // 생성 동안 채팅은 계속 가능(busy로 막지 않음). 동시 이미지는 imgPending으로 1개만.
  async function runImage(prompt: string, opts?: { asSelfie?: boolean }) {
    if (imgPending || !prompt.trim()) return;
    setNotice(null);
    const phId = `imggen-${Date.now()}`;
    setImgPending(true);
    setMsgs((m) => [...m, { id: phId, role: "assistant", content: "", pending: true, selfie: opts?.asSelfie }]);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsgs((m) => m.filter((x) => x.id !== phId)); // 플레이스홀더 제거
        if (opts?.asSelfie && data.error === "daily_limit")
          setNotice("오늘은 사진을 더 받을 수 없어요. 내일 다시 받아볼 수 있어요.");
        else err(data.error);
        return;
      }
      setImage(data.url); // 히어로 갱신
      setMsgs((m) => m.map((x) => (x.id === phId ? { ...x, pending: false, imageUrl: data.url } : x)));
      if (data.credits && !data.credits.unlimited && data.credits.balance >= 0)
        setWallet((w) => ({ ...w, balance: data.credits.balance }));
    } catch {
      setMsgs((m) => m.filter((x) => x.id !== phId));
      err();
    } finally {
      setImgPending(false);
    }
  }

  // 지금 장면 이미지 — 최근 대화를 반영해 생성(논블로킹). 캐릭터 일관성은 서버가 identity+seed로 유지.
  async function runSceneImage() {
    if (imgPending) return;
    setNotice(null);
    const phId = `imggen-${Date.now()}`;
    setImgPending(true);
    setMsgs((m) => [...m, { id: phId, role: "assistant", content: "", pending: true }]);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, mode: "scene" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsgs((m) => m.filter((x) => x.id !== phId));
        if (data.error === "no_context") setNotice("대화를 조금 더 나눈 뒤 장면을 그릴 수 있어요.");
        else err(data.error);
        return;
      }
      setImage(data.url);
      setMsgs((m) => m.map((x) => (x.id === phId ? { ...x, pending: false, imageUrl: data.url } : x)));
      if (data.credits && !data.credits.unlimited && data.credits.balance >= 0)
        setWallet((w) => ({ ...w, balance: data.credits.balance }));
    } catch {
      setMsgs((m) => m.filter((x) => x.id !== phId));
      err();
    } finally {
      setImgPending(false);
    }
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
      className="fixed inset-x-0 top-0 flex overflow-hidden bg-bg"
      style={
        viewport
          ? { height: viewport.height, transform: viewport.top ? `translateY(${viewport.top}px)` : undefined }
          : { height: "100dvh" }
      }
    >
      <IconRail />
      <HistoryPanel history={history} active={sessionId} />

      {/* 중앙: 헤더 + [씬 이미지 | 메시지] */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-3 pt-safe py-3 sm:px-4">
          <Link href="/gallery" className="-m-2 p-2 text-muted hover:text-text">
            <IcBack />
          </Link>
          <Avatar name={bot.name} size={32} src={bot.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-text">{bot.name}</p>
            {scenarioTitle && <p className="truncate text-[11px] text-subtle">{scenarioTitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* F10 관계 단계 배지 + 친밀도 게이지 */}
            <RelationshipBadge rel={rel} flash={pointFlash} />
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
            <CreditBadge wallet={wallet} onWallet={setWallet} />
            {/* 모바일: 프로필 시트 열기 */}
            <button
              onClick={() => setSheet("profile")}
              className="-m-1 rounded-full p-1 text-muted hover:text-text lg:hidden"
              aria-label="프로필"
            >
              <Avatar name={bot.name} size={28} src={bot.avatarUrl} />
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

          {/* 메시지 + 입력. min-h-0 필수: 없으면 내부 메시지 영역이 콘텐츠만큼 늘어나
              고정 컨테이너의 overflow-hidden에 잘려 스크롤이 죽는다(모바일 짤림 버그). */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5">
              {/* #4 시나리오 인트로 카드 — 첫 AI 메시지 앞에 선택 시나리오 소개 */}
              {scenarioIntro && (
                <div className="mx-auto max-w-md rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-surface2 p-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">시나리오</span>
                    <span className="text-sm font-bold text-text">{scenarioIntro.title}</span>
                    <span className="text-xs text-danger">{"🔥".repeat(Math.max(1, Math.min(3, scenarioIntro.intensity)))}</span>
                  </div>
                  {scenarioIntro.detail && (
                    <p className="text-[13px] leading-relaxed text-muted">{scenarioIntro.detail}</p>
                  )}
                  {!!scenarioIntro.tags?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {scenarioIntro.tags.slice(0, 5).map((t) => (
                        <span key={t} className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* F09 오늘의 회상 카드 */}
              {recall && recallShown && (
                <RecallCard
                  recall={recall}
                  botName={bot.name}
                  botAvatar={bot.avatarUrl}
                  safeView={safeView}
                  onClose={() => setRecallShown(false)}
                />
              )}
              {msgs.map((m, i) => (
                <MessageRow
                  key={m.id ?? i}
                  msg={m}
                  botName={bot.name}
                  botAvatar={bot.avatarUrl}
                  safeView={safeView}
                  peek={peekId === String(i)}
                  onPeekStart={() => safeView && m.imageUrl && setPeekId(String(i))}
                  onPeekEnd={() => setPeekId(null)}
                />
              ))}
              {busy && !streaming && (
                <div className="flex items-center gap-2">
                  <Avatar name={bot.name} size={28} src={bot.avatarUrl} />
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

            {/* F20/#7 셀피 확인 칩 — 사진 요청 감지 시 탭해야만 생성(자동 소모 방지) */}
            {pendingSelfie && !busy && (
              <div className="flex items-center gap-2 px-3 pb-1 sm:px-5">
                <button
                  onClick={() => {
                    const p = pendingSelfie;
                    setPendingSelfie(null);
                    runImage(p, { asSelfie: true });
                  }}
                  className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  📷 {bot.name} 셀카 받기
                </button>
                <button
                  onClick={() => setPendingSelfie(null)}
                  className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface3"
                >
                  나중에
                </button>
              </div>
            )}

            {/* 맥락 반영 추천 답장 — 왕관(👑) 답장은 레벨업 포인트를 더 줌(게임 요소) */}
            {suggestions.length > 0 && !busy && (
              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:px-5">
                <span className="shrink-0 text-[11px] text-subtle">추천</span>
                {suggestions.map((s, i) => (
                  <button
                    key={s.text + i}
                    onClick={() => sendText(s.text, s.crowns)}
                    title={s.crowns > 0 ? `왕관 ${s.crowns}개 · 레벨업 포인트 +${s.crowns * 4}` : undefined}
                    className={
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs " +
                      (s.crowns > 0
                        ? "border-gold/50 bg-gold/10 text-gold hover:bg-gold/20"
                        : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20")
                    }
                  >
                    {s.crowns > 0 && <span className="mr-1">{"👑".repeat(s.crowns)}</span>}
                    {s.text}
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
                  onClick={runSceneImage}
                  disabled={!!busy || imgPending}
                  title="지금 장면 이미지 — 최근 대화를 반영해 그려요"
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

// F10 관계 레벨 배지(게임화: Lv.N) + 친밀도 게이지 + 획득 포인트 플래시.
function RelationshipBadge({ rel, flash }: { rel: Relationship; flash?: string | null }) {
  return (
    <span
      title={`관계 Lv.${rel.level} ${rel.label} · 친밀도 ${rel.intimacy}/100`}
      className="relative flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs text-muted"
    >
      <span className="text-sm leading-none">{rel.emoji}</span>
      <span className="font-semibold text-gold">Lv.{rel.level}</span>
      <span className="hidden sm:inline">{rel.label}</span>
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-surface3">
        <span
          className="block h-full rounded-full bg-danger transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(6, rel.progress))}%` }}
        />
      </span>
      {flash && (
        <span className="pointer-events-none absolute -top-4 right-1 animate-fadeIn text-[11px] font-bold text-gold">
          {flash}
        </span>
      )}
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
  botAvatar,
  safeView,
  onClose,
}: {
  recall: Recall;
  botName: string;
  botAvatar?: string | null;
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
          <Avatar name={botName} size={56} src={botAvatar} />
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
  botAvatar,
  safeView,
  peek,
  onPeekStart,
  onPeekEnd,
}: {
  msg: Msg;
  botName: string;
  botAvatar?: string | null;
  safeView: boolean;
  peek: boolean;
  onPeekStart: () => void;
  onPeekEnd: () => void;
}) {
  // #3 장면 전환 지문 — 별도의 작은 사각형 카드로 렌더(대사 말풍선과 구분).
  if (msg.kind === "scene") {
    return (
      <div className="my-1 flex justify-center">
        <div className="max-w-[80%] rounded-lg border border-line/60 bg-surface2/60 px-3.5 py-2 text-center text-[12.5px] italic leading-relaxed text-muted">
          <span className="mr-1 not-italic opacity-70">🎬</span>
          {msg.content}
        </div>
      </div>
    );
  }
  // 이미지 생성 중 플레이스홀더(논블로킹): 자리를 잡아두고 준비되면 이 자리에 이미지가 채워진다.
  if (msg.pending) {
    return (
      <div className="flex gap-2">
        <Avatar name={botName} size={28} src={botAvatar} />
        <div className="flex h-40 w-56 max-w-[70%] items-center justify-center rounded-2xl rounded-tl-sm border border-line/60 bg-surface2/60">
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            🎨 그리는 중<span className="animate-pulse">···</span>
          </span>
        </div>
      </div>
    );
  }
  // 이미지 메시지(생성 이미지 / 셀카) 렌더.
  if (msg.imageUrl) {
    const blurred = safeView && !peek;
    return (
      <div className="flex gap-2">
        <Avatar name={botName} size={28} src={botAvatar} />
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
  // 오프닝 배경 지시문: 선행 (…) 한 줄 + 빈 줄 뒤 대사 → 지문은 이탤릭 지문 줄로 분리 렌더.
  const introMatch = msg.content.match(/^\s*(\([^\n]{4,}\))\s*\n+([\s\S]+)$/);
  const intro = introMatch ? introMatch[1] : null;
  const body = introMatch ? introMatch[2].trim() : msg.content;
  return (
    <div className="flex gap-2">
      <Avatar name={botName} size={28} src={botAvatar} />
      <div className="min-w-0">
        <p className="mb-1 text-xs text-subtle">{botName}</p>
        {intro && (
          <p className="mb-1.5 max-w-[85%] text-[13px] italic leading-relaxed text-muted">{intro}</p>
        )}
        <div className="max-w-[80%] break-words rounded-2xl rounded-tl-sm bg-surface2 px-4 py-2.5 text-sm text-text sm:max-w-[85%]">
          {body}
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
      <Link href="/gallery" title="홈" className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-danger text-white">
        <IcHome className="h-5 w-5" />
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
            <Avatar name={h.name} size={38} src={h.avatar} />
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
