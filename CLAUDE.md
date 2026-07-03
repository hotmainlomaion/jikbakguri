# CLAUDE.md — 성인향 AI 챗 서비스 MVP (Atlas Cloud 기반)

> **이 문서의 목적**
> 외부 개발 인력이 Claude Code 환경에서 이 프로젝트를 처음부터 구현할 수 있도록 하는 handoff 스펙입니다.
> 코드가 아니라 **기획·아키텍처·컴플라이언스 명세**입니다. 구현 착수 전 반드시 "섹션 7. 법적 컴플라이언스 & 안전 가드레일"을 먼저 읽으세요. 이 섹션은 선택이 아니라 **MVP의 필수 구성요소**이며, 여기 명시된 차단 로직이 빠진 빌드는 배포 대상이 아닙니다.
>
> **에이전트 사용:** 이 프로젝트는 `agents/` 폴더에 전문 서브에이전트 정의를 포함합니다. **작업 시작 시 이 문서(`CLAUDE.md`)를 먼저 읽은 뒤 `agents/orchestrator.md`부터 로드하세요.** 오케스트레이터가 작업을 적절한 전문 에이전트에 위임하며, 모든 AI 관련 산출물은 `safety-compliance` 에이전트의 검수를 통과해야 합니다. 상세는 "섹션 10. 에이전트 구성" 참조.

---

## 0. 한 줄 요약

성인 인증을 통과한 사용자가, **운영자가 사전에 큐레이션한 AI 봇 프로필**을 선택해 텍스트 채팅과 이미지 생성을 주고받는 성인향 SaaS. AI 추론은 전량 Atlas Cloud API로 오프로드(로컬 GPU 미사용), 프론트/백엔드/DB는 자체 운영.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스 성격 | 성인향(18+) AI 캐릭터 챗 + 이미지 생성 |
| 타깃 규모 (MVP) | 초기 검증용 소규모(약 10명), 순차 처리 전제 |
| AI 백엔드 | Atlas Cloud API (텍스트 LLM + FLUX schnell 이미지) |
| 배포 형태 | 웹 기반 (앱스토어 배포는 정책상 사실상 불가 — 웹 전용으로 시작) |
| 핵심 제약 | 성인 인증 필수 / 미성년자 관련 콘텐츠 절대 차단 / 개인정보 최소 수집 |

**MVP에서 검증할 것:** 봇 프로필 선택 → 대화·이미지 루프의 UX가 성립하는가, 사용자가 다시 돌아오는가. 인프라 최적화·다중 봇 확장·결제 고도화는 검증 후 과제.

---

## 2. 핵심 사용자 생명주기 (Core Lifecycle)

기획서에서 지정된 흐름을 기준으로 합니다.

```
[1] 랜딩 → 성인 인증 (본인확인)
        ↓  (인증 실패 시 접근 차단)
[2] 로그인 / 회원 → 봇 프로필 갤러리
        ↓
[3] AI 봇 모델 프로필 선택
        ↓
[4] 채팅 세션 진입
        ├─ 텍스트 대화 (LLM)
        └─ 이미지 생성 요청 (FLUX schnell)
        ↓
[5] 세션 히스토리 저장 / 재진입
```

- **[3] 프로필은 사용자가 자유 생성하는 게 아니라 운영자가 등록한 목록에서 "선택"** 합니다. 이게 안전 설계의 핵심입니다(섹션 7-C 참조). MVP에서는 사용자 커스텀 봇 생성 기능을 **제공하지 않습니다.**
- 각 봇 프로필은 성격·말투·외형 설명·시스템 프롬프트를 필드로 가지며, 모든 프로필은 **성인 캐릭터로만** 구성됩니다(연령 메타데이터 필수, 섹션 7-C).

---

## 3. 기술 스택 & 아키텍처

기존 워크플로우(Next.js + Supabase + 외부 AI API)와 일관되게 구성합니다.

| 레이어 | 선택 |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind |
| Backend | Next.js Route Handlers (또는 별도 Node/FastAPI) |
| DB / Auth | Supabase (Postgres + Row Level Security) |
| 세션/큐 | Supabase 테이블 기반 경량 job queue (MVP엔 Redis 불필요) |
| AI 추론 | **Atlas Cloud API** (LLM: OpenAI Chat Completions 호환 / 이미지: 자체 REST) |
| 이미지 스토리지 | Supabase Storage (또는 S3 호환) — 만료 정책 설정 |
| 결제 (2단계) | 성인 콘텐츠 대응 PG (Stripe/PayPal 거부 리스크 → 국내 성인 대응 PG 별도 검토) |

