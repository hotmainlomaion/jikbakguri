-- ============================================================
-- 0021_economy.sql — 크레딧 경제 레이어(지갑·원장·결제·멤버십 티어·차감 RPC)
-- 설계: 다각도 설계 워크플로우 합성 + 적대적 검토 반영(치명3건 선수정).
--   · credit_ledger = append-only 감사 진실원천(balance_after 스냅샷, DB 트리거로 UPDATE/DELETE 차단).
--   · wallets.balance = 권위 잔액(CHECK>=0). 조건부 UPDATE(balance>=amount)로 TOCTOU 없이 원자 차감.
--   · 모든 증감은 SECURITY DEFINER RPC만(execute를 anon/authenticated revoke, service_role만 grant).
--     RLS는 SELECT만 허용 → 사용자 자가증액 원천 차단.
--   · 결제 멱등 3중: payments(provider,provider_ref) UNIQUE + applied_at 원자 클레임 + ledger idem UNIQUE.
--   · 기존 0011 image_quota(일일 카운트)와 공존. 안전 하드리밋(미성년/CSAM)과 완전 독립.
-- 검토 반영: (1) 환불 시 티어 강등 허용(영구 보너스 farming 차단), (2) ensure_wallet(_,0) welcome 플래그
--   조기소진 방지, (3) 가입 트리거가 지갑오류로 롤백되지 않게 예외 격리, (4) 원장 append-only DB강제.
-- ============================================================

-- ---------- 1. wallets ----------
create table if not exists public.wallets (
  user_id          uuid primary key references public.users(id) on delete cascade,
  balance          bigint not null default 0 check (balance >= 0),
  cumulative_krw   bigint not null default 0 check (cumulative_krw >= 0),
  lifetime_earned  bigint not null default 0 check (lifetime_earned >= 0),
  lifetime_spent   bigint not null default 0 check (lifetime_spent  >= 0),
  tier             text   not null default 'bronze'
                     check (tier in ('bronze','silver','gold','diamond','platinum','master')),
  level            int    not null default 1 check (level between 1 and 5),
  welcome_granted  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists wallets_tier_idx on public.wallets (tier, level);

-- ---------- 2. membership_tiers (30행 사다리) ----------
create table if not exists public.membership_tiers (
  tier               text not null check (tier in ('bronze','silver','gold','diamond','platinum','master')),
  level              int  not null check (level between 1 and 5),
  rank               int  not null unique check (rank >= 0),
  min_cumulative_krw bigint not null check (min_cumulative_krw >= 0),
  topup_bonus_pct    numeric(5,2) not null check (topup_bonus_pct >= 0),
  label              text not null,
  primary key (tier, level),
  unique (min_cumulative_krw)
);
create index if not exists membership_tiers_threshold_idx on public.membership_tiers (min_cumulative_krw desc);

insert into public.membership_tiers (tier, level, rank, min_cumulative_krw, topup_bonus_pct, label) values
  ('bronze',   1,  0,        0,  0.00, '브론즈 I'),
  ('bronze',   2,  1,     5000,  1.00, '브론즈 II'),
  ('bronze',   3,  2,    10000,  2.00, '브론즈 III'),
  ('bronze',   4,  3,    20000,  3.00, '브론즈 IV'),
  ('bronze',   5,  4,    30000,  4.00, '브론즈 V'),
  ('silver',   1,  5,    50000,  5.00, '실버 I'),
  ('silver',   2,  6,    70000,  6.00, '실버 II'),
  ('silver',   3,  7,    90000,  7.00, '실버 III'),
  ('silver',   4,  8,   120000,  8.00, '실버 IV'),
  ('silver',   5,  9,   150000,  9.00, '실버 V'),
  ('gold',     1, 10,   200000, 10.00, '골드 I'),
  ('gold',     2, 11,   250000, 11.00, '골드 II'),
  ('gold',     3, 12,   300000, 12.00, '골드 III'),
  ('gold',     4, 13,   400000, 13.00, '골드 IV'),
  ('gold',     5, 14,   500000, 14.00, '골드 V'),
  ('diamond',  1, 15,   700000, 15.00, '다이아 I'),
  ('diamond',  2, 16,   900000, 16.00, '다이아 II'),
  ('diamond',  3, 17,  1100000, 17.00, '다이아 III'),
  ('diamond',  4, 18,  1400000, 18.00, '다이아 IV'),
  ('diamond',  5, 19,  1700000, 19.00, '다이아 V'),
  ('platinum', 1, 20,  2000000, 20.00, '플래티넘 I'),
  ('platinum', 2, 21,  2500000, 21.00, '플래티넘 II'),
  ('platinum', 3, 22,  3000000, 22.00, '플래티넘 III'),
  ('platinum', 4, 23,  4000000, 23.00, '플래티넘 IV'),
  ('platinum', 5, 24,  5000000, 24.00, '플래티넘 V'),
  ('master',   1, 25,  7000000, 25.00, '마스터 I'),
  ('master',   2, 26, 10000000, 27.00, '마스터 II'),
  ('master',   3, 27, 15000000, 29.00, '마스터 III'),
  ('master',   4, 28, 20000000, 32.00, '마스터 IV'),
  ('master',   5, 29, 30000000, 35.00, '마스터 V')
on conflict (tier, level) do update
  set rank = excluded.rank, min_cumulative_krw = excluded.min_cumulative_krw,
      topup_bonus_pct = excluded.topup_bonus_pct, label = excluded.label;

-- ---------- 3. credit_ledger (append-only) ----------
create table if not exists public.credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  entry_type      text not null check (entry_type in
                    ('welcome','purchase','purchase_bonus','spend','refund','admin_adjust')),
  amount          bigint not null check (amount <> 0),
  balance_after   bigint not null check (balance_after >= 0),
  reason          text,
  ref_type        text,
  ref_id          text,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  constraint ledger_amount_sign check (
    (entry_type in ('welcome','purchase','purchase_bonus') and amount > 0)
    or (entry_type in ('spend','refund') and amount < 0)
    or (entry_type = 'admin_adjust')
  )
);
create unique index if not exists credit_ledger_idem_uq
  on public.credit_ledger (idempotency_key) where idempotency_key is not null;
