-- 0024_custom_characters.sql — 사용자 커스텀 캐릭터(A안: AI 생성, 사진 업로드 없음).
-- 안전: character_age>=18 CHECK(0001)는 그대로 유지되어 미성년 캐릭터를 스키마 레벨에서 원천 차단한다.
-- 커스텀 봇은 is_custom=true, created_by=소유자, is_published=false(갤러리 비노출, 소유자 비공개).
alter table public.bot_profiles
  add column if not exists is_custom boolean not null default false;

-- 커스텀 봇 아바타 경로(generated-images 버킷). 발행-가드된 character_images 대신 직접 참조.
alter table public.bot_profiles
  add column if not exists avatar_path text;

-- 소유자별 커스텀 목록 조회 인덱스.
create index if not exists bot_profiles_owner_idx on public.bot_profiles (created_by) where is_custom;

-- 방어적 RLS: 소유자는 자신의 커스텀 봇을 읽을 수 있다(앱은 service-role 사용, 이건 정합성/이중방어).
drop policy if exists bot_profiles_owner_read on public.bot_profiles;
create policy bot_profiles_owner_read on public.bot_profiles
  for select using (is_custom and created_by = auth.uid());
