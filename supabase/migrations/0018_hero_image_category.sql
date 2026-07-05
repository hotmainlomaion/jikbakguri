-- 히어로 배너 전용 와이드 이미지 카테고리 추가(갤러리 상단 캐러셀). avatar와 별개.
alter table public.character_images drop constraint if exists character_images_category_check;
alter table public.character_images add constraint character_images_category_check
  check (category = any (array['avatar'::text, 'collection'::text, 'scene'::text, 'hero'::text]));