create index if not exists credit_ledger_user_time_idx on public.credit_ledger (user_id, created_at desc);
create index if not exists credit_ledger_ref_idx on public.credit_ledger (ref_type, ref_id);

-- 검토#5: 원장 append-only(기존항목 UPDATE 불변)를 DB로 강제. DELETE는 계정탈퇴 cascade(7-D) 위해 허용.
create or replace function public.ledger_no_mutate() returns trigger language plpgsql as $$
begin raise exception 'credit_ledger is append-only (no update/delete)'; end $$;
drop trigger if exists ledger_block_update on public.credit_ledger;
create trigger ledger_block_update before update on public.credit_ledger for each row execute function public.ledger_no_mutate();

-- ---------- 4. credit_packages (충전 상품) ----------
create table if not exists public.credit_packages (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  label         text not null,
  price_krw     bigint not null check (price_krw > 0),
  base_credits  bigint not null check (base_credits > 0),
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
insert into public.credit_packages (code, label, price_krw, base_credits, sort_order) values
  ('starter', '5,500원 충전',    5500,   550, 1),
  ('basic',  '11,000원 충전',   11000,  1150, 2),
  ('value',  '33,000원 충전',   33000,  3600, 3),
  ('pro',    '55,000원 충전',   55000,  6200, 4),
  ('whale', '110,000원 충전',  110000, 13000, 5)
on conflict (code) do update
  set label=excluded.label, price_krw=excluded.price_krw,
      base_credits=excluded.base_credits, sort_order=excluded.sort_order;

-- ---------- 5. payments (상태머신 + 멱등 앵커) ----------
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete restrict,
  package_id     uuid references public.credit_packages(id),
  amount_krw     bigint not null check (amount_krw > 0),
  base_credits   bigint not null default 0 check (base_credits  >= 0),
  bonus_credits  bigint not null default 0 check (bonus_credits >= 0),
  bonus_pct      numeric(5,2) not null default 0,
  status         text not null default 'pending'
                   check (status in ('pending','paid','failed','refunded')),
  provider       text not null default 'tosspayments',   -- TODO(운영주체 확인): 실제 PG사
  provider_ref   text not null,
  applied_at     timestamptz,
  refunded_at    timestamptz,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  updated_at     timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index if not exists payments_user_time_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx    on public.payments (status);

-- ============================================================
-- RLS + grant 회수(자가증액 차단)
-- ============================================================
alter table public.wallets          enable row level security;
alter table public.credit_ledger    enable row level security;
alter table public.payments         enable row level security;
alter table public.membership_tiers enable row level security;
alter table public.credit_packages  enable row level security;

drop policy if exists wallets_self_read on public.wallets;
create policy wallets_self_read on public.wallets for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists ledger_self_read on public.credit_ledger;
create policy ledger_self_read on public.credit_ledger for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists payments_self_read on public.payments;
create policy payments_self_read on public.payments for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists tiers_read on public.membership_tiers;
create policy tiers_read on public.membership_tiers for select using (auth.uid() is not null);
drop policy if exists tiers_admin_all on public.membership_tiers;
create policy tiers_admin_all on public.membership_tiers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists packages_read on public.credit_packages;
create policy packages_read on public.credit_packages for select using ((is_active = true and auth.uid() is not null) or public.is_admin());
drop policy if exists packages_admin_all on public.credit_packages;
create policy packages_admin_all on public.credit_packages for all using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on public.wallets          from authenticated, anon;
revoke insert, update, delete on public.credit_ledger    from authenticated, anon;
revoke insert, update, delete on public.payments         from authenticated, anon;
revoke insert, update, delete on public.membership_tiers from authenticated, anon;
revoke insert, update, delete on public.credit_packages  from authenticated, anon;

-- ============================================================
-- RPC 계층(SECURITY DEFINER, search_path 고정, 원자·멱등)
-- ============================================================

-- 0) 누적KRW → (tier,level,bonus_pct) 순수 계산
create or replace function public.tier_for_krw(n bigint)
returns table(tier text, level int, bonus_pct numeric)
language sql stable security definer set search_path = public as $$
  select t.tier, t.level, t.topup_bonus_pct
  from public.membership_tiers t
  where t.min_cumulative_krw <= greatest(coalesce(n,0), 0)
  order by t.min_cumulative_krw desc
  limit 1;
