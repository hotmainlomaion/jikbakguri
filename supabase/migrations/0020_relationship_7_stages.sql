-- 관계 7단계 세분화(연애 progression): 첫만남/친구/썸/그린라이트/파트너/연인/깊은연인.
-- stage_for_intimacy·stage_rank를 7단계로 갱신하고 기존 세션 단계를 intimacy로 재계산. CHECK 교체.
drop function if exists public.stage_for_intimacy(integer);
drop function if exists public.stage_rank(text);

create function public.stage_for_intimacy(n integer) returns text language sql immutable as $$
  select case
    when n >= 88 then 'soulmate'
    when n >= 72 then 'lover'
    when n >= 55 then 'partner'
    when n >= 40 then 'green_light'
    when n >= 25 then 'crush'
    when n >= 12 then 'friend'
    else 'first_meet'
  end;
$$;

create function public.stage_rank(s text) returns integer language sql immutable as $$
  select case s
    when 'first_meet' then 0
    when 'friend' then 1
    when 'crush' then 2
    when 'green_light' then 3
    when 'partner' then 4
    when 'lover' then 5
    when 'soulmate' then 6
    else 0
  end;
$$;

alter table public.sessions drop constraint if exists sessions_relationship_stage_check;
update public.sessions
   set relationship_stage = public.stage_for_intimacy(coalesce(intimacy, 0)),
       stage_notified_rank = public.stage_rank(public.stage_for_intimacy(coalesce(intimacy, 0)));
alter table public.sessions add constraint sessions_relationship_stage_check
  check (relationship_stage = any (array['first_meet','friend','crush','green_light','partner','lover','soulmate']));
