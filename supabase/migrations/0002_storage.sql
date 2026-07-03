-- 생성 이미지용 비공개 버킷 + 만료 정리용 헬퍼.
insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', false)
on conflict (id) do nothing;

-- 서명 URL로만 접근. service role(서버 라우트)만 업로드/조회. 클라이언트 직접 접근 정책 없음.

-- 만료 이미지 정리 함수(7-D). pg_cron 또는 운영 배치에서 주기 실행.
-- TODO(운영주체 확인): 스케줄러(pg_cron)로 주기 호출 등록.
create or replace function public.purge_expired_images()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 메타 삭제(스토리지 객체는 애플리케이션/배치가 storage_path로 함께 제거).
  delete from public.images where expires_at is not null and expires_at < now();
end; $$;
