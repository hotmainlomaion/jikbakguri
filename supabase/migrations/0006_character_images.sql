-- ============================================================
-- 0006_character_images.sql — 캐릭터 이미지 DB (운영자 큐레이션)
-- 카테고리(avatar/collection/scene) + 검수 게이트(review_status) + 대표컷 단일화.
-- 비공개 버킷 'character-images'(생성물 버킷과 분리) — 서명URL로만 접근.
-- 안전(7-B/7-C): approved 만 노출, 미성년 암시 비주얼 운영자 검수, 인증 후 접근.
-- ============================================================

create table if not exists public.character_images (
  id uuid primary key default gen_random_uuid(),
  bot_profile_id uuid not null references public.bot_profiles(id) on delete cascade,
  category text not null check (category in ('avatar', 'collection', 'scene')),
  location text,                       -- collection 세분류(침실/거실 등, 데이터 주도). avatar/scene은 null.
  storage_path text not null,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size int not null check (byte_size > 0 and byte_size <= 8388608),  -- 8MB, 앱과 이중화
  width int,
  height int,
  is_primary boolean not null default false,   -- category='avatar'의 대표컷
  sort_order int not null default 0,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_by uuid references public.users(id) on delete set null,  -- 운영자 탈퇴가 자산 삭제하지 않도록
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_charimg_bot_cat on public.character_images (bot_profile_id, category, sort_order);
create index if not exists idx_charimg_bot_status on public.character_images (bot_profile_id, review_status);

-- 대표컷은 봇당 approved 1장만(앱 버그로 2장 되는 회귀를 스키마가 봉쇄).
create unique index if not exists uniq_charimg_primary on public.character_images (bot_profile_id)
  where (is_primary = true and category = 'avatar' and review_status = 'approved');
create unique index if not exists uniq_charimg_path on public.character_images (storage_path);

-- 스토리라인 정렬(목표 2).
alter table public.scenarios add column if not exists sort_order int not null default 0;

comment on column public.bot_profiles.avatar_path is
  'DEPRECATED(0006): 대표컷 SSOT는 character_images(is_primary avatar). 스칼라 미사용, 회귀 안전 위해 컬럼만 유지.';

-- 비공개 버킷 신설(생성물 버킷과 분리 — 만료정책 오염 방지).
insert into storage.buckets (id, name, public)
values ('character-images', 'character-images', false)
on conflict (id) do nothing;

-- RLS: 운영자 전체 CRUD, 인증 사용자는 published 캐릭터의 approved 이미지 메타만 read.
-- (서빙은 service_role이 RLS 우회 → 서빙 헬퍼 쿼리의 approved+published 필터가 실질 통제선. RLS는 심층 방어.)
alter table public.character_images enable row level security;

create policy charimg_admin_all on public.character_images for all
  using (public.is_admin()) with check (public.is_admin());

create policy charimg_read_published on public.character_images for select
  using (
    review_status = 'approved'
    and exists (
      select 1 from public.bot_profiles b
      where b.id = bot_profile_id and b.is_published = true
    )
  );