### 아키텍처 다이어그램

```
[Browser]
   │  HTTPS
   ▼
[Next.js App]───────── Auth Gate (성인 인증 완료 여부 체크) ── 미통과 시 차단
   │
   ├─ /api/chat  ── moderation(입력) ─► Atlas Cloud LLM ─► moderation(출력) ─► 응답
   │
   └─ /api/image ── moderation(프롬프트) ─► Atlas Cloud FLUX ─► moderation(출력 이미지) ─► 저장/반환
   │
   ▼
[Supabase]  users · age_verifications · bot_profiles · sessions · messages · images · moderation_logs
```

> **중요:** 모든 AI 호출은 반드시 moderation 레이어를 **입력·출력 양방향**으로 통과합니다. Atlas Cloud 모델 자체는 필터가 없으므로(그게 선택 이유이므로), 안전 필터링 책임은 **전적으로 우리 애플리케이션 레이어에 있습니다.** 이 부분을 생략하면 서비스가 위법 콘텐츠 생성 통로가 됩니다.

---

## 4. Atlas Cloud 연동 명세

> API 키·엔드포인트·모델명은 착수 시점에 Atlas Cloud 대시보드/문서에서 **직접 확인**하세요. 아래는 통합 방식의 골격이며, 실제 값은 공식 문서 기준으로 채웁니다.

### 4-A. 텍스트 채팅 (LLM)
- Atlas Cloud LLM 엔드포인트는 **OpenAI Chat Completions 포맷**을 따릅니다. `openai` SDK의 `baseURL`만 Atlas 엔드포인트로 교체하는 방식으로 붙일 수 있습니다.
- 요청에는 (1) 선택된 봇의 시스템 프롬프트, (2) 최근 대화 히스토리, (3) 사용자 신규 메시지를 함께 전송합니다. LLM은 상태를 기억하지 못하므로 **매 요청마다 컨텍스트 전체를 재전송**합니다.
- 모델 선택: uncensored 계열 중 채택. 실제 사용 가능한 model_name은 착수 시 카탈로그에서 확정.

### 4-B. 이미지 생성 (FLUX schnell)
- 이미지 모델은 **LLM과 다른 REST 포맷**을 씁니다(별도 엔드포인트). $0.003/장 수준, 1~4 step.
- 프롬프트는 (1) 봇 외형 고정 프롬프트 + (2) 사용자 요청을 합성하되, **합성 결과가 moderation을 통과한 후에만** 호출합니다.

### 4-C. API 키 보안 (필수)
- 키는 **절대 프론트엔드/클라이언트 번들에 노출 금지.** 서버 라우트 핸들러에서만 사용.
- 환경변수(`.env.local`)로 관리, git 커밋 금지(`.gitignore` 등록), 배포 환경은 시크릿 매니저 사용.
- 키 유출 시 즉시 rotation 절차 문서화.

### 4-D. 비용·용량 가드
- 사용자당 일일 이미지 생성 상한(예: 5장) 및 채팅 rate limit을 **서버에서** 강제.
- 월 예산 알림 임계치 설정(예산 초과 자동 차단). 10명 규모에선 월 수천 원대 예상이나, 상한 없으면 오남용 시 폭증 가능.

---

## 5. 데이터 모델 (Supabase)

