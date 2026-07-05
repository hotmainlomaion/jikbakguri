// S6. 히스토리("내 채팅") — 과거 세션 재진입.
// 각 대화를 (마지막 생성 이미지 썸네일 → 아바타 → 이니셜) + 관계 단계 + 마지막 대화 미리보기로 리치하게
// 보여줘 사용자가 한눈에 고르게 한다. 삭제 버튼은 클라이언트에서 DELETE /api/session/[id] 호출.
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAvatars } from "@/lib/images/serve";
import { HistoryClient, type HistoryItem } from "./history-client";

export const dynamic = "force-dynamic"; // 삭제/신규 대화 즉시 반영, 서명 URL 만료 회피.

export default async function HistoryPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: sessions } = await admin
    .from("sessions")
    .select("id, last_active_at, intimacy, bot_profile_id, bot_profiles(name)")
    .eq("user_id", gate.userId)
    .order("last_active_at", { ascending: false });

  const list = (sessions ?? []) as any[];
  const sessIds = list.map((s) => s.id);
  const botIds = [...new Set(list.map((s) => s.bot_profile_id).filter(Boolean))];

  // 병렬: 아바타 서명 URL + 세션별 최신 이미지 + 세션별 마지막 메시지.
  const [avatars, thumbBySession, lastMsgBySession] = await Promise.all([
    signAvatars(botIds),
    latestImageThumbs(admin, sessIds),
    lastMessages(admin, sessIds),
  ]);

  const items: HistoryItem[] = list.map((s) => {
    const preview = lastMsgBySession.get(s.id);
    return {
      id: s.id,
      name: s.bot_profiles?.name ?? "AI",
      thumb: thumbBySession.get(s.id) ?? avatars.get(s.bot_profile_id) ?? null,
      hasImage: thumbBySession.has(s.id),
      intimacy: typeof s.intimacy === "number" ? s.intimacy : 0,
      lastMessage: preview?.text ?? null,
      lastRole: preview?.role ?? null,
      lastActive: s.last_active_at,
    };
  });

  return <HistoryClient items={items} />;
}

// 세션별 '마지막 생성 이미지'(만료 전) 1장 → 서명 URL(1시간). 갤러리와 동일 패턴.
async function latestImageThumbs(admin: any, sessIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!sessIds.length) return out;
  const { data: imgs } = await admin
    .from("images")
    .select("session_id, storage_path, created_at, expires_at")
    .in("session_id", sessIds)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const latestPath = new Map<string, string>();
  for (const im of (imgs ?? []) as any[]) if (!latestPath.has(im.session_id)) latestPath.set(im.session_id, im.storage_path);
  const paths = [...latestPath.values()];
  if (!paths.length) return out;
  const { data: signed } = await admin.storage.from("generated-images").createSignedUrls(paths, 3600);
  const pathToUrl = new Map<string, string>();
  for (const s of signed ?? []) if (s.signedUrl) pathToUrl.set(s.path!, s.signedUrl);
  for (const [sid, p] of latestPath) { const u = pathToUrl.get(p); if (u) out.set(sid, u); }
  return out;
}

// 세션별 마지막 메시지(미리보기). MVP 규모에선 in() 후 최신-우선 dedupe로 충분.
async function lastMessages(admin: any, sessIds: string[]): Promise<Map<string, { text: string; role: string }>> {
  const out = new Map<string, { text: string; role: string }>();
  if (!sessIds.length) return out;
  const { data: msgs } = await admin
    .from("messages")
    .select("session_id, role, content, created_at")
    .in("session_id", sessIds)
    .order("created_at", { ascending: false })
    .limit(2000);
  for (const m of (msgs ?? []) as any[]) {
    if (out.has(m.session_id)) continue;
    const text = String(m.content ?? "").replace(/\s+/g, " ").trim();
    if (text) out.set(m.session_id, { text, role: m.role });
  }
  return out;
}
