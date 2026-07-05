// 일반 사용자(비운영자) 테스트 계정 시드 — service_role로 확정 생성 + 성인인증(admin 아님).
// 실행: node --env-file=.env.local scripts/seed-test-user.mjs
// 데모/로컬 전용. 프로덕션에선 제거하거나 비밀번호 교체.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const EMAIL = process.env.TEST_EMAIL ?? "user@jikbakguri.dev";
const PASSWORD = process.env.TEST_PASSWORD ?? "user-1234!";

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const { data: created, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (error) {
  const { data: list } = await admin.auth.admin.listUsers();
  const u = list?.users?.find((x) => x.email === EMAIL);
  if (!u) { console.error("생성/조회 실패:", error.message); process.exit(1); }
  userId = u.id;
  await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
} else {
  userId = created.user.id;
}

// public.users 행 + 성인인증(active). admins에는 넣지 않음(일반 사용자).
await admin.from("users").upsert({ id: userId, email: EMAIL }, { onConflict: "id" });
await admin.from("users").update({ is_adult_verified: true, status: "active" }).eq("id", userId);
await admin.from("age_verifications").insert({ user_id: userId, method: "mobile_auth", provider_ref: "TEST-SEED" });
// admins 미지정 → 일반 사용자. 혹시 남아있으면 제거.
await admin.from("admins").delete().eq("user_id", userId);

console.log("✅ test user ready (non-admin)");
console.log("   email:   ", EMAIL);
console.log("   password:", PASSWORD);
console.log("   userId:  ", userId);
console.log("   flags:   adult_verified=true, admin=false");
