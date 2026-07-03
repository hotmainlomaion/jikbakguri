// A1. 운영자 콘솔 — 봇 CRUD, 모더레이션 로그, 신고 처리, 사용자 제재.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { BotForm, PublishToggle, ReportActions, UserActions } from "./admin-ui";

export default async function AdminPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/login");

  const admin = createAdminClient();
  const [{ data: bots }, { data: logs }, { data: reports }, { data: users }] =
    await Promise.all([
      admin.from("bot_profiles").select("*").order("created_at"),
      admin.from("moderation_logs").select("*").order("created_at", { ascending: false }).limit(50),
      admin.from("reports").select("*").order("created_at", { ascending: false }).limit(50),
      admin.from("users").select("id, email, status, is_adult_verified").limit(100),
    ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold">운영자 콘솔</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">봇 프로필</h2>
        <BotForm />
        <div className="mt-4 space-y-2">
          {(bots ?? []).map((b: any) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
              <div>
                <span className="font-medium">{b.name}</span>{" "}
                <span className="text-xs text-muted">· {b.character_age}세 · {b.is_published ? "공개" : "비공개"}</span>
              </div>
              <PublishToggle id={b.id} published={b.is_published} />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">신고 ({(reports ?? []).length})</h2>
        <div className="space-y-2">
          {(reports ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm">
              <span className="truncate">{r.reason} <span className="text-xs text-muted">· {r.status}</span></span>
              <ReportActions id={r.id} />
            </div>
          ))}
          {(!reports || reports.length === 0) && <p className="text-muted">신고 없음</p>}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">사용자</h2>
        <div className="space-y-2">
          {(users ?? []).map((u: any) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm">
              <span>{u.email} <span className="text-xs text-muted">· {u.status}{u.is_adult_verified ? " · 인증" : ""}</span></span>
              <UserActions id={u.id} status={u.status} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">모더레이션 로그 (감사)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr><th className="py-1 pr-4">시각</th><th className="pr-4">채널</th><th className="pr-4">판정</th><th>사유</th></tr>
            </thead>
            <tbody>
              {(logs ?? []).map((l: any) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="py-1 pr-4">{new Date(l.created_at).toLocaleString("ko-KR")}</td>
                  <td className="pr-4">{l.channel}</td>
                  <td className={"pr-4 " + (l.verdict === "blocked" ? "text-red-400" : "text-muted")}>{l.verdict}</td>
                  <td>{l.reason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
