// POST /api/plot/create — 사용자가 멀티 캐릭터 플롯을 제작(UGC). 캐스트는 발행 캐릭터 + 본인 커스텀에서 선택.
// 안전: 세계관/오프닝/관계 텍스트 모더레이션(미성년·불법 차단). 캐릭터는 이미 검수된 풀에서만.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { moderate } from "@/lib/moderation";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_PLOTS_PER_USER = 20;
const MAX_MEMBERS = 6;

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim().slice(0, 50);
  const world = String(body.world ?? "").trim().slice(0, 2000);
  const opening = String(body.opening ?? "").trim().slice(0, 1500) || null;
  const tags = Array.isArray(body.tags) ? body.tags.map((t: unknown) => String(t).trim().slice(0, 20)).filter(Boolean).slice(0, 8) : [];
  const members = Array.isArray(body.members) ? body.members.slice(0, MAX_MEMBERS) : [];

  if (!title || !world || members.length < 2)
    return NextResponse.json({ error: "invalid_input", message: "제목·세계관·캐릭터 2명 이상은 필수예요." }, { status: 400 });

  const admin = createAdminClient();

  // 남용 방지 상한.
  const { count } = await admin.from("plots").select("id", { count: "exact", head: true }).eq("is_custom", true).eq("created_by", gate.userId);
  if ((count ?? 0) >= MAX_PLOTS_PER_USER)
    return NextResponse.json({ error: "limit", message: `플롯은 최대 ${MAX_PLOTS_PER_USER}개까지 만들 수 있어요.` }, { status: 429 });

  // 캐스트 검증: 발행 캐릭터 또는 본인 커스텀만 사용 가능.
  const botIds = members.map((m: any) => String(m.botProfileId)).filter(Boolean);
  const { data: allowed } = await admin
    .from("bot_profiles")
    .select("id")
    .in("id", botIds)
    .or(`is_published.eq.true,created_by.eq.${gate.userId}`);
  const allowedSet = new Set((allowed ?? []).map((b: any) => b.id));
  const valid = members.filter((m: any) => allowedSet.has(String(m.botProfileId)));
  if (valid.length < 2)
    return NextResponse.json({ error: "invalid_cast", message: "사용할 수 있는 캐릭터 2명 이상을 선택하세요." }, { status: 400 });

  // 텍스트 모더레이션(미성년·불법 암시 차단).
  const modText = `${title}\n${world}\n${opening ?? ""}\n${valid.map((m: any) => m.relationship ?? "").join("\n")}`;
  const mod = await moderate({ userId: gate.userId, channel: "chat_in", text: modText });
  if (!mod.pass)
    return NextResponse.json({ error: "blocked", category: mod.category, message: "미성년·불법을 암시하는 설정은 만들 수 없습니다." }, { status: 422 });

  // 플롯 생성(UGC 공개).
  const { data: plot, error } = await admin
    .from("plots")
    .insert({
      title, world, opening, tags,
      cover_bot_profile_id: valid[0].botProfileId,
      is_published: true, is_custom: true, created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error || !plot) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  const rows = valid.map((m: any, i: number) => ({
    plot_id: plot.id,
    bot_profile_id: String(m.botProfileId),
    relationship_to_user: String(m.relationship ?? "").trim().slice(0, 300) || null,
    sort_order: i,
  }));
  await admin.from("plot_members").insert(rows);

  return NextResponse.json({ plotId: plot.id });
}
