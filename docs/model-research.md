# 성인향 AI 챗+이미지 SaaS 모델 의사결정 리포트 (2026년 중반 기준)

> 대상 하드웨어: Apple M5 16GB. 현재 로컬: Ollama `qwen2.5-abliterate:14b` + mflux(FLUX schnell) + llava.
> 관점: 로컬 개발 → 상용화(자체 호스팅 / 호스티드 API). 핵심 제약: **NSFW 생성능력 + 한국어 + 상업 라이선스**.
> 주의: 미성년/불법 차단은 CLAUDE.md 7-B대로 **앱 레이어(입출력 양방향 moderation) 책임**. "모델 uncensored ≠ 서비스 uncensored". 아래 모델 선택과 무관하게 이 게이트가 선행돼야 함.

---

## 1. 3줄 요약

1. **챗 LLM**: "한국어 최상급(EXAONE·Gemma)"은 상업 성인 서비스 라이선스로 막혀 있어, 상용 가능 교집합은 사실상 **Qwen2.5 기반(EVA-Qwen2.5-14B 등, Apache-2.0)** 또는 **Mistral-Nemo/Small 기반**뿐이며 한국어는 후처리·프롬프트로 보정해야 한다. 즉시 개선안은 abliteration 부작용이 있는 현재 모델을 **EVA-Qwen2.5-14B로 교체**하는 것.
2. **이미지**: 실사는 커스텀 SDXL(라이선스 개별 확인) 또는 **Chroma(FLUX schnell 기반, Apache-2.0)**, 애니는 품질=NoobAI/WAI지만 **상업 라이선스가 깨끗한 건 Animagine XL 4.0(Open RAIL++-M)**뿐. 현재 FLUX schnell(Apache-2.0)은 라이선스는 최고지만 실사 NSFW 품질이 약하므로 **Chroma 도입**이 라이선스·품질 균형의 최적.
3. **상용화 최대 병목은 모델이 아니라 결제 PG(Stripe/PayPal 불가)와 한국 본인확인·규제**이며, 이는 운영주체 계약·법률자문 사안(미확인 항목 다수).

---

## 2. 챗 LLM 비교표 (구간 × 후보)

### 2-A. 로컬 개발 (M5 16GB, Ollama/MLX)

| 후보 | 크기/요구사양 | 한국어 | NSFW 능력 | 상업 라이선스 | 비용 | 리스크 |
|---|---|---|---|---|---|---|
| **EVA-Qwen2.5-14B v0.2** (추천) | 14B, Q4≈8~9GB. 16GB에선 컨텍스트 4K~8K 제한 | 보통(Qwen 한계 상속, 중국어 누출 가능) | RP 특화, 장문 코히어런스 강점 | **Apache-2.0 (모델카드 명시)** | 무료(로컬) | 16GB 컨텍스트 빡빡, 한국어 특화 아님 |
| **Mistral-Nemo-12B RP** (Lyra/Celeste/RPMax) | 12B, Q4~Q5. 128K 컨텍스트, 16GB 여유 최상 | 지원(특화 아님, 데이터 소량) | RP 파인튜닝 다수 | **Apache-2.0** | 무료 | 한국어 후기 빈약(미확인) |
| **huihui qwen2.5-abliterate 14B** (현재) | 14B, Q4 | 보통, 중국어/한자 누출 리스크 | abliteration=거부제거 | Apache-2.0(베이스) | 무료 | 언어 누출·지시준수 저하, 반복 |
| EXAONE 3.5/4.x | 7.8B~ | **최상(한국어 특화, KMMLU 0.458>Qwen2.5)** | 검열 있음 | ❌ **NC(비상업)** | — | 상용 배제(LG 별도계약) |
| Gemma abliterated | 4B~27B | **우수** | abliterated | ❌ **Gemma ToU: 성적 챗봇 명시 금지** | — | 상용 배제 |

