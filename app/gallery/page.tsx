// S4. 봇 갤러리 — published 프로필 카드. 서버단 게이트 강제.
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { StartSessionButton } from "./start-button";

export default async function GalleryPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: bots } = await admin
    .from("bot_profiles")
    .select("id, name, persona, character_age")
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">봇 갤러리</h1>
        <nav className="flex gap-4 text-sm text-muted">
          <a href="/history">히스토리</a>
          <a href="/settings">설정</a>
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(bots ?? []).map((b) => (
          <div key={b.id} className="card flex flex-col">
            <div className="mb-3 aspect-[4/3] rounded-lg bg-surface2" aria-hidden />
            <h2 className="text-lg font-medium">{b.name}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{b.persona}</p>
            <p className="mt-2 text-xs text-muted">성인 캐릭터 · {b.character_age}세</p>
            <StartSessionButton botId={b.id} />
          </div>
        ))}
        {(!bots || bots.length === 0) && (
          <p className="text-muted">아직 공개된 봇이 없습니다.</p>
        )}
      </div>
    </main>
  );
}
