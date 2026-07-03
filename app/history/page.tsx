// S6. 히스토리 — 과거 세션 재진입.
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">대화 히스토리</h1>
        <Link href="/gallery" className="text-sm text-muted">
          갤러리
        </Link>
      </header>
      <ul className="space-y-2">
        {(sessions ?? []).map((s: any) => (
          <li key={s.id}>
            <Link
              href={`/chat/${s.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface2"
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
  );
}
