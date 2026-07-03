-- ============================================================
-- 0004_gallery.sql — 캐릭터 갤러리(태그·대표이미지) + 다중 시나리오
-- 캐릭터 카드(태그·대표컷) 클릭 → 시나리오 선택 → 스토리 안에서 채팅 시작.
-- 대표 이미지는 스키마만 준비(현재 플레이스홀더 렌더). 스토리라인은 시나리오로 다중화.
-- ============================================================

-- ---------- bot_profiles: 태그 + 대표 이미지(준비) ----------
alter table public.bot_profiles
  add column if not exists tags text[] not null default '{}',
  add column if not exists avatar_path text;   -- 운영자 큐레이션 안전 대표컷(현재 미사용, 인증 후 갤러리에서만 노출 예정)

create index if not exists idx_bot_profiles_tags on public.bot_profiles using gin (tags);

-- ---------- scenarios: 캐릭터당 다중 스토리라인 ----------
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  bot_profile_id uuid not null references public.bot_profiles(id) on delete cascade,
  title text not null,
  description text not null,      -- 선택 UI 요약
  scenario text not null,         -- 세계관/상황 (시스템 프롬프트에 주입, 성인 설정)
  greeting text not null,         -- 첫 인사 (오프닝 봇 메시지로 시드)
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_scenarios_bot on public.scenarios (bot_profile_id);

alter table public.scenarios enable row level security;

-- published 시나리오는 인증 사용자 read, 운영자 전체 CRUD.
create policy scenarios_read_published on public.scenarios for select
  using (is_published = true or public.is_admin());
create policy scenarios_admin_all on public.scenarios for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- sessions: 선택 시나리오 핀 ----------
-- 캐논과 동일하게 세션 생성 시 시나리오를 스냅샷 고정 → 운영자 수정에도 진행 대화 불변.
alter table public.sessions
  add column if not exists scenario_id uuid references public.scenarios(id),
  add column if not exists scenario_snapshot jsonb;   -- { title, scenario, greeting }
