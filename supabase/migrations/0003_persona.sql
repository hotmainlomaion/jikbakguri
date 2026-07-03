-- ============================================================
-- 0003_persona.sql — 페르소나 일관성(Persona Consistency) 계층
-- 봇 캐논(정체성·말투·경계)을 구조화하고, 세션 수명 동안 고정(snapshot)하며,
-- 세션별 캐릭터 기억을 저장한다. 안전 제약은 스키마/moderation이 계속 강제.
-- ============================================================

-- ---------- bot_profiles: 구조화 캐논 + 버전 ----------
alter table public.bot_profiles
  add column if not exists canon jsonb not null default '{}'::jsonb,
  add column if not exists persona_version int not null default 1;

-- canon 스키마(문서화용, 앱 레이어가 검증):
--   identity  : { name, age(>=18), backstory, relationships }
--   voice     : { register, tics[], language }
--   appearance: text (이미지 프롬프트 베이스)
--   boundaries: text[]  (in-character 경계 — 안전 가드의 추가 방어)
--   canon_facts: text[] (봇이 모순해선 안 되는 불변 사실)
-- 나이 하한은 여전히 character_age 컬럼의 CHECK(>=18)가 원천 강제.
-- canon.identity.age 도 18 미만이면 앱이 거부(core.assertAdultCanon).

-- 기존 시드 행 백필: 평문 필드 → 최소 canon.
update public.bot_profiles
set canon = jsonb_build_object(
      'identity', jsonb_build_object('name', name, 'age', character_age, 'backstory', persona),
      'voice', jsonb_build_object('register', persona, 'tics', '[]'::jsonb, 'language', 'ko'),
      'appearance', appearance_desc,
      'boundaries', to_jsonb(array['성인(18+) 캐릭터로만 행동','미성년 역할·묘사 금지','비동의/착취 묘사 금지']),
      'canon_facts', '[]'::jsonb
    )
where canon = '{}'::jsonb;

-- 캐논 편집 시 버전 자동 증가(진행 중 세션은 snapshot으로 보호됨).
create or replace function public.bump_persona_version()
returns trigger language plpgsql as $$
begin
  if new.canon is distinct from old.canon
     or new.system_prompt is distinct from old.system_prompt
     or new.appearance_desc is distinct from old.appearance_desc then
    new.persona_version := old.persona_version + 1;
  end if;
  return new;
end; $$;

drop trigger if exists trg_bump_persona_version on public.bot_profiles;
create trigger trg_bump_persona_version
  before update on public.bot_profiles
  for each row execute function public.bump_persona_version();

-- ---------- sessions: 캐논 스냅샷 핀 ----------
-- 세션 생성 시점의 캐논을 고정 → 운영자가 프로필을 수정해도 진행 중 대화는 흔들리지 않음.
alter table public.sessions
  add column if not exists persona_version int,
  add column if not exists persona_snapshot jsonb;

-- ---------- character_memory: 세션별 연속성 사실 ----------
-- 대화 중 확립된 사실(예: 사용자 이름/취향, 봇과의 관계 진전)을 저장해 다음 턴에 재주입.
-- 사용자별 비공개(7-D). 입력 moderation을 이미 통과한 메시지에서 파생 + 저장 전 재검사.
create table if not exists public.character_memory (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null default 'fact' check (kind in ('fact','relationship','preference')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_character_memory_session
  on public.character_memory (session_id, created_at desc);

alter table public.character_memory enable row level security;

-- 본인 세션의 기억만 조회. insert/update 는 service role(서버 라우트)로만.
create policy cmem_self on public.character_memory for select
  using (user_id = auth.uid() or public.is_admin());

-- ---------- 프라이버시: 세션의 기억은 세션 cascade로 삭제, 탈퇴 시 user cascade로 삭제 ----------
