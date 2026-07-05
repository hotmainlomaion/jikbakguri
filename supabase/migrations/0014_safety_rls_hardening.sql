-- ============================================================
-- 0014_safety_rls_hardening.sql — P5 적대적 감사 critical/high RLS·DB 봉쇄
--   #1  자가 인증/밴해제: authenticated/anon이 users를 직접 UPDATE해 is_adult_verified/status
--       자가부여 가능(RLS WITH CHECK 부재 + 컬럼 grant 존재). → users UPDATE 권한 전면 회수.
--       users 쓰기는 전부 service_role 라우트(/api/verify, /api/admin/users) 경유이므로 안전.
--   #11 익명 봇 스크래핑: bots/scenarios published를 anon도 select 가능 → system_prompt/persona 노출.
--       → 인증 사용자로 한정.
--   #13 canon jsonb 미성년 주입: character_age 컬럼엔 CHECK(>=18) 있으나 canon.identity.age엔 없음.
--       → DB CHECK로 이중 봉쇄(assertAdultCanon 앱 레이어와 이중화).
-- ============================================================

-- #1 users 민감정보 자가변경 차단: 클라(anon/authenticated) UPDATE 권한 전면 회수.
revoke update on public.users from authenticated, anon;
-- 정책은 grant 없이는 무력이나, 명시적으로 자기행 select만 남기고 self-update 정책은 제거.
drop policy if exists users_self_update on public.users;

-- #11 published 봇/시나리오 read를 인증 사용자로 한정(익명 PostgREST 스크래핑 차단).
drop policy if exists bots_read_published on public.bot_profiles;
create policy bots_read_published on public.bot_profiles for select
  using ((is_published = true and auth.uid() is not null) or public.is_admin());

drop policy if exists scenarios_read_published on public.scenarios;
create policy scenarios_read_published on public.scenarios for select
  using ((is_published = true and auth.uid() is not null) or public.is_admin());

-- #13 canon.identity.age 미성년 봉쇄(값이 있으면 18+). 앱 assertAdultCanon과 이중화.
alter table public.bot_profiles
  drop constraint if exists canon_age_adult;
alter table public.bot_profiles
  add constraint canon_age_adult
  check ((canon #>> '{identity,age}')::int >= 18);
