-- ============================================================
-- 0005_harden.sql — 보안 린트 대응 (get_advisors WARN)
-- ============================================================

-- 함수 search_path 고정(변조 방지).
alter function public.bump_persona_version() set search_path = public;

-- SECURITY DEFINER 함수의 불필요한 RPC 노출 차단.
-- handle_new_user/bump_persona_version: 트리거 전용 → 역할 실행 권한 회수.
-- purge_expired_images: 배치/service_role 전용 → anon·authenticated 회수(임의 삭제 방지).
-- (is_admin 은 RLS 정책이 호출하므로 실행 권한 유지 — 의도된 노출.)
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.bump_persona_version() from anon, authenticated;
revoke execute on function public.purge_expired_images() from anon, authenticated;
