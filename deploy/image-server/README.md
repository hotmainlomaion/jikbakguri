# GPU 이미지 서버 — 코드 변경 0 승급

로컬 `flux-local/image-server.py`와 **동일한 HTTP 계약**을 지키는 GPU용 서버.
앱(`lib/atlas/image.ts`, `IMAGE_PROVIDER=local`)은 이 계약으로 통신하므로, **앱 코드 변경 없이**
`ATLAS_IMAGE_BASE_URL`만 이 서버 주소로 바꾸면 애니(SDXL)가 초~수초대로 승급된다.

## 계약
```
POST /  { "prompt": str, "style": "photoreal"|"anime", "seed": int, "steps": int } -> { "b64": "<png>" }
GET  /  -> { "ok": true, ... }
```
- `style`로 백엔드 분기(photoreal=FLUX / anime=SDXL·Animagine), `seed`로 캐릭터 일관성(0008).
- 반환 `b64`는 앱이 그대로 받아 **출력 스크리닝(llava/vision) → Storage 저장 → expires_at 만료**를 통과.

## 배포 (RunPod / Vast / 전용 GPU)
1. 이미지 빌드·푸시:
   ```bash
   docker build -t <registry>/jb-image-server:latest deploy/image-server
   docker push <registry>/jb-image-server:latest
   ```
2. GPU 인스턴스에서 컨테이너 실행(예: 16~24GB VRAM). 게이트 모델 접근용 `HF_TOKEN` 주입:
   ```bash
   docker run --gpus all -p 8080:8080 \
     -e HF_TOKEN=hf_xxx -e IMG_AUTH_TOKEN=<서버토큰> \
     <registry>/jb-image-server:latest
   ```
   - RunPod: 위 이미지를 커스텀 템플릿으로 등록, 포트 8080 노출, 환경변수 동일 설정.
3. 앱 env만 교체(**코드 변경 0**):
   ```
   IMAGE_PROVIDER=local
   ATLAS_IMAGE_BASE_URL=https://<gpu-host>:8080/
   ATLAS_IMAGE_API_KEY=<IMG_AUTH_TOKEN 과 동일>
   ATLAS_IMAGE_TIMEOUT_MS=60000   # GPU는 빠르므로 축소
   ```

## 로컬 검증 (MOCK, GPU 불필요)
모델 없이 계약·앱 통합만 확인:
```bash
MOCK=1 PORT=8090 python deploy/image-server/server.py &
# 앱 env: ATLAS_IMAGE_BASE_URL=http://127.0.0.1:8090/  ATLAS_IMAGE_API_KEY=local
# → 채팅/스튜디오에서 이미지 생성 시 즉시 플레이스홀더 PNG가 저장되면 "URL 스왑=앱 변경 0" 성립.
```
MOCK은 스타일별 단색 PNG를 즉시 반환(순수 stdlib). 실제 GPU 배포 시 `MOCK` 미설정으로 diffusers 생성.

## 주의
- FLUX.1-schnell(Apache) · Animagine XL 4.0(Open RAIL++-M) 상업 사용 가능. 다른 체크포인트로 교체 시 라이선스 재확인.
- 게이트 HF 모델은 `HF_TOKEN` 필요(라이선스 동의 선행).
- NSFW 무검열은 모델 선택으로 조절(예: 애니를 Pony/Illustrious 계열로). 안전 하드리밋(미성년/CSAM)은 앱 모더레이션이 담당.
