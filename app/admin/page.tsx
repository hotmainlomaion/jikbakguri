// A1. 운영자 콘솔 홈 — 캐릭터 목록(상세 링크) + 신고/사용자/모더레이션 로그.
// 프로필/스토리라인/이미지 편집은 /admin/bots/[id] 상세에서 구분 관리.
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { signAvatars } from "@/lib/images/serve";
import { Avatar as GradAvatar } from "@/components/ui";
import { BotForm, PublishToggle, ReportActions, UserActions } from "./admin-ui";

export default async function AdminPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/login");

  const admin = createAdminClient();
  const [{ data: bots }, { data: scenarios }, { data: imgs }, { data: logs }, { data: reports }, { data: users }] =
    await Promise.all([
      admin.from("bot_profiles").select("*").order("created_at"),
      admin.from("scenarios").select("bot_profile_id").order("created_at"),
      admin.from("character_images").select("bot_profile_id, review_status"),
      admin.from("moderation_logs").select("*").order("created_at", { ascending: false }).limit(50),
      admin.from("reports").select("*").order("created_at", { ascending: false }).limit(50),
      admin.from("users").select("id, email, status, is_adult_verified").limit(100),
    ]);

  const botIds = (bots ?? []).map((b: any) => b.id);
  const avatars = await signAvatars(botIds);

  const scCount = new Map<string, number>();
  for (const s of scenarios ?? []) scCount.set(s.bot_profile_id, (scCount.get(s.bot_profile_id) ?? 0) + 1);
  const imgCount = new Map<string, { total: number; approved: number }>();
  for (const i of imgs ?? []) {
    const c = imgCount.get(i.bot_profile_id) ?? { total: 0, approved: 0 };
    c.total++;
    if (i.review_status === "approved") c.approved++;
    imgCount.set(i.bot_profile_id, c);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-2xl font-semibold">운영자 콘솔</h1>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">캐릭터</h2>
          <BotForm />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(bots ?? []).map((b: any) => {
            const url = avatars.get(b.id);
            const ic = imgCount.get(b.id) ?? { total: 0, approved: 0 };
            return (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <GradAvatar name={b.name} size={56} rounded="rounded-lg" />
                )}
                <Link href={`/admin/bots/${b.id}`} className="min-w-0 flex-1">
                  <div className="font-medium hover:text-primary">{b.name}</div>
                  <div className="text-xs text-muted">
                    {b.character_age}세 · {b.is_published ? "공개" : "비공개"} · 시나리오 {scCount.get(b.id) ?? 0} · 이미지 {ic.approved}/{ic.total}
                  </div>
                  {b.tags?.length ? (
                    <div className="mt-0.5 truncate text-[11px] text-primary">{b.tags.map((t: string) => "#" + t).join(" ")}</div>
                  ) : null}
                </Link>
                <PublishToggle id={b.id} published={b.is_published} />
              </div>
            );
          })}
          {(!bots || bots.length === 0) && <p className="text-muted">캐릭터가 없습니다.</p>}
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
