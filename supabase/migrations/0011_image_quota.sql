-- ============================================================
-- 0011_image_quota.sql — 일일 이미지 쿼터 원자 예약(감사 #3·#4)
-- 기존 checkDailyImageLimit은 images(성공분) 행 수만 세어, 차단/실패 프롬프트로는
-- 무제한 생성 가능(비용 가드 우회) + read-then-act TOCTOU로 동시요청 상한 초과.
-- → 시도(attempt) 단위로 세는 원자 카운터로 교체. 차단/실패도 쿼터를 소모.
-- ============================================================
create table if not exists public.image_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used int not null default 0,
  primary key (user_id, day)
);

alter table public.image_quota enable row level security;
drop policy if exists image_quota_own on public.image_quota;
create policy image_quota_own on public.image_quota for select
  using (user_id = auth.uid());

-- 원자 예약: 오늘 카운터를 조건부 증가. 한도 미만이면 +1 후 true, 한도 도달이면 false.
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE 로 read-modify-write 없이 원자 처리(TOCTOU 제거).
create or replace function public.consume_image_quota(p_user uuid, p_limit int)
returns boolean
language plpgsql
as $$
declare v_used int;
begin
  insert into public.image_quota (user_id, day, used)
  values (p_user, current_date, 1)
  on conflict (user_id, day) do update
    set used = public.image_quota.used + 1
    where public.image_quota.used < p_limit
  returning used into v_used;
  return v_used is not null;  -- 한도 도달 시 DO UPDATE WHERE 실패 → 반환행 없음 → false
end;
$$;
