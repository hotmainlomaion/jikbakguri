# 페르소나 일관성 솔루션 (Persona Consistency MCP)

> 이 서비스의 핵심은 "소비자가 **어떤 프로필의 AI**와 대화하는가"의 일관성이다.
> 봇의 정체성·말투·기억·경계를 **단일 진실원천(SSOT)**에 두고, 세션 전반에서 흔들리지 않게 강제한다.
> 형태: **인프로세스 코어 1개 + MCP 서버 래퍼**(한 코어, 두 진입점).

---

## 1. 문제 정의

Atlas Cloud LLM은 무상태(stateless)라 매 요청 컨텍스트를 재전송한다. 프롬프트를 ad-hoc으로
이어붙이면 봇이 이름/나이/말투/설정을 조금씩 흘리고(드리프트), 운영자가 프로필을 수정하면
진행 중 대화가 갑자기 딴사람이 된다. 이 서비스의 상품성은 "일관된 캐릭터"이므로 이 드리프트가
곧 이탈로 이어진다.

**일관성 5축**
1. 정체성 캐논 — 이름·나이(18+)·배경·관계 (불변)
2. 말투/보이스 — 어조·언어·버릇
3. 기억 — 대화 중 확립된 사실(사용자 이름/취향, 관계 진전)
4. 경계 — in-character 거절선 + 안전선(미성년 절대 금지 등)
5. 행동 규칙 — 요청 유형별 반응

---

## 2. 아키텍처 — 한 코어, 두 진입점

```
                    ┌──────────────────────────────┐
                    │  lib/persona/core.ts (SSOT)   │
                    │  getPersonaPrompt             │
                    │  getSessionCanon / pin        │
                    │  get/recordCharacterMemory    │
                    │  checkConsistency             │
                    │  extractDurableFacts          │
                    └──────────────┬───────────────┘
                     import        │        노출(wrap)
              ┌────────────────────┘        └────────────────────┐
              ▼                                                   ▼
   app/api/chat/route.ts (직접 호출)              mcp/persona-server.ts (MCP)
   실서비스 채팅 루프에 통합                       resources: persona://{sessionId}/canon
                                                  tools: get_persona_prompt,
                                                         get_character_memory,
                                                         record_character_memory,
                                                         check_consistency
```

- **왜 MCP인가:** 페르소나 정의를 표준·버전드·디커플드 계약 뒤에 두어, chat 라우트뿐 아니라
  이미지 라우트·운영자 프리뷰·향후 에이전트가 **같은 진실원천**을 재사용하게 한다.
- **왜 인프로세스 코어도인가:** 10명 MVP에 별도 데몬 상시 운영 부담을 지지 않으면서도 MCP 계약을
  확보. 코어는 한 벌, MCP는 그 위의 얇은 래퍼라 로직 이중화가 없다.

---

## 3. 일관성 메커니즘

### 3-A. 캐논 스냅샷 핀 (세션 수명 고정)
- 세션 생성 시 현재 봇 `canon`을 `sessions.persona_snapshot`에 **스냅샷**하고 `persona_version`을 핀.
- 이후 모든 프롬프트는 라이브 `bot_profiles`가 아니라 **스냅샷**에서 합성.
- ⇒ 운영자가 도중에 프로필을 고쳐도 진행 중 대화는 흔들리지 않는다. 새 세션부터 새 캐논 적용.
- 캐논 편집 시 `bump_persona_version` 트리거가 버전을 올림(추적/감사).

### 3-B. 결정론적 프롬프트 합성
- `composeSystemPrompt(canon, memory)` 한 곳에서만 system 프롬프트를 조립. 문자열 concat 산개 금지.
- 정체성 → 배경 → 관계 → 보이스 → 불변 사실 → 경계 → **연속성 기억** → in-character 고정 지시.

### 3-C. 캐릭터 기억(연속성)
- `character_memory` 테이블: 세션별 확립 사실. 다음 턴 프롬프트에 재주입 → "기억하는" 느낌.
- `extractDurableFacts`가 사용자 메시지에서 지속 사실을 휴리스틱 추출(이름/취향 등).
  확장점: LLM 기반 추출로 정확도 향상 가능.

