// A1 상세 — 캐릭터별 프로필/스토리라인/이미지 구분 관리. 운영자 전용.
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAllForAdmin } from "@/lib/images/serve";
import { PublishToggle } from "../../admin-ui";
import { BotEditForm, ScenarioManager, ImageManager } from "./admin-detail-ui";

const TABS = [
  { key: "profile", label: "프로필" },
  { key: "storyline", label: "스토리라인" },
  { key: "images", label: "이미지 DB" },
];

export default async function BotDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/login");

  const admin = createAdminClient();
  const { data: bot } = await admin.from("bot_profiles").select("*").eq("id", params.id).single();
  if (!bot) notFound();

  const [{ data: scenarios }, images] = await Promise.all([
    admin
      .from("scenarios")
      .select("*")
      .eq("bot_profile_id", params.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    signAllForAdmin(params.id),
  ]);

  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "profile";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin" className="text-sm text-muted hover:text-text">← 목록</Link>
        <h1 className="text-xl font-semibold">{bot.name}</h1>
        <span className="text-xs text-muted">· {bot.character_age}세 · {bot.is_published ? "공개" : "비공개"}</span>
        <div className="ml-auto"><PublishToggle id={bot.id} published={bot.is_published} /></div>
      </div>

      {/* 탭 */}
      <div className="mb-5 flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/bots/${bot.id}?tab=${t.key}`}
            className={
              "-mb-px border-b-2 px-3 py-2 text-sm " +
              (tab === t.key ? "border-primary text-text" : "border-transparent text-muted hover:text-text")
            }
          >
            {t.label}
            {t.key === "storyline" && ` (${(scenarios ?? []).length})`}
            {t.key === "images" && ` (${images.length})`}
          </Link>
        ))}
      </div>

      {tab === "profile" && <BotEditForm bot={bot} />}
      {tab === "storyline" && <ScenarioManager botId={bot.id} scenarios={scenarios ?? []} />}
      {tab === "images" && <ImageManager botId={bot.id} images={images} />}
    </main>
  );
}
