-- 0025_plots_multichar.sql — P0: 멀티 캐릭터 "플롯"(제타식 앙상블).
-- 한 세션 = 하나의 플롯(세계관 + N명의 캐릭터). 캐릭터는 기존 bot_profiles 재사용.
create table if not exists public.plots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  world text not null,                          -- 세계관/상황 설정
  opening text,                                 -- 오프닝 지문(첫 씬)
  tags text[] not null default '{}',
  cover_bot_profile_id uuid references public.bot_profiles(id) on delete set null,
  is_published boolean not null default false,
  is_custom boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.plot_members (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references public.plots(id) on delete cascade,
  bot_profile_id uuid not null references public.bot_profiles(id) on delete cascade,
  relationship_to_user text,                    -- 주인공(Guest)과의 관계
  sort_order int not null default 0,
  unique (plot_id, bot_profile_id)
);
create index if not exists plot_members_plot_idx on public.plot_members (plot_id);

-- 세션이 플롯에 속할 수 있다(nullable = 기존 1:1 봇 세션과 공존). + 사용자 주인공(이름/성별/소개).
alter table public.sessions
  add column if not exists plot_id uuid references public.plots(id) on delete set null,
  add column if not exists protagonist jsonb;

-- RLS.
alter table public.plots enable row level security;
drop policy if exists plots_read on public.plots;
create policy plots_read on public.plots
  for select using ((is_published = true and auth.uid() is not null) or created_by = auth.uid());
alter table public.plot_members enable row level security;
drop policy if exists plot_members_read on public.plot_members;
create policy plot_members_read on public.plot_members for select using (true);