$$;

-- 1) 지갑 lazy-init + 환영 크레딧(멱등). 검토#2: p_welcome<=0이면 welcome 플래그를 소진하지 않음.
create or replace function public.ensure_wallet(p_user uuid, p_welcome bigint default 300)
returns void
language plpgsql security definer set search_path = public as $$
declare v_new bigint;
begin
  insert into public.wallets (user_id) values (p_user)
  on conflict (user_id) do nothing;

  update public.wallets w
     set welcome_granted = true,
         balance         = w.balance         + greatest(coalesce(p_welcome,0), 0),
         lifetime_earned = w.lifetime_earned + greatest(coalesce(p_welcome,0), 0),
         updated_at      = now()
   where w.user_id = p_user
     and w.welcome_granted = false
     and coalesce(p_welcome,0) > 0          -- ★검토#2: 0 지급은 플래그 소진 금지(환영 락 방지)
   returning w.balance into v_new;

  if v_new is not null then
    insert into public.credit_ledger
      (user_id, entry_type, amount, balance_after, reason, ref_type, idempotency_key)
    values
      (p_user, 'welcome', p_welcome, v_new, 'signup_welcome', 'welcome', 'welcome:'||p_user::text)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;
end $$;

-- 2) 티어 재계산. 검토#1: p_allow_demote=true(환불 경로)면 실제 누적KRW로 강등 허용(보너스 farming 차단).
create or replace function public.recompute_tier(p_user uuid, p_allow_demote boolean default false)
returns table(tier text, level int)
language plpgsql security definer set search_path = public as $$
declare v_krw bigint; v_tier text; v_level int; v_new_rank int; v_cur_rank int;
begin
  select cumulative_krw into v_krw from public.wallets where user_id = p_user for update;
  if v_krw is null then perform public.ensure_wallet(p_user, 0); v_krw := 0; end if;

  select tf.tier, tf.level into v_tier, v_level from public.tier_for_krw(v_krw) tf;
  v_tier := coalesce(v_tier, 'bronze'); v_level := coalesce(v_level, 1);

  select mt.rank into v_new_rank from public.membership_tiers mt where mt.tier = v_tier and mt.level = v_level;
  select coalesce(mt.rank, -1) into v_cur_rank
    from public.membership_tiers mt
    join public.wallets w on w.tier = mt.tier and w.level = mt.level
   where w.user_id = p_user;

  update public.wallets w
     set tier  = case when p_allow_demote or coalesce(v_new_rank,0) >= coalesce(v_cur_rank,-1) then v_tier  else w.tier  end,
         level = case when p_allow_demote or coalesce(v_new_rank,0) >= coalesce(v_cur_rank,-1) then v_level else w.level end,
         updated_at = now()
   where w.user_id = p_user
   returning w.tier, w.level into v_tier, v_level;

  return query select v_tier, v_level;
