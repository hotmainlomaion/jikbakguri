-- ============================================================
-- 0013_scenario_fk_set_null.sql — 운영자 시나리오 삭제 FK 차단 수정(#A1)
-- 0004의 sessions.scenario_id → scenarios(id) FK가 on delete 미지정(RESTRICT)이라,
-- 어떤 사용자든 그 시나리오로 세션을 시작했으면 운영자 시나리오 DELETE가 FK 위반(실패)한다.
-- 세션은 scenario_snapshot(0004)으로 스토리가 고정되므로, FK를 SET NULL로 바꿔 안전하게 삭제 허용.
-- ============================================================
alter table public.sessions
  drop constraint if exists sessions_scenario_id_fkey;
alter table public.sessions
  add constraint sessions_scenario_id_fkey
  foreign key (scenario_id) references public.scenarios(id) on delete set null;
