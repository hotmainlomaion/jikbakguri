-- 0022: sessions.relationship_stage DEFAULT 수정.
-- 0020(7단계 전환)이 CHECK를 새 단계명(first_meet..soulmate)으로 바꿨으나 컬럼 DEFAULT는
-- 옛 'stranger' 그대로 남아, relationship_stage를 지정하지 않는 신규 세션 insert가
-- CHECK 위반으로 전부 실패(→ /api/session 500, 채팅 시작 불가)했다. 첫 단계로 정렬.
alter table public.sessions
  alter column relationship_stage set default 'first_meet';

-- 안전망: 과거에 'stranger' 등 옛 값이 남아있으면 첫 단계로 정규화(있을 경우만).
update public.sessions
  set relationship_stage = 'first_meet'
  where relationship_stage not in
    ('first_meet','friend','crush','green_light','partner','lover','soulmate');