end $$;

-- 3) 원자 차감(음수 불가·동시 안전·선택적 멱등)
create or replace function public.spend_credits(
  p_user uuid, p_amount bigint, p_reason text,
  p_ref_type text default null, p_ref_id text default null, p_idem text default null
) returns table(ok boolean, balance bigint, ledger_id uuid, fail_reason text)
language plpgsql security definer set search_path = public as $$
declare v_new bigint; v_lid uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, coalesce((select w.balance from public.wallets w where w.user_id=p_user),0),
                        null::uuid, 'invalid_amount'::text; return;
  end if;

  if p_idem is not null then
    select l.balance_after, l.id into v_new, v_lid from public.credit_ledger l where l.idempotency_key = p_idem;
    if found then return query select true, v_new, v_lid, null::text; return; end if;
  end if;

  perform public.ensure_wallet(p_user, 0);

  update public.wallets w
     set balance        = w.balance - p_amount,
         lifetime_spent = w.lifetime_spent + p_amount,
         updated_at     = now()
   where w.user_id = p_user and w.balance >= p_amount
   returning w.balance into v_new;

  if v_new is null then
    return query select false, coalesce((select w.balance from public.wallets w where w.user_id=p_user),0),
                        null::uuid, 'insufficient_credits'::text; return;
  end if;

  insert into public.credit_ledger
    (user_id, entry_type, amount, balance_after, reason, ref_type, ref_id, idempotency_key)
  values (p_user, 'spend', -p_amount, v_new, p_reason, p_ref_type, p_ref_id, p_idem)
  returning id into v_lid;

  return query select true, v_new, v_lid, null::text;
end $$;

