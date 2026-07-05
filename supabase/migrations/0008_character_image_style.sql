-- ============================================================
-- 0008_character_image_style.sql — 캐릭터별 이미지 스타일/시드(일관성)
-- image_style: 실사(photoreal) vs 애니(anime) — 이미지 라우트가 백엔드/프롬프트 분기.
-- image_seed: 고정 시드 → 같은 캐릭터가 생성 간에 일관된 외형을 유지(썸네일↔이미지 일관화).
-- ============================================================

alter table public.bot_profiles
  add column if not exists image_style text not null default 'photoreal'
    check (image_style in ('photoreal', 'anime')),
  add column if not exists image_seed int;  -- null이면 랜덤. 고정 시 캐릭터 일관성.