출처: [EVA-Qwen2.5-14B v0.2](https://huggingface.co/EVA-UNIT-01/EVA-Qwen2.5-14B-v0.2) · [Qwen2.5-14B LICENSE(Apache)](https://huggingface.co/Qwen/Qwen2.5-14B-Instruct/blob/main/LICENSE) · [Mistral NeMo(Apache)](https://mistral.ai/news/mistral-nemo/) · [EXAONE LICENSE(NC)](https://huggingface.co/LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct/blob/main/LICENSE) · [Gemma Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy) · [abliteration 중국어 누출 사례](https://lilting.ch/en/articles/qwen35-abliterated-ollama-experiment) · [arca.live Qwen 한국어 지적](https://arca.live/b/alpaca/157846222)

### 2-B. 상용 자체 호스팅 (자체 GPU)

| 후보 | 크기/요구사양(4bit) | 한국어 | NSFW 능력 | 상업 라이선스 | 비용 | 리스크 |
|---|---|---|---|---|---|---|
| **Magnum v4 72B** | 72B, Q4≈40~44GB. A100 80GB 1장 넉넉 | Qwen 베이스라 상대 유리(미확인) | RP/창작 특화 | 베이스(Qwen2.5-72B) 따름 — 확인 필요 | GPU CAPEX | 한국어 RP 벤치 부재 |
| **Qwen2.5-72B abliterated** | 72B, Q4≈40~48GB | Qwen 다국어(한국어 포함) | 거부 제거 | Qwen 라이선스(72B는 별도, 확인) | GPU CAPEX | abliteration 부작용 |
| **EVA-Qwen2.5-32B** | 32B, Q4≈20GB↑ | Qwen 베이스 | uncensored RP | **Apache-2.0** | 중형 GPU | 한국어 특화 아님 |
| **Dan's PersonalityEngine 24B** | 24B, Q4≈14~16GB | 문서상 **KO 포함 다국어 학습 명시** | RP·스토리·툴 | Mistral-Small 베이스 확인 | 중형 GPU | 실제 한국어 품질 미확인 |
| Behemoth 123B / Midnight-Miqu 70B | 123B: 2×80GB / 70B: 40GB↑ | **약함(Mistral/Llama2)** | 프로즈 품질 최상급 | Miqu=**유출웨이트 파생, 상업 리스크** | 대형 CAPEX | 한국어 열세 + 라이선스(Miqu) → 배제 권장 |

**VRAM 경험칙**: 4bit ≈ 파라미터 × 0.5~0.6GB + KV캐시. 72B Q4 ≈ 40~44GB. 123B는 2×80GB 또는 4×48GB 텐서병렬.
출처: [Magnum v4 72B 사양](https://aimlapi.com/models/magnum-v4-72b-api) · [VRAM 치트시트](https://insiderllm.com/guides/vram-requirements-local-llms/) · [SillyTavern 선호모델 gist(Miqu 유출계열 명시)](https://gist.github.com/swyxio/324fc884061bf20e97a2ecbe59bae34a) · [Qwen2.5 다국어(KMMLU) 기술보고서](https://arxiv.org/pdf/2412.15115)

### 2-C. 상용 호스티드 API (NSFW 허용)

| 제공사 | 과금/대략가격 | 한국어(제공 모델) | NSFW 실허용 | 상업 리스크 | 비고 |
|---|---|---|---|---|---|
| **Featherless** | 정액 무제한 $25/$100/$200월 | Qwen 계열 有 | 사실상 허용(uncensored 다수) | 낮음(명시정책 미공개=미확인) | 40,000+ 모델 |
| **Infermatic** | flat $9/$16/$20월 | 모델 따라 | 허용(RP 특화, ST연동) | 낮음 | Euryale·Magnum |
| **Arli AI** | 정액 무제한·무로그 $10~$88월 | Qwen-3.5-27B-Derestricted 등 | **명시적 unrestricted 지향** | 낮음(로그 미보관 표방) | 명문 NSFW 문구는 미확인 |
| **Mancer** | 크레딧 ~$3.6~4.0/1M | Magnum(Qwen)·GLM 有 | **unfiltered 표방** | 낮음 | Magnum 72B v4 제공 |
| **NovelAI** | 구독 $10/$15/$25월 | 자체모델(한국어 약할 소지) | 성인 verified 무검열·미로그 | 매우 낮음 | 폐쇄형(외부모델 불가) |
| **OpenRouter** | 토큰당(모델별) | 라우팅 모델 따라 | 부분 허용(self-moderated) | 중(프로바이더별 정책 변동) | 폴백 용도 권장 |
| Together | 토큰당 저가 | — | ❌ **약관 금지(pornography)** | **높음** | 계정정지 리스크 |
| Fireworks | 토큰당 저가 | — | 명시 허용 없음(보수적) | 중~높음 | 회피 권장 |
| DeepInfra | 최저가 토큰 | 모델 따라 | 회색(Dolphin 호스팅, 정책 불명) | 중(미확인) | 계약 전 서면확인 |

출처: [Featherless](https://featherless.ai/) · [Infermatic 가격](https://infermatic.ai/pricing/) · [Arli AI 가격](https://www.arliai.com/pricing) · [Mancer 모델](https://mancer.tech/models) · [NovelAI 구독](https://docs.novelai.net/en/subscription/) · [Venice×OpenRouter](https://venice.ai/blog/venice-openrouter-partner-to-expand-reach-of-private-uncensored-ai-to-developers) · [Together TOS(금지)](https://www.together.ai/terms-of-service) · [Fireworks TOS](https://fireworks.ai/terms-of-service) · [DeepInfra Dolphin](https://deepinfra.com/cognitivecomputations/dolphin-2.6-mixtral-8x7b/api)

---

## 3. 이미지 비교표 (스타일 × 구간)

### 3-A. 실사(Photorealistic)

| 구간 | 후보 | 요구사양 | NSFW | 상업 라이선스 | 비용 |
|---|---|---|---|---|---|
| **로컬(M5 16GB)** | **Chroma** (FLUX schnell 기반, 8.9B) | FP16 12GB+ / NF4 저VRAM 빌드로 16GB 적합 | 검열제거 재학습, 해부학 복원 | **Apache-2.0 (완전 자유)** | 무료(로컬) |
| 로컬 | 커스텀 SDXL (Lustify/Juggernaut/RealVisXL) | SDXL 1024px, M5에서 10~40초급(Draw Things) | 강함(LoRA 없이도 가능한 것도) | **개별 확인 필수** (Juggernaut: 유료API시 별도 상업라이선스) | 무료(로컬) |
| 로컬 | Z-Image Turbo (Alibaba, 6B) | VRAM 6~8GB(최적화 2~3GB), 16GB 잘 맞음 | "uncensored by design"(LoRA 필요 여부 미확인) | 오픈(조건 확인 필요) | 무료 |
| 로컬 | FLUX schnell + NSFW LoRA (현재) | mflux, 상업 OK | 기본 미학습→언락 LoRA 필수, 실사 약함 | **Apache-2.0** | 무료 |
| 로컬(주의) | FLUX.1 dev + NSFW LoRA | 16GB 빡빡, 24~32GB 권장 | 해부학·손 최고 | ❌ **[dev] 비상업, 서빙시 BFL 유료계약** | — |
| **자체호스팅** | Chroma / 커스텀 SDXL | RunPod GPU(16GB $0.58/h~) | 상동 | Chroma=Apache / SDXL=개별 | 초당 과금, 장당 원가 극소 |
| **호스티드 API** | Atlas Cloud FLUX schnell | — | 성인 명시 허용(자사출처, 원문확인 권장) | schnell=Apache | **$0.003/장** |
| 호스티드 API | RunPod 서버리스(자체 FLUX schnell) | GPU 시간당(H100 $4.55/h ≈ $0.00126/s) | 플랫폼 필터 없음(불법물만 AUP금지) | 모델 라이선스 따름 | 유휴 0원 |
| 호스티드 API(회피) | Novita | — | ❌ **약관 금지(pornography)** | — | 계정정지 리스크 |

출처: [Chroma(Apache-2.0)](https://huggingface.co/lodestones/Chroma/blob/main/README.md) · [FLUX schnell LICENSE(Apache)](https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-schnell) · [FLUX dev 비상업](https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/LICENSE.md) · [Juggernaut XL 상업조항](https://www.rundiffusion.com/juggernaut-xl) · [Z-Image Turbo](https://www.nextdiffusion.ai/tutorials/z-image-turbo-fast-uncensored-image-generation-comfyui) · [Draw Things M5 3.3~4.6배](https://releases.drawthings.ai/p/metal-flashattention-v25-w-neural) · [Atlas Cloud 가격·정책(자사)](https://www.atlascloud.ai/blog/guides/atlas-cloud-image-generation-api-guide) · [RunPod 가격](https://www.runpod.io/pricing) · [Novita TOS(금지)](https://novita.ai/legal/terms-of-service)

### 3-B. 애니/일러스트

| 구간 | 후보 | 요구사양 | NSFW | 상업 라이선스 | 비용 |
|---|---|---|---|---|---|
| **로컬/자체호스팅** | **Animagine XL 4.0** (추천) | SDXL(≈2.6B), 16GB 로컬 여유 | ★★★(레이팅 태그 제어) | ✅ **Open RAIL++-M, 상업 명시 허용** | 무료(로컬)/GPU |
| 로컬 | Illustrious XL v2.0 | SDXL, 1536² | ★★★★(손/해부 최고) | ⚠️ 회색(openrail-m 표기 vs 상충) → 법무확인 | 무료 |
| 로컬(품질최상) | NoobAI-XL (V-pred) | SDXL | ★★★★★(danbooru+e621) | ❌ **비상업 명시(fair-ai+추가조항)** | — |
| 로컬(데일리) | WAI-NSFW-illustrious | SDXL, Illustrious 베이스 | ★★★★★(밸런스·LoRA호환1위) | ⚠️ 베이스 상속+Civitai 개별플래그 확인 | 무료 |
| 로컬(표현폭) | Pony V6 XL / V7 | V6=SDXL / V7=AuraFlow 7B | ★★★★(score태그) | ❌ **수익형 추론 금지(머지까지 전파)** | — |
| **호스티드 API** | (SDXL 계열 서빙 가능 벤더) | Atlas가 SDXL 서빙 지원하는지 미확인 | 상동 | 모델별 | — |

> **애니 파이프라인 주의**: 위는 전부 SDXL 계열(Pony V7만 예외)로 **mflux(FLUX 전용)와 별개 파이프라인**. 로컬은 Draw Things(SDXL/Pony 지원)로, 호스티드는 SDXL 서빙 벤더/RunPod 필요. Atlas Cloud의 SDXL 카탈로그 지원 여부는 **미확인(운영주체 확인)**.

출처: [Animagine XL 4.0(Open RAIL++-M 상업허용)](https://huggingface.co/cagliostrolab/animagine-xl-4.0) · [Illustrious v2.0 라이선스 Q&A](https://huggingface.co/OnomaAIResearch/Illustrious-XL-v2.0/discussions/1) · [NoobAI-XL(비상업)](https://civitai.com/models/833294/noobai-xl-nai-xl) · [WAI-NSFW-illustrious](https://civitai.com/models/827184/wai-nsfw-illustrious-sdxl) · [Pony V6 XL(수익형 추론금지)](https://civitai.com/models/257749/pony-diffusion-v6-xl) · [What The License?!](https://civitai.com/articles/18619/what-the-license)

---

## 4. 지금 로컬 구성 즉시 개선 대체안

현재: `qwen2.5-abliterate:14b` + `mflux(FLUX schnell)` + `llava`.

### 챗 LLM — 교체 추천
- **1순위: EVA-Qwen2.5-14B v0.2 (Apache-2.0)**. 현재 abliterate 모델의 **중국어/한자 누출·지시준수 저하**를 RP 특화 파인튜닝으로 개선하면서 상업 라이선스도 깨끗. 16GB에선 컨텍스트를 4K~8K로 제한하고 **Ollama 0.19+ MLX 백엔드** 사용 권장. [EVA 카드](https://huggingface.co/EVA-UNIT-01/EVA-Qwen2.5-14B-v0.2) · [Ollama MLX](https://ollama.com/blog/mlx)
- **메모리 여유 우선이면: Mistral-Nemo-12B RP(Celeste/Lyra/RPMax, Apache-2.0)**. 12B라 16GB에서 KV캐시·컨텍스트 여유가 가장 크다. [Celeste(Ollama)](https://ollama.com/vanilj/mistral-nemo-12b-celeste-v1.9)
- **한국어 보정(공통, 필수)**: (a) 한국어 시스템 프롬프트 강화, (b) **출력단에서 중국어/불필요 한자·garbage 토큰 감지 → 리트라이** 후처리, (c) 낮은 temperature + repetition penalty 튜닝. 어느 모델도 한국어 특화가 아니므로 자체 한국어 RP 테스트셋으로 실측 필수.

### 이미지 — FLUX schnell 유지 + 실사 품질 보강
- **실사 NSFW 품질을 원하면: Chroma 도입**(FLUX schnell 기반, **Apache-2.0**). 현재 schnell은 라이선스는 최고지만 실사 NSFW가 약하므로, 라이선스를 그대로 유지하며 품질을 올리는 가장 깨끗한 경로. [Chroma](https://huggingface.co/lodestones/Chroma/blob/main/README.md)
- **또는 Draw Things + 커스텀 SDXL(Lustify/Juggernaut/RealVisXL)**. M5에서 Draw Things가 ComfyUI-MPS보다 20~40% 빠르고 SDXL 1024px가 실용 속도. 단 **각 체크포인트 라이선스 개별 확인 필수**. [Draw Things M5](https://releases.drawthings.ai/p/metal-flashattention-v25-w-neural)
- **애니가 필요하면: Animagine XL 4.0**(상업 라이선스 깨끗). SDXL이라 mflux와 별개로 Draw Things에서 구동. [Animagine](https://huggingface.co/cagliostrolab/animagine-xl-4.0)
- **llava(비전) 활용**: 출력 이미지 자동 스크리닝(CLAUDE.md 7-B 출력 moderation) 보조 classifier로 재활용 가능. 단 미성년 판별 등 안전 판정은 전용 classifier 이중화 권장.

---

## 5. 상용화 권장 스택

### 시나리오 A — 호스티드 API (초기 10명 규모, CAPEX 없음, MVP 부합)
- **챗**: Featherless 또는 Mancer(정액/크레딧, Qwen 베이스 Magnum·EVA 계열로 한국어+uncensored 접점) — 폴백으로 OpenRouter self-moderated. **Together/Fireworks/Novita는 약관상 회피.**
- **이미지**: **Atlas Cloud FLUX schnell $0.003/장**(CLAUDE.md 지정 백엔드, 성인 명시 허용 — 단 약관 원문 확인) 또는 **RunPod 서버리스로 자체 FLUX schnell/Chroma 서빙**(모더레이션 100% 자기통제, 안전 아키텍처와 부합).
- **비용감(미확인, 추정)**: 챗 정액 월 $10~$100 + 이미지 $0.003/장 × 사용량. 10명·일 5장 상한이면 이미지 월 수천 원~수만 원대. [Atlas 가격](https://www.atlascloud.ai/blog/guides/atlas-cloud-image-generation-api-guide) · [RunPod 가격](https://www.runpod.io/pricing)

### 시나리오 B — 자체 호스팅 (사용량↑, 검열·프라이버시 통제 필요 시)
- **챗**: **Qwen2.5-72B abliterated 또는 Magnum v4 72B**(Qwen 베이스=한국어 상대우위)를 **A100 80GB 1장(또는 48GB×2)**로 Q4 서빙. 123B(Behemoth)는 한국어·비용·라이선스 리스크로 MVP엔 과함.
- **이미지**: **Chroma(Apache-2.0) 또는 커스텀 SDXL**을 RunPod/자체 GPU로 서빙. 애니는 **Animagine XL 4.0**.
- **비용감(미확인)**: A100 80GB RunPod $2.72/h, H100 $4.55/h. 상시 가동이면 월 수백~수천 달러. 순차 처리·유휴 스케일다운 전제면 서버리스가 유리. [RunPod 가격](https://www.runpod.io/pricing)

> 공통: 어느 시나리오든 **미성년/불법 차단은 앱 레이어 책임**. API가 "필터 없음"을 파는 곳일수록 입출력 양방향 moderation + 이미지 출력 classifier가 필수(CLAUDE.md 7-B).

---

## 6. 상용화 실무 리스크 요약 (결제/호스팅/규제)

### 결제 PG — 최대 병목
- **Stripe·PayPal·Cash App = 성인물 사실상 불가**. Visa/Mastercard 정책상 금지 → 적발 시 계정정지+자금동결. 챌린지백율 평균 5~7배. [tripleminds](https://tripleminds.co/blogs/compliance/nsfw-adult-payment-processor/) · [signaturepayments](https://signaturepayments.com/does-stripe-allow-adult-content/)
- 성인 대응 해외 PG: CCBill, Segpay, Verotel, Epoch, Paxum, (크립토)NOWPayments. **국내 원화결제/통신판매 대응은 제한적**.
- **한국(미확인, 운영주체 확인)**: 국내 성인 대응 PG 별도 계약 필요, 전자상거래법상 통신판매업 신고·청약철회·환불정책 요구. 국내 PG 성인향 수용은 개별 심사 사안.

### 호스팅 / CDN
- **AWS S3**: 성인물 명시 금지는 아니나 불법 의심 시 통지 후 2영업일 내 미조치 시 중단 가능. 합법성은 사용자 책임. [repost.aws](https://repost.aws/questions/QUbzSrvOAsQ1uF2Lr7QX839g/s3-storage-for-adult-content)
- **Cloudflare**: 합법 성인 프록시는 가능하나 무료/일반 플랜 대용량 미디어 스트리밍은 정책 위반 위험. 별도 유료 상품 검토. [community.cloudflare](https://community.cloudflare.com/t/using-cloudflare-for-adult-website/471480)
- 권고: 성인 콘텐츠에 관대한 벤더/자체 오브젝트 스토리지 + CLAUDE.md `expires_at` 만료로 저장 최소화.

### 규제 — 한국
- **체크박스 "19세 이상"만으로 불충분 → 실질 본인확인(휴대폰 본인인증/아이핀) 필수**. 주민등록번호 온라인 수집 금지(정보통신망법). CLAUDE.md 7-A/7-D 정합. [namu.wiki 청소년 접근제한](https://namu.wiki/w/%EC%B2%AD%EC%86%8C%EB%85%84%20%EC%A0%91%EA%B7%BC%20%EC%A0%9C%ED%95%9C)
- eKYC/성인 접근제어 상용 벤더 존재(예: Alchera). [alchera.ai](https://www.alchera.ai/resource/blog/ekyc-adult-content-access-control-ekyc)
- **미확인**: "2024.9 청소년보호법 개정으로 본인확인 강화" 주장은 1차 법령으로 미확정 → 법제처·법률자문 확인 필요.

---

## 주요 미확인 항목 (착수 전 확정)
- Featherless/Arli의 **명문 NSFW 허용 정책 문구** (마케팅·라인업 기반 추정) — 계약 전 서면 확인.
- Magnum/Qwen-uncensored 계열 **실제 한국어 RP 품질 벤치** 부재 — 자체 테스트셋 실측 필수.
- **M5 16GB SDXL 1024px 정확한 초당 수치** (M2/M4 × M5 배수 추정).
- Lustify/RealVisXL/Juggernaut/WAI 등 **개별 체크포인트 상업 라이선스 조항**.
- Illustrious v2.0 라이선스 (openrail-m vs fair-ai **상충**) — 공식 텍스트 법무 검토.
- Z-Image Turbo base가 순수 uncensored인지 LoRA 필요인지.
- Atlas Cloud **SDXL 카탈로그 지원 여부** 및 성인 정책 **약관 원문**.
- 한국 성인 대응 PG·본인확인 벤더·개정 법령 시행일 — 운영주체 계약·법률자문.

> **고지**: 본 문서는 개발 착수용 기술·전략 요약이며 법률 자문이 아님. 결제·약관·콘텐츠 등급·본인확인은 정보통신·성인콘텐츠 전문 변호사 자문 필수(CLAUDE.md 7 고지와 동일).
