# 직박구리 클라우드 배포 런북 (지인 비공개 테스트용)

로컬(Mac)에서 돌리던 **챗 LLM·이미지 생성·이미지 모더레이션을 전부 클라우드로 옮기고**, Next.js 앱을 **Vercel**에 올려 지인이 URL로 접속·피드백하게 하는 절차. Supabase(DB/Auth/Storage)는 이미 클라우드라 그대로 재사용한다.

> 코드는 이미 클라우드 대응이 끝나 있음: LLM은 OpenAI 호환 `baseURL`만 교체, 이미지는 `IMAGE_PROVIDER=novita` 어댑터, 이미지 모더레이션은 클라우드 비전 경로 추가됨. **당신이 할 일은 계정 가입 → 키 발급 → Vercel에 env 입력 → 배포**뿐.

---

## 0. 준비물
- GitHub 계정(이미 있음 — repo: `hotmainlomaion/jikbakguri`)
- 결제 가능한 카드(LLM/이미지 API 사용료. 지인 소규모면 월 몇 천~몇 만 원)

---

## 1. 챗 LLM 클라우드 (무검열 + 한국어)

로컬 `aya-expanse-abliterated`를 대체. **두 갈래 중 택1.**

### A. Featherless.ai (정액제 — 원가 예측 쉬움)
> ⚠️ **로컬 `aya-expanse-abliterated`는 Featherless에 못 올림.** Aya는 Cohere 아키텍처인데 Featherless는 Llama/Qwen/Mistral 파생만 지원. (그래서 검색 0건 — 오타 아님) → **Qwen2.5 abliterated로 교체**.
1. https://featherless.ai → 회원가입 → 결제수단 등록(구독제. Basic $10=~15B까지 / Premium $25=72B까지 — [pricing](https://featherless.ai/pricing)에서 확인).
2. 대시보드에서 **API Key** 발급 → 복사.
3. 모델 검색창에 아래 중 하나 입력 → **model id** 복사:
   - `huihui-ai/Qwen2.5-32B-Instruct-abliterated` (품질↑, Premium 요금)
   - `huihui-ai/Qwen2.5-14B-Instruct-abliterated-v2` (Basic 요금)
4. Vercel env(3단계)에 입력:
   - `ATLAS_LLM_BASE_URL=https://api.featherless.ai/v1`
   - `ATLAS_LLM_API_KEY=<발급키>`
   - `ATLAS_LLM_MODEL=<복사한 model id>`
5. ⚠️ 한국어 NSFW 톤이 aya만 못하면 → B(OpenRouter)나 자체 vLLM 서빙 고려.

### B. OpenRouter (모델 다양, 카드 종량제)
1. https://openrouter.ai → 로그인 → **Credits**에 소액 충전($10) → **Keys**에서 API Key 발급.
2. https://openrouter.ai/collections/roleplay 에서 **무검열 RP 모델** 선택(예: `neversleep/llama-3-lumimaid-70b`). ⚠️ **한국어 품질은 모델마다 다르니 2~3개 테스트**(아래 5단계 검증).
3. Vercel env:
   - `ATLAS_LLM_BASE_URL=https://openrouter.ai/api/v1`
   - `ATLAS_LLM_API_KEY=<발급키>`
   - `ATLAS_LLM_MODEL=<선택 모델 id>`

> **이미지 프롬프트 번역 모델**(선택): `ATLAS_IMAGE_PROMPT_MODEL=`에 영문 잘 뽑는 저렴 모델(예 OpenRouter `openai/gpt-4o-mini`)을 지정. 미지정 시 위 챗 모델을 그대로 사용.

---

## 2. 이미지 생성 클라우드 (NSFW 허용) — Novita

로컬 Lustify/Animagine 서버를 대체.
1. https://novita.ai → 회원가입 → 결제수단 등록(종량제, 장당 수십 원).
2. **Settings > Key Management**에서 **API Key** 발급 → 복사.
3. **Model 목록(txt2img)**에서 쓸 체크포인트의 `model_name`을 복사:
   - 실사: NSFW 실사 SDXL(예: CyberRealistic/RealVisXL 계열).
   - 애니: NSFW 애니 SDXL(예: Animagine/Pony 계열).
4. Vercel env:
   - `IMAGE_PROVIDER=novita`
   - `NOVITA_API_KEY=<발급키>`
   - `NOVITA_MODEL_PHOTOREAL=<실사 model_name>`
   - `NOVITA_MODEL_ANIME=<애니 model_name>`
5. 캐릭터 아바타/히어로 이미지는 이미 Supabase에 저장돼 있어 재생성 불필요. (새 캐릭터 추가 시에만 Novita로 재생성)

---

## 3. 이미지 출력 모더레이션 (미성년만 차단, 성인 통과)