-- 3b) 시스템/운영 크레딧 지급(프로모/보상/환불보정, 멱등). admin_adjust(±). 하한 0.
create or replace function public.grant_credits(
  p_user uuid, p_amount bigint, p_reason text default 'admin_grant',
  p_ref_type text default 'admin', p_ref_id text default null, p_idem text default null
) returns table(ok boolean, balance bigint, ledger_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_new bigint; v_lid uuid;
begin
  if p_amount is null or p_amount = 0 then
    return query select false, coalesce((select w.balance from public.wallets w where w.user_id=p_user),0), null::uuid; return;
  end if;
  if p_idem is not null then
    select l.balance_after, l.id into v_new, v_lid from public.credit_ledger l where l.idempotency_key = p_idem;
    if found then return query select true, v_new, v_lid; return; end if;
  end if;
  perform public.ensure_wallet(p_user, 0);
  update public.wallets w
     set balance         = w.balance + p_amount,
         lifetime_earned = w.lifetime_earned + greatest(p_amount,0),
         updated_at      = now()
   where w.user_id = p_user and w.balance + p_amount >= 0
   returning w.balance into v_new;
  if v_new is null then
    return query select false, coalesce((select w.balance from public.wallets w where w.user_id=p_user),0), null::uuid; return;
  end if;
  insert into public.credit_ledger
    (user_id, entry_type, amount, balance_after, reason, ref_type, ref_id, idempotency_key)
  values (p_user, 'admin_adjust', p_amount, v_new, p_reason, p_ref_type, p_ref_id, p_idem)
  returning id into v_lid;
  return query select true, v_new, v_lid;
end $$;

-- 4) 결제 확정(멱등 3중, 기본+티어보너스 지급, 누적KRW, 티어 승급)
create or replace function public.apply_payment(p_payment_id uuid)
returns table(ok boolean, credited bigint, base bigint, bonus bigint,
              new_balance bigint, tier text, level int, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  p public.payments%rowtype;
  v_base bigint; v_pct numeric; v_bonus bigint; v_total bigint;
  v_new bigint; v_tier text; v_level int; v_claimed boolean;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment % not found', p_payment_id; end if;

  if p.applied_at is not null then
    select w.balance, w.tier, w.level into v_new, v_tier, v_level from public.wallets w where w.user_id = p.user_id;
    return query select true, (p.base_credits + p.bonus_credits), p.base_credits, p.bonus_credits,
                        coalesce(v_new,0), v_tier, v_level, true; return;
  end if;

  update public.payments pp set status='paid', applied_at=now(), paid_at=coalesce(pp.paid_at,now()), updated_at=now()
   where pp.id = p.id and pp.status = 'pending'
   returning true into v_claimed;
  if v_claimed is null then
    select w.balance, w.tier, w.level into v_new, v_tier, v_level from public.wallets w where w.user_id=p.user_id;
    return query select true, 0::bigint, 0::bigint, 0::bigint, coalesce(v_new,0), v_tier, v_level, true; return;
  end if;

  perform public.ensure_wallet(p.user_id, 0);

  v_base := nullif(p.base_credits, 0);
  if v_base is null and p.package_id is not null then
    select base_credits into v_base from public.credit_packages where id = p.package_id;
  end if;
  v_base := coalesce(v_base, p.amount_krw / 10);

  select mt.topup_bonus_pct into v_pct
    from public.wallets w
    join public.membership_tiers mt on mt.tier = w.tier and mt.level = w.level
   where w.user_id = p.user_id;
  v_pct   := coalesce(v_pct, 0);
  v_bonus := floor(v_base * v_pct / 100.0)::bigint;
  v_total := v_base + v_bonus;

  update public.wallets w
     set balance         = w.balance + v_total,
         lifetime_earned = w.lifetime_earned + v_total,
         cumulative_krw  = w.cumulative_krw + p.amount_krw,
         updated_at      = now()
   where w.user_id = p.user_id
   returning w.balance into v_new;

  update public.payments
     set base_credits = v_base, bonus_credits = v_bonus, bonus_pct = v_pct, updated_at = now()
   where id = p.id;

  insert into public.credit_ledger
    (user_id, entry_type, amount, balance_after, reason, ref_type, ref_id, idempotency_key)
  values (p.user_id, 'purchase', v_base, v_new - v_bonus, 'payment:paid', 'payment', p.id::text, 'pay:base:'||p.id::text)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  if v_bonus > 0 then
    insert into public.credit_ledger
      (user_id, entry_type, amount, balance_after, reason, ref_type, ref_id, idempotency_key)
    values (p.user_id, 'purchase_bonus', v_bonus, v_new, 'payment:topup_bonus:'||v_pct||'%', 'payment', p.id::text, 'pay:bonus:'||p.id::text)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  select rt.tier, rt.level into v_tier, v_level from public.recompute_tier(p.user_id) rt;
  return query select true, v_total, v_base, v_bonus, v_new, v_tier, v_level, false;
end $$;

-- 5) 환불(멱등, 지급분 회수, 누적KRW 차감, 검토#1: 티어 강등 재계산)
create or replace function public.refund_payment(p_payment_id uuid)
returns table(ok boolean, reclaimed bigint, new_balance bigint, already boolean)
language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype; v_grant bigint; v_reclaim bigint; v_bal bigint; v_new bigint; v_done boolean;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment % not found', p_payment_id; end if;
  if p.status = 'refunded' then
    select balance into v_new from public.wallets where user_id = p.user_id;
    return query select true, 0::bigint, coalesce(v_new,0), true; return;
  end if;

  update public.payments pp set status='refunded', refunded_at=now(), updated_at=now()
   where pp.id = p.id and pp.status = 'paid'
   returning true into v_done;
  if v_done is null then
    select balance into v_new from public.wallets where user_id = p.user_id;
    return query select true, 0::bigint, coalesce(v_new,0), true; return;
  end if;

  v_grant := p.base_credits + p.bonus_credits;
  select balance into v_bal from public.wallets where user_id = p.user_id;
  v_reclaim := least(coalesce(v_bal,0), v_grant);

  update public.wallets w
     set balance        = w.balance - v_reclaim,
         cumulative_krw = greatest(0, w.cumulative_krw - p.amount_krw),
         updated_at     = now()
   where w.user_id = p.user_id
   returning w.balance into v_new;

  if v_reclaim > 0 then
    insert into public.credit_ledger
      (user_id, entry_type, amount, balance_after, reason, ref_type, ref_id, idempotency_key)
    values (p.user_id, 'refund', -v_reclaim, v_new, 'payment:refund', 'payment', p.id::text, 'pay:refund:'||p.id::text)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  perform public.recompute_tier(p.user_id, true);  -- ★검토#1: 강등 허용(실제 누적KRW 기준)
  return query select true, v_reclaim, coalesce(v_new,0), false;
end $$;

-- 6) 신규가입 트리거 확장: users 미러링 + 지갑·환영. 검토#3: 지갑 실패가 회원가입을 롤백하지 않게 예외 격리.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  begin
    perform public.ensure_wallet(new.id, 300);
  exception when others then
    raise warning 'ensure_wallet failed for %: %', new.id, sqlerrm;  -- 가입은 성공, 지갑은 게이트에서 lazy 재시도
  end;
  return new;
