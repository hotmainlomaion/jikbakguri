// GET/POST /api/cron/purge — 만료 이미지 정리(감사 #2, 7-D 만료·최소보관).
// 삭제 순서: 스토리지 객체 먼저 → DB 행 나중(순서 뒤집으면 storage_path 참조가 사라져 영구 고아).
// 보호: CRON_SECRET 헤더 필요(공개 호출 방지). Vercel Cron / pg_cron+pg_net 로 주기 호출.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "generated-images";
const PAGE = 500;

async function purge() {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  let removed = 0;

  // 만료분을 배치로: 경로 수집 → 스토리지 remove(성공 시) → 해당 행 delete. 반복.
  for (;;) {
    const { data, error } = await admin
      .from("images")
      .select("id, storage_path")
      .lt("expires_at", nowIso)
      .limit(PAGE);
    if (error) return { error: "select_failed", removed };
    const batch = (data ?? []) as { id: string; storage_path: string }[];
    if (!batch.length) break;

    const paths = batch.map((b) => b.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: sErr } = await admin.storage.from(BUCKET).remove(paths);
      if (sErr) return { error: "storage_remove_failed", removed }; // DB 행은 남겨 다음 회차 재시도
    }
    const { error: dErr } = await admin.from("images").delete().in("id", batch.map((b) => b.id));
    if (dErr) return { error: "db_delete_failed", removed };
    removed += batch.length;
    if (batch.length < PAGE) break;
  }
  return { removed };
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 미설정 시 비활성(공개 노출 방지)
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await purge());
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await purge());
}
