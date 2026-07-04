# DEPLOYMENT.md — 정상 배포 가이드

코드 기준 솔루션을 **로컬 PoC → 상용 배포**로 올리는 절차. CLAUDE.md 8절 로드맵의
P0~P4를 실제 인프라에 얹는다. 안전 게이트(7절)를 만족하지 못하는 빌드는 배포 대상이 아니다.

---

## 0. 배포 위상 — 무엇이 어디서 도는가

앱 코드(Next.js)는 어디에 올리든 **모델 백엔드를 env로 주입**받는다. 그래서 배포는
"앱을 올린다 + 백엔드 3종의 주소를 채운다"로 끝난다.

```
[Vercel]  Next.js 앱 (UI · API 라우트 · 인증 게이트 · 모더레이션 미들웨어)
   │   서버리스라 로컬 모델(Ollama/mflux)을 못 돌린다 → 아래 3종은 외부 주소로 연결
   ├── ATLAS_LLM_BASE_URL      → 텍스트 LLM (OpenAI 호환)
   ├── ATLAS_IMAGE_BASE_URL    → 이미지 생성 (photoreal/anime 분기)
   └── MODERATION_IMAGE_URL    → 출력 이미지 스크리닝(미성년/불법 검출)
[Supabase]  Postgres(RLS) · Auth · Storage(생성 이미지)
```

> 핵심: `flux-local/*.py`(Ollama·mflux·Animagine·llava)는 **로컬 PoC 전용**이다.
> Vercel 위에서는 못 돈다. 상용에서는 §3의 호스티드 API 또는 자체 GPU로 교체한다.

---

## 1. Supabase (DB · Auth · Storage)

1. 프로젝트 생성 후 SQL Editor에서 **마이그레이션을 순서대로** 실행:
   `0001_init → 0002_storage → 0003_persona → 0004_gallery → 0005_harden →
    0006_character_images → 0007_rolling_summary → 0008_character_image_style`
2. 시드: `supabase/seed.sql` 실행 → 캐릭터(Rin 실사 / Yuna 애니) + 시나리오 6종.
3. Storage 버킷 확인: `generated-images`, `character-images`(0002/0006에서 생성). 둘 다 **private**.
4. Auth: 이메일(또는 소셜) 활성화. 가입 후 성인 인증 게이트(`is_adult_verified`)로 콘텐츠 접근 제어.
5. 운영자 지정: `insert into public.admins (user_id) values ('<가입한 uuid>');`
6. 대표 이미지: Rin/Yuna 아바타는 바이너리라 시드에 없다. 운영자 콘솔(A1)에서 캐릭터별
   대표컷을 업로드하거나, `character-images`에 승인(approved) 레코드로 올린다.

키 확보: Project Settings → API → `URL`, `anon key`, `service_role key`(server-only).

---

## 2. Vercel (앱)

1. GitHub 저장소(`hotmainlomaion/jikbakguri`)를 Vercel에 import. 프레임워크 자동 감지(Next.js).
2. **Environment Variables**에 `.env.local.example`의 키를 채운다(값은 §1 Supabase + §3 모델).
   - `NEXT_PUBLIC_*`는 클라이언트 노출됨(정상). `SUPABASE_SERVICE_ROLE_KEY`·모델 API 키는
     **절대 `NEXT_PUBLIC_` 접두어를 붙이지 말 것**(4-C: 서버 라우트에서만 사용).
   - `DEMO_EMAIL`/`DEMO_PASSWORD`는 **비워둔다**(상용에서 데모 로그인 비활성).
3. Build: 기본값(`next build`). 추가 설정 불필요(현재 빌드·타입체크·테스트 green).
4. 배포 후 도메인 연결 + 19금 표시(S1) 확인.

---

## 3. 모델 백엔드 — 로컬 PoC ↔ 상용 전환

앱은 백엔드를 몰라도 된다. 아래 표의 주소/키만 env에 바꿔 끼우면 된다.

| 구간 | 텍스트(ATLAS_LLM_*) | 이미지(ATLAS_IMAGE_*) | 출력 스크리닝(MODERATION_IMAGE_*) |
|---|---|---|---|
| **로컬 PoC** | Ollama `eva-qwen2.5-14b` @ `:11434/v1` | `image-server.py` @ `:8080` (FLUX schnell + Animagine) | `moderation-server.py` @ `:8081` (llava) |
| **상용 호스티드 API** | uncensored LLM API (Featherless/Infermatic 등, OpenAI 호환) | GPU 서버리스(Novita/RunPod) 또는 호스티드 NSFW 이미지 API | vision 분류 API(미성년 검출) |
| **상용 자체 GPU** | vLLM/TGI로 32B~72B RP 파인튜닝 서빙(OpenAI 호환) | GPU box에 ComfyUI/Forge, `{prompt,style,seed}` 어댑터 | 자체 vision classifier 서비스 |

### 이미지 백엔드 승급 (`IMAGE_PROVIDER`)
로컬 SDXL(애니)은 16GB Mac에서 요청당 ~500s로 실사용 부적합 → **GPU/호스티드로 승급**하면 수초대.
앱의 `lib/atlas/image.ts`가 프로바이더를 분기하므로 env 한 줄로 전환:

