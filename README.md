# 성인향 AI 챗 MVP

CLAUDE.md 핸드오프 스펙 기반 구현. Next.js 14 (App Router) + Supabase + Atlas Cloud.

## 셋업

```bash
npm install
cp .env.local.example .env.local   # 값 채우기 (TODO(운영주체 확인) 항목)
# Supabase에 마이그레이션 적용
#   supabase/migrations/0001_init.sql, 0002_storage.sql, 그리고 supabase/seed.sql
npm run dev
```

운영자 지정: `insert into public.admins (user_id) values ('<uuid>');`

## 안전 구조 (섹션 7) — 배포 전 필수

- **인증 게이트**: 모든 콘텐츠 라우트/페이지가 서버단 `requireVerifiedUser()`로 검증. 클라이언트 신뢰 안 함. (`lib/auth/gate.ts`)
- **모더레이션 단일 진입점**: `lib/moderation` 하나만 존재. chat/image 라우트가 입력·출력 양방향으로 통과. 우회 라우트 없음.
  - 텍스트 분류 API 실패 → **fail-closed**(차단).
  - 이미지 출력 스크리닝 미설정 → **fail-closed**. 실제 분류기 연동 후 활성화.
  - 결정론적 미성년 휴리스틱 백스톱 항상 실행 (`categories.ts`, 테스트 `categories.test.ts`).
- **봇 거버넌스**: `character_age >= 18` DB CHECK. 사용자 커스텀 봇 생성 없음(운영자 큐레이션만).
- **개인정보**: 신분정보 원본 미저장(참조값만), 프롬프트 해시 저장, 이미지 만료(`expires_at`), 탈퇴 시 cascade 완전 삭제.
- **감사**: 모든 판정 `moderation_logs` 기록, 운영자 콘솔 조회.

## 검증

```bash
npm run test        # 모더레이션 회귀 (미성년 차단)
npm run typecheck
npm run build
```

## 로드맵 대응

P0 스키마/인증·P1 모더레이션·P2 채팅·P3 이미지·P4 운영자 콘솔 구현 완료.
남은 것: 실 endpoint/model_name, 인증기관, 분류 API, PG (`.env.local.example`의 `TODO(운영주체 확인)`), P5 실사용 검증.

## 미확정 (TODO(운영주체 확인))

`.env.local.example` 및 코드 주석 참조: Atlas endpoint/model, 성인 인증 provider, 모더레이션 분류 API, PG, 심의 절차.
