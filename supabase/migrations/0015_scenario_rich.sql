-- 0015 시나리오 리치화: 선택 UI에 "간략 + 구체적 상황 + 페티쉬/무드 태그"를 노출한다.
-- description = 간략 한 줄 훅(기존), detail = 구체적 상황 설명(사용자 노출용, 3~5문장),
-- tags = 페티쉬/무드 칩(선택 카드에 표시), intensity = 수위 표시(1~3, 🔥 개수).
-- scenario(세계관/시스템 프롬프트 주입)·greeting(오프닝)은 기존 유지.
alter table public.scenarios add column if not exists detail text;
alter table public.scenarios add column if not exists tags text[] not null default '{}';
alter table public.scenarios add column if not exists intensity smallint not null default 2
  check (intensity between 1 and 3);

comment on column public.scenarios.detail is '구체적 상황 설명(선택 UI 노출, 시스템 프롬프트에는 scenario를 사용)';
comment on column public.scenarios.tags is '페티쉬/무드 태그 칩(선택 카드 표시). 성인·합의 전제.';
comment on column public.scenarios.intensity is '수위 표시 1~3(🔥). 미성년/불법과 무관한 성인 컨텐츠 강도 라벨.';
