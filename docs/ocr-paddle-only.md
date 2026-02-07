# PaddleOCR-VL-1.5 단독 운영 가이드

## 목적
- OCR provider를 `PaddleOCR-VL-1.5` 단독으로 고정한다.
- 품질 우선 설정(`layout_detection`)을 유지하면서, 반복 색인 속도를 보완한다.

## 기본 동작
- `OCR_PROVIDER=paddle`
- 품질 우선 기본값:
  - `PADDLE_USE_LAYOUT_DETECTION=true`
  - `PADDLE_FORMAT_BLOCK_CONTENT=true`
  - `PADDLE_PROMPT_LABEL=` (미사용)

## 속도 보완(현재 반영됨)
1. OCR 결과 캐시
- 동일 파일 + 동일 OCR 옵션 요청은 캐시 응답을 반환한다.
- env:
  - `OCR_CACHE_ENABLED=true`
  - `OCR_CACHE_DIR=/app/.cache/ocr_worker`

2. 모델 캐시 볼륨
- 컨테이너 재생성 시 모델 재다운로드를 방지한다.
- `docker-compose.gpu.yml`:
  - `/root/.paddlex` -> `paddle_model_cache` 볼륨 마운트

3. startup preload/warmup
- 모델 초기 로드 지연 완화:
  - `PADDLE_PRELOAD_ON_STARTUP=true`
  - `PADDLE_WARMUP_ON_STARTUP=true`

## 공식 벤치 대비 속도 차이
- 공식 문서 벤치는 고성능 GPU + 가속 백엔드(vLLM/FastDeploy) 기준인 경우가 많다.
- 현재 기본값은 로컬 네이티브 추론 경로라 문서/환경에 따라 큰 지연이 발생할 수 있다.
- 특히 표/복합 레이아웃 페이지에서 `use_layout_detection=true`는 품질 이득이 크지만 추론 비용도 크다.

## 추가 가속 경로(품질 유지용)
- PaddleOCR-VL 공식 백엔드 연결 env(코드 반영 완료):
  - `PADDLE_VL_REC_BACKEND` (`vllm-server` 등)
  - `PADDLE_VL_REC_SERVER_URL`
  - `PADDLE_VL_REC_API_MODEL_NAME`
  - `PADDLE_VL_REC_API_KEY`
  - `PADDLE_VL_REC_MAX_CONCURRENCY`
- 이 경로는 모델은 동일(`PaddleOCR-VL-1.5`)하게 유지하면서 추론 계층만 가속한다.

## WSL + vLLM 서버 필수 설정
- 증상:
  - `vllm` 컨테이너에서 `RuntimeError: No CUDA GPUs are available` 발생
- 원인:
  - WSL 환경에서 GPU 드라이버 라이브러리 경로가 컨테이너에 노출되지 않으면 Torch CUDA 초기화가 실패할 수 있음
- 조치(`docker-compose.gpu.yml` 반영):
  - `paddle-vlm-server`에 `LD_LIBRARY_PATH=/usr/lib/wsl/lib` 추가
  - `paddle-vlm-server`에 `/usr/lib/wsl/lib:/usr/lib/wsl/lib:ro` 볼륨 마운트
  - `paddle-vlm-server`에 `/dev/dxg` 디바이스 매핑

## 실측(이미지 PDF p32, vLLM-server 경유)
- 대상:
  - `uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image_p32.pdf`
- 요청 조건:
  - `max_pages=1`, `render_dpi=144`, `force_render_pdf=true`, `pypdf_preflight=false`
- 결과:
  - 1회차(캐시 미사용): `28.74s`, `engine=paddleocr-vl`, `used_fallback=false`
  - 2회차(캐시 사용): `0.01s`, `engine=paddleocr-vl`, `used_fallback=false`

## 확인 방법
- `GET /health`에서 다음 항목 확인:
  - `provider=paddle`
  - `ocr_cache_enabled=true`
  - `paddle_use_layout_detection=true`
  - `paddle_format_block_content=true`
