-- ============================================================
-- 0010_relationship_proactive.sql — F10 관계 단계 + F02 능동적 선톡
--   F10: sessions.intimacy(0~100) + relationship_stage(단계 키)
--   F02: user_settings(선톡 빈도·조용시간) + messages.is_proactive(선톡 표식)
-- ⚠️ 안전: 관계 단계·선톡 어느 것도 미성년/CSAM 하드리밋(모더레이션)과 독립.
--    선톡 자동 생성물도 반환 전 출력 모더레이션을 그대로 통과한다.
-- ============================================================

-- ---------- F10 관계 단계 ----------
-- intimacy: 상호작용(주로 감정 신호)으로 누적되는 친밀도. 단계는 이 값으로 결정.
alter table public.sessions
  add column if not exists intimacy int not null default 0
    check (intimacy >= 0 and intimacy <= 100),
  add column if not exists relationship_stage text not null default 'stranger'
    check (relationship_stage in ('stranger','friend','crush','lover','deep'));

-- ---------- F02 능동적 선톡 ----------
-- 선톡 표식: 사용자 발화 없이 캐릭터가 먼저 보낸 메시지(재진입 훅). 배지/집계용.
alter table public.messages
  add column if not exists is_proactive boolean not null default false;

-- 사용자 선톡 설정(본인만). freq: off|sometimes|often. quiet_start/end: 조용시간(로컬 시각, 발송 억제).
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  proactive_freq text not null default 'off'
    check (proactive_freq in ('off','sometimes','often')),
  quiet_start int not null default 0  check (quiet_start >= 0 and quiet_start <= 23),
  quiet_end   int not null default 8  check (quiet_end   >= 0 and quiet_end   <= 23),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists user_settings_own on public.user_settings;
create policy user_settings_own on public.user_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
