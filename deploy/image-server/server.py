#!/usr/bin/env python3
# GPU 배포용 이미지 서버 — 로컬 flux-local/image-server.py와 "동일한 계약"을 지킨다.
# 따라서 앱은 코드 변경 0으로, ATLAS_IMAGE_BASE_URL만 이 서버 주소로 바꾸면 승급된다.
#
#   POST /  { "prompt": str, "style": "photoreal"|"anime", "seed": int, "steps": int } -> { "b64": "<png>" }
#   GET  /  -> { "ok": true, ... }  (health)
#
# 차이(로컬 대비): (1) 모델을 프로세스 상주(warm)로 1회 로드 → 요청마다 리로드 없음(빠름),
#                 (2) CUDA(.to('cuda'), bf16/fp16) — NVIDIA GPU에서 실사(FLUX)·애니(SDXL) 초~수초.
# 안전/일관성: style로 백엔드 분기, seed로 캐릭터 일관성(0008). 앱의 입력/출력 모더레이션은 그대로.
#
# 환경변수:
#   PORT(기본 8080), IMG_AUTH_TOKEN(설정 시 Authorization: Bearer 검사),
#   PHOTOREAL_MODEL(기본 black-forest-labs/FLUX.1-schnell), ANIME_MODEL(기본 cagliostrolab/animagine-xl-4.0),
#   MOCK=1(모델 없이 플레이스홀더 PNG 반환 — 계약/통합 검증용, GPU 불필요).
import http.server, json, base64, os, sys, io, zlib, struct

MOCK = os.environ.get("MOCK") == "1"
AUTH = os.environ.get("IMG_AUTH_TOKEN")
PHOTOREAL_MODEL = os.environ.get("PHOTOREAL_MODEL", "black-forest-labs/FLUX.1-schnell")
ANIME_MODEL = os.environ.get("ANIME_MODEL", "cagliostrolab/animagine-xl-4.0")
ANIME_QUALITY = "masterpiece, high score, great score, absurdres"
ANIME_NEG = ("lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, "
             "cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry, "
             "censored, mosaic censoring, bar censor")

# ---------- MOCK: 순수 stdlib로 단색 PNG 생성(의존성 0, GPU 불필요) ----------
def solid_png(w=768, h=768, rgb=(120, 90, 140)):
    raw = bytearray()
    row = bytes(rgb) * w
    for _ in range(h):
        raw.append(0)          # filter type 0
        raw.extend(row)
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

# ---------- 실제 GPU 파이프라인(warm) ----------
_flux = None
_sdxl = None
def _load():
    global _flux, _sdxl
    import torch
    from diffusers import FluxPipeline, StableDiffusionXLPipeline
    if _flux is None:
        _flux = FluxPipeline.from_pretrained(PHOTOREAL_MODEL, torch_dtype=torch.bfloat16).to("cuda")
    if _sdxl is None:
        _sdxl = StableDiffusionXLPipeline.from_pretrained(ANIME_MODEL, torch_dtype=torch.float16,
                                                          use_safetensors=True).to("cuda")

def gen_real(prompt, style, seed, steps):
    import torch
    _load()
    g = torch.Generator("cuda").manual_seed(int(seed) if seed is not None and int(seed) >= 0 else 0)
    if style == "anime":
        img = _sdxl(prompt=f"{prompt}, {ANIME_QUALITY}", negative_prompt=ANIME_NEG,
                    num_inference_steps=int(steps or 28), guidance_scale=5.0,
                    width=832, height=1216, generator=g).images[0]
    else:
        img = _flux(prompt=prompt, num_inference_steps=int(steps or 4), guidance_scale=0.0,
                    width=1024, height=1024, generator=g).images[0]
    buf = io.BytesIO(); img.save(buf, format="PNG"); return buf.getvalue()

def generate(prompt, style, seed, steps):
    if MOCK:
        # 스타일별로 색만 다른 플레이스홀더(계약/통합 검증용).
        return solid_png(rgb=(150, 110, 90) if style == "photoreal" else (120, 100, 160))
    return gen_real(prompt, style, seed, steps)


class H(http.server.BaseHTTPRequestHandler):
    def _authed(self):
        if not AUTH:
            return True
        return self.headers.get("authorization", "") == f"Bearer {AUTH}"

    def do_POST(self):
        try:
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            n = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(n) or b"{}")
            prompt = (body.get("prompt") or "").strip()
            style = body.get("style") or "photoreal"
            if not prompt:
                return self._json(400, {"error": "no_prompt"})
            png = generate(prompt, style, body.get("seed"), body.get("steps"))
            return self._json(200, {"b64": base64.b64encode(png).decode()})
        except Exception as e:  # noqa
            return self._json(500, {"error": str(e)})

    def do_GET(self):
        return self._json(200, {"ok": True, "mock": MOCK, "photoreal": PHOTOREAL_MODEL, "anime": ANIME_MODEL})

    def _json(self, code, obj):
        data = json.dumps(obj).encode()
        try:
            self.send_response(code)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except BrokenPipeError:
            pass  # 클라이언트 조기 종료(타임아웃 등) — 무시

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8080))
    if not MOCK:
        print("[image-server-gpu] warming models…", file=sys.stderr, flush=True)
        _load()
    print(f"[image-server-gpu] http://0.0.0.0:{port}  mock={MOCK}", file=sys.stderr, flush=True)
    http.server.ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
