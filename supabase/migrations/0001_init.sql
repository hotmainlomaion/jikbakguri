-- ============================================================
-- 0001_init.sql — 스키마 + RLS (CLAUDE.md 섹션 5, 7)
-- 성인향 AI 챗 MVP. 안전 제약은 스키마 레벨에서 강제한다.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- users ----------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now(),
  is_adult_verified boolean not null default false,   -- 7-A 통과 여부
  status text not null default 'active'               -- active | suspended | banned
    check (status in ('active','suspended','banned'))
);

-- ---------- age_verifications ----------
-- 개인정보 최소화(7-D): 결과와 인증기관 참조값만. 신분증 원본/주민번호 저장 금지.
create table public.age_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  method text not null check (method in ('mobile_auth','ipin')),
  verified_at timestamptz not null default now(),
  provider_ref text                                   -- 트랜잭션 참조값(식별정보 원본 아님)
);

-- ---------- bot_profiles (운영자 큐레이션 전용) ----------
create table public.bot_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  persona text not null,
  appearance_desc text not null,      -- 이미지 프롬프트 베이스
  system_prompt text not null,
  character_age int not null check (character_age >= 18),  -- 7-C: 미성년 캐릭터 원천 차단
  is_published boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ---------- sessions ----------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bot_profile_id uuid not null references public.bot_profiles(id),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- ---------- messages ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------- images ----------
create table public.images (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  prompt_hash text not null,          -- 원문 대신 해시(7-D 프라이버시)
  storage_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz              -- 만료 정책(7-D)
);

-- ---------- moderation_logs (감사·법적 대응, 7-F) ----------
create table public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  channel text not null check (channel in ('chat_in','chat_out','image_in','image_out')),
  verdict text not null check (verdict in ('pass','blocked')),
  reason text,                        -- 차단 사유 카테고리
  created_at timestamptz not null default now()
);

-- ---------- reports (신고, S7 / 섹션 6) ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.users(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved')),
  created_at timestamptz not null default now()
);

create index on public.sessions (user_id, last_active_at desc);
create index on public.messages (session_id, created_at);
create index on public.images (session_id, created_at);
create index on public.moderation_logs (user_id, created_at desc);

-- ============================================================
-- 운영자 판별 헬퍼 (SECURITY DEFINER: RLS 재귀 방지)
-- ============================================================
create table public.admins (
  user_id uuid primary key references public.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- ============================================================
-- RLS (섹션 5: 사용자는 본인 데이터만, 봇은 published만 read)
-- ============================================================
alter table public.users            enable row level security;
alter table public.age_verifications enable row level security;
alter table public.bot_profiles     enable row level security;
alter table public.sessions         enable row level security;
alter table public.messages         enable row level security;
alter table public.images           enable row level security;
alter table public.moderation_logs  enable row level security;
alter table public.reports          enable row level security;
alter table public.admins           enable row level security;

-- users: 본인 행 read/update, 운영자 전체
create policy users_self_select on public.users for select
  using (id = auth.uid() or public.is_admin());
create policy users_self_update on public.users for update
  using (id = auth.uid());

-- age_verifications: 본인만
create policy av_self on public.age_verifications for select
  using (user_id = auth.uid() or public.is_admin());

-- bot_profiles: 누구나 published read, 운영자 전체 CRUD
create policy bots_read_published on public.bot_profiles for select
  using (is_published = true or public.is_admin());
create policy bots_admin_all on public.bot_profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- sessions: 본인만
create policy sessions_self on public.sessions for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());

-- messages: 본인 세션의 메시지만 (서버 라우트는 service role로 insert)
create policy messages_self on public.messages for select
  using (
    exists (select 1 from public.sessions s
            where s.id = session_id and (s.user_id = auth.uid() or public.is_admin()))
  );

-- images: 본인 세션만
create policy images_self on public.images for select
  using (
    exists (select 1 from public.sessions s
            where s.id = session_id and (s.user_id = auth.uid() or public.is_admin()))
  );

-- moderation_logs: 운영자만 조회(7-F). insert는 service role.
create policy modlogs_admin on public.moderation_logs for select
  using (public.is_admin());

-- reports: 본인 신고 생성/조회, 운영자 전체
create policy reports_insert on public.reports for insert
  with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update
  using (public.is_admin());

-- admins: 운영자만 조회
create policy admins_read on public.admins for select using (public.is_admin());

-- ============================================================
-- 신규 auth.users → public.users 미러링
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
