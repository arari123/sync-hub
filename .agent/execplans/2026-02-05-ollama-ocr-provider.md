# Execution Plan: Ollama OCR Provider Integration

## 1. Goal
OCR 워커가 GLM API 브리지 외에 Ollama 엔진(`OCR_PROVIDER=ollama`)을 직접 호출해 PDF OCR을 수행할 수 있도록 확장한다.

## 2. Entry Points
- OCR worker: `app/ocr_worker.py`
- OCR worker deps: `requirements.ocr-worker.txt`
- GPU compose overlay: `docker-compose.gpu.yml`
- Env template: `.env`

## 3. Files-to-Touch
- `app/ocr_worker.py`: Ollama provider 분기, PDF 페이지 렌더링, 응답 파싱.
- `requirements.ocr-worker.txt`: `pypdfium2`, `pillow` 추가.
- `docker-compose.gpu.yml`: Ollama 환경변수/host gateway 설정.
- `.env`: Ollama 변수 템플릿 추가.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| OLLAMA-001 | health에서 ollama 설정 노출 | `GET /health` |
| OLLAMA-002 | `OCR_PROVIDER=ollama` + endpoint 미설정 시 fallback | `POST /ocr` |
| OLLAMA-003 | 기존 verify 흐름 비회귀 | `npm run verify:fast`, `npm run verify` |

## 5. Implementation Steps
1. OCR 워커에 Ollama API 호출 함수와 provider 분기 추가.
2. PDF 페이지를 이미지(base64)로 렌더링해 Ollama `/api/chat` payload 생성.
3. compose/.env에 Ollama 변수와 host gateway 설정 반영.
4. 워커 재기동 후 fallback + 전체 verify 검증.

## 6. Rollback Plan
1. `app/ocr_worker.py`에서 ollama 분기 제거.
2. `requirements.ocr-worker.txt`에서 추가 의존성 제거.
3. `.env`, `docker-compose.gpu.yml`의 Ollama 설정 제거.

## 7. Evidence
- `npm run verify:fast` -> `Syntax check passed for 12 files.`
- `npm run verify` 통과:
  - `GET /health` -> `{"status":"healthy"}`
  - `GET /health/detail` -> required dependency 모두 healthy
  - `POST /_analyze` (`nori_tokenizer`) -> 토큰 6개 반환
- `GET http://localhost:8100/health` ->
  `{"status":"healthy","service":"ocr-worker",...,"ollama_endpoint_configured":false,"ollama_model":"llama3.2-vision","ollama_mode":"chat","provider_ready":true}`
- Ollama fallback 강제 검증:
  - `docker exec synchub_ocr python -c "... OCR_PROVIDER=ollama ..."` ->
    `health(): {"provider":"ollama","provider_ready":false,"provider_error":"OLLAMA_ENDPOINT is not configured."}`
  - 동일 컨텍스트 `ocr()` ->
    `{"text": "", "engine": "pypdf-fallback", "pages": 1, "used_fallback": true, "error": "OLLAMA_ENDPOINT is not configured."}`
