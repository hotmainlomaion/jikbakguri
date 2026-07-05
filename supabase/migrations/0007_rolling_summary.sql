-- ============================================================
-- 0007_rolling_summary.sql — 채팅 롱컨텍스트 학습·일관화(롤링 요약).
-- 최근 N개 메시지 윈도우 밖으로 밀려나는 대화를 LLM으로 기존 요약에 통합해
-- sessions에 저장하고 시스템 프롬프트에 "지금까지의 이야기"로 재주입 → 장기 연속성.
-- 안전: 요약은 이미 moderation 통과한 메시지에서 파생 + 저장 전 heuristicScan 백스톱.
--       캐논이 요약보다 프롬프트 우선. 세션 cascade 삭제 대상(개인정보 7-D).
-- ============================================================

alter table public.sessions
  add column if not exists rolling_summary text,       -- 누적 요약(지금까지의 이야기)
  add column if not exists summary_upto int not null default 0;  -- 요약에 반영된 메시지 개수 워터마크