```sql
-- 사용자
users (
  id uuid pk,
  email text unique,
  created_at timestamptz,
  is_adult_verified boolean default false,   -- 섹션 7-A 통과 여부
  status text default 'active'               -- active | suspended | banned
)

-- 성인 인증 기록 (개인정보 최소화: 인증 결과만 저장, 원본 신분정보 미저장)
age_verifications (
  id uuid pk,
  user_id uuid fk,
  method text,            -- 'mobile_auth' | 'ipin' 등
  verified_at timestamptz,
  provider_ref text       -- 인증기관 트랜잭션 참조값 (개인식별정보 원본 아님)
)

-- 봇 프로필 (운영자 큐레이션 전용)
bot_profiles (
  id uuid pk,
  name text,
  persona text,           -- 성격/말투
  appearance_desc text,   -- 외형 설명 (이미지 프롬프트 베이스)
  system_prompt text,     -- LLM 시스템 프롬프트
  character_age int,       -- 필수, CHECK (character_age >= 18)
  is_published boolean default false,
  created_by uuid          -- 운영자 계정
)

-- 세션
sessions (
  id uuid pk,
  user_id uuid fk,
  bot_profile_id uuid fk,
  created_at timestamptz,
  last_active_at timestamptz
)

-- 메시지
messages (
  id uuid pk,
  session_id uuid fk,
  role text,              -- 'user' | 'assistant'
  content text,
  created_at timestamptz
)

-- 생성 이미지
images (
  id uuid pk,
  session_id uuid fk,
  prompt_hash text,       -- 원문 대신 해시 (프라이버시)
  storage_path text,
  created_at timestamptz,
  expires_at timestamptz  -- 만료 정책
)

-- 모더레이션 로그 (법적 대응·감사용)
moderation_logs (
  id uuid pk,
  user_id uuid fk,
  channel text,           -- 'chat_in' | 'chat_out' | 'image_in' | 'image_out'
  verdict text,           -- 'pass' | 'blocked'
  reason text,            -- 차단 사유 카테고리
  created_at timestamptz
)
```

- **RLS(Row Level Security) 필수:** 사용자는 본인 데이터만 접근. 봇 프로필은 published만 read.
- `character_age >= 18` DB 제약으로 미성년 캐릭터 등록 자체를 스키마 레벨에서 봉쇄.

---

## 6. 화면 / 기능 명세

| 화면 | 기능 |
|---|---|
| S1. 랜딩 | 서비스 소개, 19금 표시, "성인 인증 후 이용" CTA. 콘텐츠 미리보기 노출 금지 |
| S2. 성인 인증 | 본인확인(휴대폰/아이핀 등) 연동. 실패 시 진입 불가 |
| S3. 로그인/가입 | 이메일 또는 소셜. 가입 즉시 인증 상태 확인 |
| S4. 봇 갤러리 | published 봇 프로필 카드 목록. 선택 시 세션 시작 |
| S5. 채팅 | 대화 UI + 이미지 생성 버튼. "생성 중…" 큐 상태 표시(순차 처리) |
| S6. 히스토리 | 과거 세션 재진입 |
| S7. 설정 | 계정, 탈퇴(데이터 삭제), 신고 기능 |
| A1. 운영자 콘솔 | 봇 프로필 CRUD, 모더레이션 로그 조회, 사용자 정지/차단 |

- **신고(report) 기능은 MVP 필수:** 문제 콘텐츠 발견 시 사용자가 신고 → 운영자 검토 파이프라인. 컴플라이언스상 반드시 있어야 함.

---

## 7. ⚠️ 법적 컴플라이언스 & 안전 가드레일 (핵심 섹션)

> **이 섹션은 서비스의 합법성을 결정합니다. 여기 명시된 항목이 빠지면 배포 금지입니다.**
> 성인향 서비스 자체는 합법이지만, 아래 세 가지가 무너지면 형사 처벌·서비스 폐쇄 대상이 됩니다: (A) 미성년 사용자 접근, (B) 미성년/불법 콘텐츠 생성, (C) 개인정보 위반.

### 7-A. 성인 인증 (Age Verification) — 국내 정보통신망법
- **체크박스 "만 19세 이상입니다"만으로는 위법 소지.** 실질적 본인확인(휴대폰 본인인증, 아이핀 등 인증기관 연동) 필수.
- 인증 미통과 사용자는 콘텐츠 화면에 **일절 진입 불가** (라우트 가드 서버단 강제).
- 청소년유해매체물 표시 의무 이행(19금 표시), 자체등급분류/심의 절차는 운영 주체가 법률 자문 후 처리 — 개발 측은 인증 게이트를 확실히 구현.

### 7-B. 미성년/불법 콘텐츠 생성 절대 차단 — 아동·청소년의 성보호에 관한 법률
> **이것이 최우선 가드레일입니다.** 필터 없는 모델(FLUX schnell + uncensored LLM)을 쓰기 때문에, 차단 책임은 100% 우리 애플리케이션에 있습니다.

