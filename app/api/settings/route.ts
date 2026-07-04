// GET/POST /api/settings — 사용자 선톡 설정(F02). 본인 것만.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

const FREQS = ["off", "sometimes", "often"];
const clampHour = (n: unknown) => Math.max(0, Math.min(23, Math.trunc(Number(n) || 0)));

export async function GET() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_settings")
    .select("proactive_freq, quiet_start, quiet_end")
    .eq("user_id", gate.userId)
    .maybeSingle();
  return NextResponse.json(
    data ?? { proactive_freq: "off", quiet_start: 0, quiet_end: 8 }
  );
}

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const freq = FREQS.includes(body.proactive_freq) ? body.proactive_freq : "off";
  const quiet_start = clampHour(body.quiet_start);
  const quiet_end = clampHour(body.quiet_end);

  const admin = createAdminClient();
  const { error } = await admin.from("user_settings").upsert(
    { user_id: gate.userId, proactive_freq: freq, quiet_start, quiet_end, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ proactive_freq: freq, quiet_start, quiet_end });
}
