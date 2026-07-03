// 데모용 계정 시드 — service_role로 확정 생성(이메일 확인 완료) + 성인인증·운영자 플래그.
// 실행: node --env-file=.env.local scripts/seed-demo-user.mjs
// 데모/로컬 전용. 프로덕션 배포 시 이 계정은 제거하거나 비밀번호를 교체하세요.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const EMAIL = process.env.DEMO_EMAIL ?? "demo@jikbakguri.dev";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-1234!";

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const { data: created, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});

if (error) {
  // 이미 존재 → 조회.
  const { data: list } = await admin.auth.admin.listUsers();
  const u = list?.users?.find((x) => x.email === EMAIL);
  if (!u) {
    console.error("생성 실패 & 조회 실패:", error.message);
    process.exit(1);
  }
  userId = u.id;
  // 비밀번호 재설정(항상 알려진 값 유지).
  await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
} else {
  userId = created.user.id;
}

// public.users 행 보장 + 성인인증.
await admin.from("users").upsert({ id: userId, email: EMAIL }, { onConflict: "id" });
await admin.from("users").update({ is_adult_verified: true, status: "active" }).eq("id", userId);

// 성인 인증 기록(감사 일관성).
await admin.from("age_verifications").insert({ user_id: userId, method: "mobile_auth", provider_ref: "DEMO-SEED" });

// 운영자 지정.
await admin.from("admins").upsert({ user_id: userId }, { onConflict: "user_id" });

console.log("✅ demo user ready");
console.log("   email:   ", EMAIL);
console.log("   password:", PASSWORD);
console.log("   userId:  ", userId);
console.log("   flags:   adult_verified=true, admin=true");
