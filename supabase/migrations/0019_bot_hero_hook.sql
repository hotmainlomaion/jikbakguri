-- 갤러리 히어로 배너용 후킹 문구(페르소나 설명 대신 상상력 자극 티저). 운영자 큐레이션/생성.
alter table public.bot_profiles add column if not exists hero_hook text;
comment on column public.bot_profiles.hero_hook is '히어로 배너 티저 문구(1~2문장, 상황 암시·궁금증 유발). 없으면 persona로 폴백.';