| IMAGE_PROVIDER | 방식 | 승급 절차 | 코드 변경 |
|---|---|---|---|
| `local`(기본) | 커스텀 계약 `POST {prompt,style,seed,steps}→{b64\|url}` | 동일 `image-server.py`(또는 ComfyUI/A1111 래퍼)를 **GPU(RunPod/Vast/전용)**에 올리고 `ATLAS_IMAGE_BASE_URL`만 그 주소로 | **0** |
| `novita` | Novita.ai 호스티드(NSFW 허용) async txt2img→task-result | `NOVITA_API_KEY` + `NOVITA_MODEL_PHOTOREAL`/`NOVITA_MODEL_ANIME`(카탈로그 체크포인트명) 설정 | 0 (어댑터 내장) |

- **가장 빠른 승급(코드 0)**: 자체 GPU에 로컬과 동일한 이미지 서버 계약을 올리고 URL만 교체. `image_style`/`image_seed`(0008) 일관성 그대로.
- **인프라 최소 승급**: `IMAGE_PROVIDER=novita` — GPU 운영 없이 호스티드. 모델명은 NSFW 허용 체크포인트로(실사 SDXL/FLUX, 애니 Pony/Illustrious). 실측 전 대시보드에서 model_name·성인정책 확인 `TODO(운영주체)`.
- 어느 경로든 캐릭터 `style`로 photoreal(FLUX/실사)·anime(Pony/Illustrious/Animagine)를 분기하고, 반환 이미지는 기존 **출력 스크리닝(llava/vision) + expires_at 만료 + /api/cron/purge**를 그대로 통과.

- 이미지 백엔드 계약(local): `POST { prompt, style:'photoreal'|'anime', seed, steps } → { b64 }` 또는 `{ url }`.
  캐릭터의 `image_style`/`image_seed`(0008)가 이 분기와 일관성을 만든다.
- 라이선스: FLUX schnell(Apache) · Animagine XL 4.0(Open RAIL++-M) 상업 사용 가능. 자체호스팅 시
  각 체크포인트 라이선스 재확인(부록 TBD, decision report 참조).
- 상세 후보·비용·리스크 비교는 별도 리서치 리포트([docs/model-research.md](docs/model-research.md)) 참조.

---

## 4. ⚠️ 배포 전 안전·컴플라이언스 체크리스트 (7절 — 미충족 시 배포 금지)

- [ ] **인증 게이트**: 미인증 사용자가 `/gallery`·`/chat`·API에 접근 시 100% 리다이렉트/차단(서버단).
- [ ] **입력 모더레이션**: 채팅·이미지 프롬프트가 AI 호출 **전** heuristicScan(미성년/불법) 통과. 위반 시 차단+`moderation_logs`.
- [ ] **출력 스크리닝**: 이미지 반환 **전** `MODERATION_IMAGE_URL` 검사. **미설정 시 fail-closed(전부 차단)** — 상용에선 반드시 설정.
- [ ] **미성년 하드리밋 유지**: "성인 검열 해제"와 무관하게 미성년/CSAM 검출은 제거 금지(법적 하한, 7-B).
- [ ] **캐릭터 거버넌스**: 모든 봇 `character_age >= 18`(DB CHECK), 운영자 큐레이션 전용(사용자 커스텀 봇 비활성).
- [ ] **개인정보 최소화**: 인증은 결과+참조값만 저장(신분증 원본 금지), 프롬프트는 해시 저장, 이미지 `expires_at` 만료.
- [ ] **키 보안**: 모델/서비스롤 키가 클라이언트 번들·git에 없음(`.env.local` gitignore, `NEXT_PUBLIC_` 오용 없음).
- [ ] **비용 가드**: `DAILY_IMAGE_LIMIT`·`CHAT_RATE_PER_MIN` 서버 강제, 월 예산 알림.
- [ ] **신고·감사**: 신고(S7)→운영자 검토 파이프라인, `moderation_logs` 보존.

> 법률 자문 고지(7절): 청소년보호위 심의·약관·결제·콘텐츠 등급은 사업화 전 전문 변호사 자문 필수.
> 개발 측 책임은 위 게이트를 확실히 구현하는 것.

---

## 5. 배포 후 검증(스모크)

1. 미인증 계정으로 `/gallery` 직접 접근 → 차단/리다이렉트 확인.
2. 성인 인증 통과 계정 → 갤러리에 Rin(실사)·Yuna(애니) 카드+아바타 노출, 시나리오 선택 동작.
3. 채팅: 캐릭터 말투 일관성(Rin 발랄 반말 / Yuna 나긋 몽환), 롤링 요약으로 맥락 유지.
4. 이미지: 캐릭터별 스타일(Rin photoreal / Yuna anime)·seed 일관성, 미성년/불법 프롬프트 차단 로그.
5. 운영자 콘솔(A1): 봇 CRUD·모더레이션 로그·사용자 제재 동작.

---

## 부록: 로컬 PoC 재현(현재 스택)

```bash
# 1) 모델 서버 (별도 터미널)
cd ~/Desktop/flux-local && ./start-servers.sh      # image :8080, moderation :8081
ollama serve                                        # LLM :11434 (eva-qwen2.5-14b)
# 2) 앱
cd 직박구리 && cp .env.local.example .env.local     # 로컬 기본값 그대로 사용 가능
npm install && npm run dev                          # http://localhost:3000
```
