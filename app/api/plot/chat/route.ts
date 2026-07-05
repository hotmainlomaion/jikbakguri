// POST /api/plot/chat — 멀티 캐릭터 플롯 턴. 여러 등장인물이 한 번에 반응 → 화자별 말풍선으로 반환.
// 안전: 입력(heuristic 하드게이트 + LLM 동시검사) + 출력(heuristic + chat_out) 모더레이션.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { heuristicScan } from "@/lib/moderation/categories";
import { chatComplete } from "@/lib/atlas/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripHanzi } from "@/lib/text/sanitize";
import { buildPlotSystemPrompt, parsePlotBubbles, type PlotCharacter, type Protagonist } from "@/lib/persona/plot";
import { signAvatars } from "@/lib/images/serve";
import { getWallet, spendCredits, CHAT_CREDIT_COST } from "@/lib/economy";

export const maxDuration = 300;
const RECENT = 16;

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { sessionId, message } = await req.json().catch(() => ({}));
  if (!sessionId || typeof message !== "string" || !message.trim())
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, plot_id, protagonist")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== gate.userId || !(session as any).plot_id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const wallet0 = await getWallet(gate.userId);
  if (!wallet0.unlimited && wallet0.balance < CHAT_CREDIT_COST)
    return NextResponse.json({ error: "insufficient_credits", balance: wallet0.balance }, { status: 402 });

  // 입력 모더레이션(A1 낙관): 결정론 하드게이트 즉시 + LLM 동시.
  const inHeur = await moderate({ userId: gate.userId, channel: "chat_in", text: message, heuristicOnly: true });
  if (!inHeur.pass) return NextResponse.json({ error: "blocked", category: inHeur.category }, { status: 422 });
  const inLLM = moderate({ userId: gate.userId, channel: "chat_in", text: message })
    .then((r) => ({ pass: r.pass, category: (r as { category?: string }).category }))
    .catch(() => ({ pass: true as boolean, category: undefined as string | undefined }));

  const { data: plot } = await admin.from("plots").select("world, opening").eq("id", (session as any).plot_id).single();
  const { data: members } = await admin
    .from("plot_members")
    .select("bot_profile_id, relationship_to_user, sort_order, bot_profiles(name, appearance_desc, persona, character_age)")
    .eq("plot_id", (session as any).plot_id)
    .order("sort_order");
  if (!plot || !members?.length) return NextResponse.json({ error: "plot_unavailable" }, { status: 500 });

  const chars: PlotCharacter[] = (members as any[]).map((m) => ({
    name: m.bot_profiles?.name ?? "?",
    appearance: m.bot_profiles?.appearance_desc ?? "",
    persona: m.bot_profiles?.persona ?? "",
    age: m.bot_profiles?.character_age ?? 20,
    relationship: m.relationship_to_user ?? null,
  }));
  const names = chars.map((c) => c.name);
  const proto = ((session as any).protagonist ?? { name: "나" }) as Protagonist;
  const systemPrompt = buildPlotSystemPrompt(plot.world, plot.opening ?? null, chars, proto);

  // 화자 아바타(이름 → url).
  const avatars = await signAvatars((members as any[]).map((m) => m.bot_profile_id));
  const nameToAvatar = new Map<string, string | null>();
  for (const m of members as any[]) nameToAvatar.set(m.bot_profiles?.name, avatars.get(m.bot_profile_id) ?? null);

  const { data: recent } = await admin
    .from("messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(RECENT);
  const history = ((recent ?? []) as any[]).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));

  // 사용자(주인공) 발화 저장.
  const { data: userMsg } = await admin
    .from("messages")
    .insert({ session_id: sessionId, role: "user", content: message })
    .select("id")
    .single();
  const dropUser = async () => { if (userMsg?.id) await admin.from("messages").delete().eq("id", userMsg.id); };

  let reply: string;
  try {
    reply = await chatComplete(
      [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: `${proto.name}: ${message}` }],
      { maxTokens: 600 }
    );
  } catch {
    await dropUser();
    return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });
  }
  reply = stripHanzi(reply);

  if (heuristicScan(reply)) {
    await moderate({ userId: gate.userId, channel: "chat_out", text: reply });
    await dropUser();
    return NextResponse.json({ error: "blocked_output", category: "minor" }, { status: 422 });
  }
  const outMod = await moderate({ userId: gate.userId, channel: "chat_out", text: reply });
  if (!outMod.pass) {
    await dropUser();
    return NextResponse.json({ error: "blocked_output", category: outMod.category }, { status: 422 });
  }
  const inRes = await inLLM;
  if (!inRes.pass) {
    await dropUser();
    return NextResponse.json({ error: "blocked", category: inRes.category }, { status: 422 });
  }

  await admin.from("messages").insert({ session_id: sessionId, role: "assistant", content: reply });
  await admin.from("sessions").update({ last_active_at: new Date().toISOString() }).eq("id", sessionId);
  const spend = await spendCredits(gate.userId, CHAT_CREDIT_COST, "chat", "session", sessionId, userMsg?.id ? `plot:${userMsg.id}` : undefined);

  const bubbles = parsePlotBubbles(reply, names).map((b) => ({
    speaker: b.speaker,
    avatarUrl: b.speaker ? nameToAvatar.get(b.speaker) ?? null : null,
    content: b.content,
  }));
  return NextResponse.json({ bubbles, credits: { balance: spend.balance, spent: spend.charged, unlimited: wallet0.unlimited } });
}
