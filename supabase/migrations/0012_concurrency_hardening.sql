-- ============================================================
-- 0012_concurrency_hardening.sql — 감사 미뤄둔 동시성/정합 보완
--   #5  세션 감정/친밀도 lost-update  → bump_session_affect RPC(원자 누적)
--   #11 단계업 중복 알림              → stage_notified_rank(단조) + RPC가 1회만 stage_up
--   #9  선톡 tick 중복/동시성          → sessions.last_proactive_at (원자 클레임)
--   #14 갤러리 배지 N+1                → sessions.last_message_is_proactive (비정규화)
--   #10 조용시간 클라 시각 신뢰         → user_settings.timezone (서버측 판정)
-- ============================================================

alter table public.sessions
  add column if not exists stage_notified_rank int not null default 0,
  add column if not exists last_proactive_at timestamptz,
  add column if not exists last_message_is_proactive boolean not null default false;

alter table public.user_settings
  add column if not exists timezone text not null default 'Asia/Seoul';

-- 단계 매핑(⚠️ lib/persona/relationship.ts STAGES 임계값과 동기화 유지).
create or replace function public.stage_for_intimacy(n int)
returns text language sql immutable as $$
  select case when n >= 90 then 'deep' when n >= 70 then 'lover'
              when n >= 45 then 'crush' when n >= 20 then 'friend' else 'stranger' end;
$$;
create or replace function public.stage_rank(s text)
returns int language sql immutable as $$
  select case s when 'deep' then 4 when 'lover' then 3 when 'crush' then 2 when 'friend' then 1 else 0 end;
$$;

-- 감정/친밀도 원자 갱신(#5) + 단계 재계산 + 단계업 1회 알림(#11).
-- UPDATE의 행 잠금으로 동시 턴을 직렬화 → intimacy 증분 유실 없음. stage_up은 stage_notified_rank가
-- 증가할 때(더 높은 단계 최초 도달)만 true → 경계 진동/병렬에도 중복 알림 없음.
create or replace function public.bump_session_affect(
  p_session uuid, p_mood text, p_mi int, p_delta int
) returns table(intimacy int, stage text, stage_up boolean)
language plpgsql as $$
declare v_new int; v_stage text; v_rank int; v_notified int; v_up boolean;
begin
  -- 테이블 별칭으로 컬럼과 OUT 파라미터(intimacy) 충돌 회피.
  update public.sessions s
     set intimacy = greatest(0, least(100, s.intimacy + p_delta)),
         mood = p_mood, mood_intensity = p_mi
   where s.id = p_session
   returning s.intimacy, s.stage_notified_rank into v_new, v_notified;
  if v_new is null then return; end if; -- 세션 없음
  v_stage := public.stage_for_intimacy(v_new);
  v_rank := public.stage_rank(v_stage);
  v_up := v_rank > coalesce(v_notified, 0);
  update public.sessions s
     set relationship_stage = v_stage,
         stage_notified_rank = greatest(coalesce(s.stage_notified_rank, 0), v_rank)
   where s.id = p_session;
  return query select v_new, v_stage, v_up;
end $$;

-- 선톡 원자 클레임(#9): 간격 충족 시 last_proactive_at를 now로 선점하고 true 반환. 동시 tick 중 1개만 성공.
create or replace function public.claim_proactive(p_session uuid, p_min_interval_s int)
returns boolean language plpgsql as $$
declare v_id uuid;
begin
  update public.sessions
     set last_proactive_at = now()
   where id = p_session
     and (last_proactive_at is null or last_proactive_at < now() - make_interval(secs => p_min_interval_s))
   returning id into v_id;
  return v_id is not null;
end $$;
