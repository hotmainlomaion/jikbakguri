// GET/POST /api/settings — 사용자 선톡 설정(F02). 본인 것만.
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth/gate";
import { createAdminClient } from "@/lib/supabase/admin";

const FREQS = ["off", "sometimes", "often"];
const clampHour = (n: unknown) => Math.max(0, Math.min(23, Math.trunc(Number(n) || 0)));
// IANA tz 최소 검증(대륙/도시). 조용시간 서버 판정에 쓰이므로 형식만 확인, 아니면 기본값.
const cleanTz = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z]+\/[A-Za-z_]+/.test(v) ? v : "Asia/Seoul";

export async function GET() {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_settings")
    .select("proactive_freq, quiet_start, quiet_end, timezone")
    .eq("user_id", gate.userId)
    .maybeSingle();
  return NextResponse.json(
    data ?? { proactive_freq: "off", quiet_start: 0, quiet_end: 8, timezone: "Asia/Seoul" }
  );
}

export async function POST(req: Request) {
  const gate = await requireVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const freq = FREQS.includes(body.proactive_freq) ? body.proactive_freq : "off";
  const quiet_start = clampHour(body.quiet_start);
  const quiet_end = clampHour(body.quiet_end);
  const timezone = cleanTz(body.timezone);

  const admin = createAdminClient();
  const { error } = await admin.from("user_settings").upsert(
    { user_id: gate.userId, proactive_freq: freq, quiet_start, quiet_end, timezone, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ proactive_freq: freq, quiet_start, quiet_end, timezone });
}
