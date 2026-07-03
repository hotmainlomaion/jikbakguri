// service role 클라이언트. RLS 우회 — 서버 라우트에서만 사용. 절대 클라이언트 노출 금지.
import { createClient as createSbClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