로컬 llava가 클라우드엔 없음. **택1** (택 안 하면 프로덕션은 안전상 모든 이미지 차단됨):

- **권장**: `MODERATION_VISION_MODEL=<비전 지원 모델 id>` 지정(OpenRouter/OpenAI 비전 모델). base/key 미지정 시 `ATLAS_LLM_*` 재사용. → 클라우드 비전이 미성년만 잡고 성인은 통과.
- **빠른 시작(지인 비공개 한정)**: `IMAGE_SCREENING_FAILOPEN=1`. 출력 스크리너만 잠시 통과시키되, **입력측 미성년 필터(heuristicScan)·`character_age>=18`·운영자 큐레이션 봇은 계속 활성**. ⚠️ 공개/확대 전 반드시 위 '권장'으로 교체.

---

## 4. 코드 GitHub에 반영

Vercel은 GitHub repo를 빌드하므로 최신 코드를 push해야 함(현재 미커밋 존재).
```bash
git add -A
git commit -m "cloud deploy: hosted LLM/image + economy + UI"
git push origin feat/chat-memory-local-backends
```
(원하면 main 브랜치로 병합해서 배포해도 됨.)

---

## 5. Vercel 배포

1. https://vercel.com → GitHub로 로그인 → **Add New… > Project**.
2. `hotmainlomaion/jikbakguri` repo **Import** → Framework는 자동으로 **Next.js** 감지.
3. **Environment Variables** 섹션에 [.env.production.example](.env.production.example)의 키들을 **실제 값으로** 입력(NEXT_PUBLIC_* + 위 1~3단계 키 전부). 특히:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (로컬 .env.local 값 그대로)
   - LLM/이미지/모더레이션 키(1~3단계)
   - `IMAGE_UNLIMITED_EMAILS`, `PAYMENTS_DEV_TOPUP=1`, 한도값들
4. **Deploy** 클릭 → 1~3분 후 `https://<프로젝트>.vercel.app` URL 발급.
5. (이미지/챗이 느려 60초 넘게 걸리면) Vercel **Pro**로 올리고 `app/api/chat/route.ts`·`app/api/image/route.ts`의 `maxDuration`을 300으로. Hobby(무료)는 60초 상한.

---

## 6. Supabase Auth 리다이렉트 등록 (로그인 작동시키기)

1. https://supabase.com/dashboard → 프로젝트 → **Authentication > URL Configuration**.
2. **Site URL**: `https://<프로젝트>.vercel.app`
3. **Redirect URLs**에 추가: `https://<프로젝트>.vercel.app/auth/callback`
4. (이메일 매직링크는 Supabase 기본 메일러로 발송됨 — 소규모면 충분. 대량이면 SMTP 연결.)

---

## 7. 지인 접속 & 확인

- **접속**: 지인에게 `https://<프로젝트>.vercel.app` 공유.
- **로그인**: 이메일 매직링크로 가입. (또는 데모 계정 `demo@jikbakguri.dev` 공유 — 무제한/차감 면제)
- **성인 게이트**: 현재 `is_adult_verified` 체크. 지인 테스트용으로 가입 즉시 통과시키려면 Supabase에서 해당 유저 `users.is_adult_verified=true`로 수동 설정(또는 `/verify` 플로우 유지).
- **크레딧**: 신규 가입 시 환영 300 크레딧 자동 지급. 부족하면 상단 잔액 → 충전(dev 즉시충전) 또는 무제한 이메일에 추가.
- **검증 체크리스트**: 로그인 → 캐릭터 선택 → 채팅 응답(클라우드 LLM) → 이미지 생성(Novita) → 잔액 차감 → 관계 레벨업.

---

## 8. 비용·안전 가드
- `DAILY_IMAGE_LIMIT`(기본 20)·`CHAT_RATE_PER_MIN`·크레딧 차감으로 폭주 방지. 지인 규모면 넉넉.
- Novita/LLM 대시보드에서 **월 예산 알림/상한** 설정 권장.
- `PAYMENTS_DEV_TOPUP=1`은 무료 크레딧이 무한 충전되므로 **공개 시 반드시 제거**.
- `vercel.json` 크론(`/api/cron/purge`, 매일 03:00)이 만료 이미지 정리. Vercel이 자동 스케줄.

---

## ⚠️ 법적 (요약 — 지인 비공개 테스트라도)
- 성인인증(본인확인) 게이트는 공개 전 **본인확인기관 연동(NICE/KCB 휴대폰 본인인증)**으로 승격 필요.
- 콘텐츠 수위(특히 실사 노골 이미지)의 음란물 리스크는 별도 — 공개 전 전문 변호사 확인.
- 지인 비공개 소규모 피드백 단계에선 기술 검증에 집중하되, 위 항목을 공개 전 체크리스트로.