- **입력 모더레이션:** 채팅·이미지 프롬프트 모두, AI 호출 **전에** 검사. 미성년 관련·아동 성적 묘사·기타 위법 카테고리 감지 시 즉시 차단 + `moderation_logs` 기록.
- **출력 모더레이션:** 생성된 텍스트·이미지도 반환 **전에** 재검사. 특히 이미지 출력에 대한 자동 스크리닝(별도 classifier) 필수.
- **차단 대상 카테고리(예시, 확정 목록은 법률 자문 반영):** 미성년자 묘사, 실존 인물 비동의 성적 합성, 성적 착취·인신매매 정황 등.
- **탐지 시 처리:** 콘텐츠 미생성/미반환 + 반복 위반 계정 자동 정지. 위법 정황은 관련 법령상 신고 의무 검토.
- **모더레이션 수단:** 전용 moderation API(텍스트/이미지 분류) 사용 권장. Atlas Cloud 또는 별도 안전 분류 API로 이중화. **"모델이 필터 없다"와 "서비스가 필터 없다"는 완전히 다른 것** — 서비스에는 반드시 필터가 있어야 함.

### 7-C. 봇 프로필 거버넌스
- 모든 봇 프로필은 **운영자 큐레이션 전용**(MVP에서 사용자 커스텀 생성 비활성).
- `character_age >= 18` DB 제약으로 미성년 캐릭터 등록 원천 차단.
- 프로필 외형/설정에 미성년을 암시하는 서술 금지 — 등록 시 운영자 검수 절차.

### 7-D. 개인정보 보호 — 개인정보보호법
- **최소 수집 원칙:** 성인 인증은 결과(boolean)와 인증기관 참조값만 저장, 신분증 원본·주민번호 등 저장 금지.
- 대화·이미지는 사용자 삭제/탈퇴 시 완전 삭제. 이미지 만료 정책(`expires_at`) 적용.
- 프롬프트 원문 대신 해시 저장 옵션(프라이버시 강화).
- 개인정보처리방침·이용약관 게시(운영 주체 준비, 개발 측은 동의 플로우 구현).

### 7-E. 결제 (2단계 과제)
- Stripe/PayPal 등 메이저 PG는 성인 콘텐츠 거부·계정 정지 리스크. 성인 콘텐츠 대응 PG를 별도 검토(운영 주체 계약 사안).
- 전자상거래법상 통신판매업 신고, 청약철회·환불 정책 필요.

### 7-F. 감사 추적 (Audit)
- `moderation_logs`로 차단 이력 보존 → 분쟁·수사 협조 시 대응 근거.
- 운영자 콘솔에서 로그 조회·사용자 제재 가능.

> **법률 자문 필수 고지:** 이 문서는 개발 착수용 기술 명세이며 법률 자문이 아닙니다. 청소년보호위원회 심의 절차, 결제·약관, 콘텐츠 등급 등 실제 사업화 전 **정보통신·성인콘텐츠 전문 변호사 자문**을 받으세요. 텍스트 기반 AI 생성물의 음란물 해당 여부는 국내 판례가 아직 정립되지 않은 회색지대라, 특히 초기 단계에서 확인이 필요합니다.

---

## 8. 단계별 로드맵

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| **P0. 기반** | Supabase 스키마 + Auth + 성인 인증 게이트 + RLS | 미인증 사용자 콘텐츠 접근 100% 차단 |
| **P1. 모더레이션 레이어** | 입력/출력 양방향 필터 + 로그 | 위법 카테고리 프롬프트가 AI에 도달하지 않음 (테스트 통과) |
| **P2. 채팅 루프** | 봇 선택 → LLM 대화 (컨텍스트 재전송, 큐) | 10명 순차 대화 정상 동작 |
| **P3. 이미지 루프** | FLUX schnell 연동 + 일일 상한 + 출력 스크리닝 | 이미지 생성·저장·만료 정상 |
| **P4. 운영자 콘솔** | 봇 CRUD, 로그 조회, 제재, 신고 처리 | 운영자가 문제 콘텐츠 대응 가능 |
| **P5. 검증** | 실사용 10명, 재방문·완성도 측정 | 확장(로컬 GPU/PG 고도화) 판단 근거 확보 |

- **P1을 P2·P3보다 먼저** 완성하세요. 모더레이션 없이 AI를 붙이면 그 자체가 리스크입니다.

---

## 9. Claude Code 작업 지침