### 3-D. 응답 일관성 검사 + 재생성 루프
- LLM 초안 → `checkConsistency(canon, draft)`:
  - `age_or_minor` (**hard**) — 봇이 미성년을 자칭/암시 → 재생성 불가, 차단.
  - `identity_contradiction` / `canon_contradiction` / `out_of_voice` (**soft**) — 교정 지시 후 1회 재생성.
- chat 라우트 루프: soft 위반이면 교정 system 메시지를 붙여 1회 재생성, 그래도 안 되면 마지막 초안 채택.

---

## 4. 안전 정렬 (CLAUDE.md 7-B) — 필수

> **이 솔루션은 moderation을 대체하지 않는다.** 불법 카테고리 최종 판정 권한은 `lib/moderation`.

- `checkConsistency`의 `age_or_minor`/경계 체크는 moderation과 **별개의 추가 방어**이지 우회가 아니다.
  chat 라우트는 재생성 여부와 무관하게 **반환 전 항상 출력 moderation**을 통과시킨다.
- `assertAdultCanon`: `canon.identity.age < 18`이면 예외 → 세션 시작/스냅샷 자체를 거부.
  DB의 `character_age >= 18` CHECK와 이중 강제.
- 기억 저장 전 `heuristicScan` 백스톱 재검사 — 미성년/불법 흔적 사실은 저장 거부.
- 기억은 **사용자별 비공개**(RLS), 세션/계정 삭제 시 cascade 완전 삭제(7-D).
- MCP 서버는 서버 사이드 전용. API 키/서비스롤 클라이언트 노출 없음.

---

## 5. 인터페이스 계약 (MCP)

| 종류 | 이름 | 입력 | 반환 |
|---|---|---|---|
| resource | `persona://{sessionId}/canon` | — | 고정 캐논 JSON |
| tool | `get_persona_prompt` | `sessionId` | 합성 system 프롬프트 |
| tool | `get_character_memory` | `sessionId` | 기억 배열 |
| tool | `record_character_memory` | `sessionId, userId, items[]` | `{stored:n}` |
| tool | `check_consistency` | `sessionId, draftReply` | `{ok, violations[]}` |

`canon` 스키마: `lib/persona/types.ts`의 `PersonaCanon`
(`identity{name,age,backstory,relationships}`, `voice{register,tics,language}`, `appearance`,
`boundaries[]`, `canon_facts[]`).

---

## 6. 데이터 모델 변경 (`supabase/migrations/0003_persona.sql`)

- `bot_profiles.canon jsonb`, `bot_profiles.persona_version int` (+ 편집 시 버전 자동 증가 트리거)
- `sessions.persona_snapshot jsonb`, `sessions.persona_version int` (일관성 핀)
- `character_memory` 테이블 (+ RLS: 본인 세션만 조회)

---

## 7. 실행 / 통합 현황

- **통합됨:** `app/api/chat/route.ts`가 코어를 직접 사용(프롬프트 합성 + 재생성 루프 + 기억 기록),
  `app/api/session/route.ts`가 세션 생성 시 캐논 스냅샷 핀, `app/api/admin/bots`가 canon 구성.
- **MCP 서버:** `npm run mcp:persona` (stdio, tsx). Supabase 환경변수 필요.
- **테스트:** `lib/persona/core.test.ts` (캐논 18+ 강제, 일관성 검사, 기억 추출).

## 8. 확장 로드맵 (이후)

- `check_consistency` LLM 저지 추가(soft 판정 정밀화) — 옵트인, moderation과 분리 유지.
- 기억 추출 LLM화, 기억 요약/감쇠(오래된 사실 압축).
- 이미지 라우트도 `canon.appearance`를 SSOT로 사용(현재 `appearance_desc` 병행).
- MCP Streamable HTTP 전송으로 승격(크로스 서비스 재사용 필요 시).
- 운영자 콘솔에 canon 구조 편집 UI(현재 기본 필드→canon 자동 구성).
