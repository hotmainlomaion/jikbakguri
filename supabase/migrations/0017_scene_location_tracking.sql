-- #3 장면/위치 추적: 세션의 현재 장소 상태 + 메시지 종류(대화/씬전환).
alter table public.sessions add column if not exists scene_location text;
-- messages.kind: 'chat'(기본) | 'scene'(장면 전환 지문 — 별도 카드로 렌더).
alter table public.messages add column if not exists kind text not null default 'chat';
comment on column public.sessions.scene_location is '현재 장면 위치(사용자 이동 지시로 갱신). 시스템 프롬프트·이미지 배경에 주입.';
comment on column public.messages.kind is 'chat | scene(장면 전환 지문 카드)';
