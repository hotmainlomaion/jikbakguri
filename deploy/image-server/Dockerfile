# GPU 배포 이미지 서버 — NVIDIA CUDA 베이스. RunPod/Vast/전용 GPU에 배포.
# 앱과 "동일 계약"({prompt,style,seed,steps}→{b64})을 지키므로 ATLAS_IMAGE_BASE_URL만 이 서버로 바꾸면 승급(앱 코드 변경 0).
FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

WORKDIR /app
RUN pip install --no-cache-dir \
    diffusers>=0.31 "transformers>=4.44,<5" accelerate safetensors sentencepiece protobuf

COPY server.py /app/server.py

# FLUX.1-schnell / Animagine 등 게이트 모델은 빌드시 HF_TOKEN 또는 런타임 마운트로 접근.
ENV PORT=8080 \
    PHOTOREAL_MODEL=black-forest-labs/FLUX.1-schnell \
    ANIME_MODEL=cagliostrolab/animagine-xl-4.0
EXPOSE 8080

# 시작 시 모델 warm 로드 후 서비스. IMG_AUTH_TOKEN 설정 시 Bearer 인증.
CMD ["python", "server.py"]
