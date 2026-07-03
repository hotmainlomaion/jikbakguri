// 운영자 사용자 제재 (정지/차단/복구, 7-F).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED = ["active", "suspended", "banned"];

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !ALLOWED.includes(status))
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("users").update({ status }).eq("id", id);
  return NextResponse.json({ ok: true });
}
