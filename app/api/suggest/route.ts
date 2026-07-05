// POST /api/suggest — 맥락 반영 추천 답장(내가 다음에 보낼 만한 멘트) 2~3개.
// 매 턴 뒤 클라이언트가 비동기로 호출(응답을 막지 않음). 최근 대화를 반영해 매번 새로 제안.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatComplete } from "@/lib/atlas/llm";
import { assignCrowns } from "@/lib/persona/relationship";

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, bot_profiles(name)")
    .eq("id", sessionId)
    .single();
  if (!session || (session as any).user_id !== gate.userId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: recent } = await admin
    .from("messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(8);
  const msgs = (recent ?? []).reverse();
  if (!msgs.length) return NextResponse.json({ suggestions: [] });

  const name = (session as any).bot_profiles?.name ?? "그녀";
  const convo = msgs.map((m: any) => `${m.role === "user" ? "나" : name}: ${m.content}`).join("\n");
  // 사용자('나')의 말투 감지 → 추천을 같은 말투로 일관되게(반말/존댓말 혼용 방지).
  const userText = msgs.filter((m: any) => m.role === "user").map((m: any) => m.content).join(" ");
  const isFormal = /(요[.!?]?$|요\s|습니다|세요|해요|이에요|예요|십시오|주세요)/.test(userText) && !/(을래|할래|하자|줘$|봐$|어$|야$|니\?|냐\?)/.test(userText);
  const register = isFormal ? "존댓말(끝을 '요'로, 정중하게)" : "반말(끝을 '~어/아/야/자/래' 등으로, 편하게. '네/요/습니다' 같은 존댓말·공손표현 절대 금지)";
  const sys =
    "너는 성인(18+) 롤플레이 챗에서 '내(사용자)가 그녀에게 다음에 보낼 만한 답장'을 추천하는 도우미다. " +
    "아래 대화 맥락에 자연스럽게 이어지는, 내가 보낼 짧은 답장 후보 3개를 제안한다. " +
    `각 8~16자, 서로 다른 결(다정/도발/장난/요구 등)로. 성인 노골/야한 표현도 허용. ` +
    `말투는 반드시 ${register}로 통일하고, 한 문장 안에서 반말과 존댓말을 절대 섞지 마라. ` +
    "반드시 순수 한국어. 출력은 JSON 배열 하나만: [\"..\",\"..\",\"..\"] (다른 텍스트 금지).";
  try {
    const out = await chatComplete(
      [
        { role: "system", content: sys },
        { role: "user", content: `대화:\n${convo}\n\n내 답장 후보 3개(JSON 배열만):` },
      ],
      { temperature: 0.95 }
    );
    const m = out.match(/\[[\s\S]*\]/);
    const arr = m ? JSON.parse(m[0]) : [];
    // 순수 한국어만 통과: 아랍어/한자/일본어/키릴 등 외국어 스크립트·3자+ 라틴 단어가 섞이면 제외(aya 누출 방지).
    const isClean = (s: string) =>
      !/[؀-ۿЀ-ӿ぀-ヿ一-鿿฀-๿ऀ-ॿ]/.test(s) &&
      !/[A-Za-z]{3,}/.test(s);
    const texts = (Array.isArray(arr) ? arr : [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .filter((s) => /[가-힣]/.test(s) && s.length <= 40 && isClean(s))
      .slice(0, 3);
    // 게임 요소: 관계 진전도 상위 후보에 왕관(👑) 배정 → 선택 시 레벨업 포인트 가산.
    return NextResponse.json({ suggestions: assignCrowns(texts) });
  } catch {
    return NextResponse.json({ suggestions: [] }); // best-effort — 실패해도 챗엔 지장 없음
  }
}
