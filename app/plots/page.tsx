// 플롯 목록(발견) — 모바일-온리. 발행된 멀티 캐릭터 플롯 카드.
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAvatars } from "@/lib/images/serve";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export const dynamic = "force-dynamic";

export default async function PlotsPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }
  const admin = createAdminClient();
  const { data: plots } = await admin
    .from("plots")
    .select("id, title, world, tags, cover_bot_profile_id, plot_members(bot_profile_id)")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(40);

  // 커버 아바타 = cover 캐릭터 또는 첫 멤버.
  const rows = (plots ?? []) as any[];
  const coverBotIds = rows.map((p) => p.cover_bot_profile_id ?? p.plot_members?.[0]?.bot_profile_id).filter(Boolean);
  const avatars = await signAvatars(coverBotIds);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[480px] bg-bg">
      <main className="px-4 py-5 pb-24">
        <h1 className="mb-4 text-xl font-semibold">플롯 · 멀티 캐릭터 스토리</h1>
        {rows.length === 0 ? (
          <p className="mt-16 text-center text-muted">아직 공개된 플롯이 없어요.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((p) => {
              const coverBot = p.cover_bot_profile_id ?? p.plot_members?.[0]?.bot_profile_id;
              const cover = coverBot ? avatars.get(coverBot) ?? null : null;
              const castN = p.plot_members?.length ?? 0;
              return (
                <li key={p.id}>
                  <Link href={`/plot/${p.id}`} className="flex gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface2">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface2">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-subtle">🎭</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.title}</span>
                        <span className="shrink-0 rounded-full border border-border bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">등장 {castN}명</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{p.world}</p>
                      {(p.tags ?? []).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(p.tags as string[]).slice(0, 4).map((t) => (
                            <span key={t} className="text-[10px] text-primary/80">#{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <BottomTabBar />
    </div>
  );
}
