-- ============================================================
-- 0009_top7_engagement.sql — TOP7 참여 기능 토대
--   F39 즐겨찾기: favorites 테이블
--   F12 지속형 감정: sessions.mood / mood_intensity
-- (F09 회상·F32 오프너·F17 변형·F20 셀피는 기존 테이블 재활용 — 신규 스키마 없음)
-- ============================================================

-- ---------- F39 즐겨찾기 ----------
create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_profile_id uuid not null references public.bot_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bot_profile_id)
);
create index if not exists idx_favorites_user on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

-- 본인 즐겨찾기만 접근(방어). 앱 라우트는 service_role로 명시적 소유권 확인 후 조작.
drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- F12 지속형 감정 상태 ----------
-- mood: 감정 상태 키(neutral|flutter|happy|sulky|hurt|jealous), 대화마다 리셋되지 않고 세션에 지속.
-- mood_intensity: 0~100. 챙기면↑ 방치하면 서운함↑. 시스템 프롬프트에 주입되어 이후 턴 말투에 반영.
-- ⚠️ 안전: mood는 말투 연출용일 뿐, 미성년/CSAM 하드리밋(모더레이션)과 완전히 독립.
alter table public.sessions
  add column if not exists mood text not null default 'neutral'
    check (mood in ('neutral','flutter','happy','sulky','hurt','jealous')),
  add column if not exists mood_intensity int not null default 0
    check (mood_intensity >= 0 and mood_intensity <= 100);
