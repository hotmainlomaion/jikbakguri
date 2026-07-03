// 매직링크 콜백 → 세션 교환 후 성인 인증 상태에 따라 분기.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const supabase = createClient();

  if (code) await supabase.auth.exchangeCodeForSession(code);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("users")
    .select("is_adult_verified")
    .eq("id", user.id)
    .single();

  const dest = row?.is_adult_verified ? "/gallery" : "/verify";
  return NextResponse.redirect(new URL(dest, url));
}