- **P0 → P1 순서 엄수.** 인증 게이트와 모더레이션 레이어가 서기 전에는 AI 엔드포인트를 공개 라우트로 노출하지 마세요.
- 모든 AI 호출은 서버 라우트 핸들러 경유. **클라이언트에서 Atlas Cloud를 직접 호출하는 코드 금지**(키 노출).
- 모더레이션은 **미들웨어/유틸로 단일화**해 chat·image 라우트가 공통으로 통과하도록 구현. 우회 경로가 생기지 않게.
- 하드코딩된 시크릿 금지, `.env` 사용, `.gitignore` 확인.
- 봇 프로필 시드 데이터는 **성인 캐릭터로만** 생성. `character_age` 필드 누락 시 등록 실패하도록.
- TBD 항목(실제 model_name, PG사, 심의 절차)은 추측하지 말고 문서에 `TODO(운영주체 확인)`로 명시.

---

## 10. 에이전트 구성 (`agents/`)

이 프로젝트는 Claude Code에서 전문 서브에이전트로 분업합니다. **작업을 받으면 `CLAUDE.md` → `agents/orchestrator.md` 순으로 읽고 시작하세요.**

| 파일 | 에이전트 | 담당 | 주 단계 |
|---|---|---|---|
| `agents/orchestrator.md` | 오케스트레이터 | 총괄 조율, 위임, 단계 판단 | 전체 |
| `agents/safety-compliance.md` | **안전·컴플라이언스 ★** | 모더레이션·인증·법적 가드레일. 최종 검수 게이트 | P1 (+전 단계 검수) |
| `agents/fullstack-web-dev.md` | 풀스택 웹 개발 | Next.js 라우트·Supabase·비즈니스 로직 | P0·P2·P4 |
| `agents/ui-ux-designer.md` | UI/UX 디자인 | 화면·컴포넌트·인터랙션 | 전 화면 |
| `agents/atlas-integration.md` | Atlas Cloud 연동 | LLM·이미지 API 래퍼, 비용 가드 | P2·P3 |
| `agents/qa-safety-test.md` | QA·안전 테스트 | 기능 테스트 + 가드레일 우회 회귀 테스트 | P5 (+수시) |

### 협업 규칙
- **오케스트레이터가 진입점**입니다. 작업 성격에 따라 전문 에이전트에 위임합니다.
- **`safety-compliance`는 최종 검수 게이트**입니다. AI 호출·인증·개인정보·봇 프로필이 관여하는 모든 산출물은 이 에이전트의 검수를 통과해야 머지·배포됩니다.
- 어떤 에이전트도 (1) 모더레이션/인증 우회, (2) API 키 클라이언트 노출, (3) 미성년·불법 콘텐츠 처리 로직 약화를 하지 않습니다. 그런 요청이 오면 이유를 설명하고 거절합니다.
- 각 에이전트는 자신의 정의 파일에 명시된 "필수 선행 절차"에 따라 `CLAUDE.md`의 해당 섹션을 먼저 읽습니다.

### 실행 순서 권장
```
CLAUDE.md 읽기
   ↓
orchestrator.md 로드 → 작업의 로드맵 단계 판단
   ↓
P0: fullstack-web-dev (스키마+인증) ── safety-compliance 검수
   ↓
P1: safety-compliance (모더레이션 레이어)  ← AI 연동보다 먼저
   ↓
P2: atlas-integration + fullstack-web-dev (채팅) ── safety-compliance 검수
   ↓
P3: atlas-integration + ui-ux-designer (이미지) ── safety-compliance 검수
   ↓
P4: fullstack-web-dev + ui-ux-designer (운영자 콘솔)
   ↓
P5: qa-safety-test (전체 회귀 + 안전 우회 테스트)
```

---

## 부록: 미확정(TBD) 항목 — 착수 전 운영 주체가 확정

- [ ] Atlas Cloud 실제 endpoint / uncensored LLM model_name / 이미지 model_name
- [ ] 성인 인증 연동 기관 (휴대폰 본인인증 / 아이핀 provider)
- [ ] moderation API 채택 (텍스트/이미지 분류기)
- [ ] 결제 PG (성인 콘텐츠 대응)
- [ ] 청소년유해매체물 심의/표시 절차 (법률 자문)
- [ ] 이용약관 / 개인정보처리방침 확정본
