// S6. 히스토리 — 과거 세션 재진입.
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export default async function HistoryPage() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) {
    if (gate.reason === "not_verified") redirect("/verify");
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: sessions } = await admin
    .from("sessions")
    .select("id, last_active_at, bot_profiles(name)")
    .eq("user_id", gate.userId)
    .order("last_active_at", { ascending: false });

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6 sm:py-10 lg:pb-10">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold sm:text-2xl">대화 히스토리</h1>
          <Link href="/gallery" className="text-sm text-muted">
            갤러리
          </Link>
        </header>
        <ul className="space-y-2">
          {(sessions ?? []).map((s: any) => (
            <li key={s.id}>
              <Link
                href={`/chat/${s.id}`}
                className="flex min-h-[44px] flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-3 hover:bg-surface2 sm:flex-row sm:items-center sm:justify-between sm:px-4"
              >
                <span>{s.bot_profiles?.name ?? "AI"}</span>
                <span className="text-xs text-muted">
                  {new Date(s.last_active_at).toLocaleString("ko-KR")}
                </span>
              </Link>
            </li>
          ))}
          {(!sessions || sessions.length === 0) && (
            <p className="text-muted">아직 대화가 없습니다.</p>
          )}
        </ul>
      </main>
      <BottomTabBar />
    </>
  );
}
