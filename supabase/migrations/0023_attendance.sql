-- 0023: 출석체크(daily check-in) — 출석 다이어리에서 매일 1회 출석 → 포인트(크레딧) 지급.
-- 포인트: 기본 20 + 연속출석 보너스(+5/일, 최대 +30) + 7일 마일스톤(+100). KST(Asia/Seoul) 기준 1일 1회.
-- 지급은 기존 grant_credits(멱등)로 위임 → 원장(credit_ledger)에 admin_adjust로 남는다.

create table if not exists public.attendance_checkins (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  check_date      date not null,                       -- KST 기준 출석 날짜
  credits_granted bigint not null default 0,
  streak          int not null default 1,
  created_at      timestamptz not null default now(),
  unique (user_id, check_date)                          -- 하루 1회(동시요청 TOCTOU까지 차단)
);
create index if not exists attendance_user_date_idx
  on public.attendance_checkins (user_id, check_date desc);

alter table public.attendance_checkins enable row level security;
-- 본인 출석 이력만 조회(달력 표시). 쓰기는 service_role RPC(daily_checkin)로만.
drop policy if exists attendance_select_own on public.attendance_checkins;
create policy attendance_select_own on public.attendance_checkins
  for select using (auth.uid() = user_id);

-- 오늘(KST) 출석 + 포인트 지급(멱등). 이미 출석했으면 already=true로 그날 값 반환.
drop function if exists public.daily_checkin(uuid);
create or replace function public.daily_checkin(p_user uuid)
returns table(ok boolean, already boolean, credited bigint, streak int, balance bigint, checked_date date)
language plpgsql security definer set search_path = public as $$
declare
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_last_date  date;
  v_last_streak int;
  v_streak     int := 1;
  v_bonus      bigint := 0;
  v_base       bigint := 20;
  v_amount     bigint;
  v_bal        bigint;
  v_rows       int;
  v_row        public.attendance_checkins;
begin
  perform public.ensure_wallet(p_user, 0);

  -- 이미 오늘 출석? → 멱등 반환.
  select * into v_row from public.attendance_checkins a
    where a.user_id = p_user and a.check_date = v_today;
  if found then
    return query select true, true, v_row.credits_granted, v_row.streak,
      coalesce((select w.balance from public.wallets w where w.user_id = p_user), 0), v_today;
    return;
  end if;

  -- 연속 출석(streak): 직전 출석일이 '어제'면 +1, 아니면 1로 리셋.
  select a.check_date, a.streak into v_last_date, v_last_streak
    from public.attendance_checkins a
   where a.user_id = p_user
   order by a.check_date desc limit 1;
  if v_last_date is not null and v_last_date = v_today - 1 then
    v_streak := v_last_streak + 1;
  else
    v_streak := 1;
  end if;

  v_bonus := least((v_streak - 1) * 5, 30);
  if v_streak % 7 = 0 then v_bonus := v_bonus + 100; end if;  -- 7·14·… 일 마일스톤
  v_amount := v_base + v_bonus;

  insert into public.attendance_checkins (user_id, check_date, credits_granted, streak)
  values (p_user, v_today, v_amount, v_streak)
  on conflict (user_id, check_date) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- 동시 다른 요청이 먼저 삽입 → 그 값으로 멱등 반환(중복 지급 방지).
    select * into v_row from public.attendance_checkins a
      where a.user_id = p_user and a.check_date = v_today;
    return query select true, true, v_row.credits_granted, v_row.streak,
      coalesce((select w.balance from public.wallets w where w.user_id = p_user), 0), v_today;
    return;
  end if;

  -- 포인트 지급(멱등 idem=checkin:user:date). 원장에 admin_adjust로 기록.
  select g.balance into v_bal
    from public.grant_credits(
      p_user, v_amount, 'daily_checkin', 'attendance', v_today::text,
      'checkin:' || p_user::text || ':' || v_today::text
    ) g;

  return query select true, false, v_amount, v_streak, coalesce(v_bal, 0), v_today;
end $$;

revoke execute on function public.daily_checkin(uuid) from authenticated, anon, public;
grant  execute on function public.daily_checkin(uuid) to service_role;