end $$;

-- ---------- 기존 사용자 백필(지갑 + 환영 300 소급) ----------
do $$ declare r record; begin
  for r in select id from public.users loop
    begin perform public.ensure_wallet(r.id, 300); exception when others then null; end;
  end loop;
end $$;

-- ---------- 실행 권한 잠금(service_role만) ----------
revoke execute on function public.spend_credits(uuid,bigint,text,text,text,text) from authenticated, anon, public;
revoke execute on function public.grant_credits(uuid,bigint,text,text,text,text)  from authenticated, anon, public;
revoke execute on function public.apply_payment(uuid)                            from authenticated, anon, public;
revoke execute on function public.refund_payment(uuid)                           from authenticated, anon, public;
revoke execute on function public.ensure_wallet(uuid,bigint)                     from authenticated, anon, public;
revoke execute on function public.recompute_tier(uuid,boolean)                   from authenticated, anon, public;
grant  execute on function public.spend_credits(uuid,bigint,text,text,text,text) to service_role;
grant  execute on function public.grant_credits(uuid,bigint,text,text,text,text)  to service_role;
grant  execute on function public.apply_payment(uuid)                            to service_role;
grant  execute on function public.refund_payment(uuid)                           to service_role;
grant  execute on function public.ensure_wallet(uuid,bigint)                     to service_role;
grant  execute on function public.recompute_tier(uuid,boolean)                   to service_role;
grant  execute on function public.tier_for_krw(bigint)                           to service_role;
