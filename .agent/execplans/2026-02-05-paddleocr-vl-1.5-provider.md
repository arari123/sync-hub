# Execution Plan: PaddleOCR-VL-1.5 Provider Integration

## 1. Goal
`OCR_PROVIDER=paddle` 모드에서 PaddleOCR-VL-1.5(0.9B)로 이미지 PDF OCR 추출이 가능하도록 OCR 워커를 확장하고, 기존 파이프라인에서 실제 문서 처리까지 검증한다.

## 2. Entry Points
- OCR worker: `app/ocr_worker.py`
- OCR worker image: `Dockerfile.ocr`
- OCR worker deps: `requirements.ocr-worker.txt`
- GPU compose overlay: `docker-compose.gpu.yml`
- Runtime env: `.env`

## 3. Files-to-Touch
- `app/ocr_worker.py`: paddle provider 분기, PaddleOCRVL 초기화/호출/결과 파싱.
- `requirements.ocr-worker.txt`: paddle/paddlex 계열 의존성 및 `numpy` 호환 버전 고정.
- `Dockerfile.ocr`: Paddle 런타임 시스템 라이브러리 설치.
- `.env`, `docker-compose.gpu.yml`: `PADDLE_*` 환경변수 추가/전달.
- `scripts/compare_text_outputs.py`: OCR 품질 정량 비교.
- `scripts/debug_paddle_inputs.py`, `scripts/inspect_paddle_result.py`: Paddle 디버그 유틸.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| PAD-001 | Paddle provider health 노출 | `GET /health` (`provider=paddle`, `paddle_pipeline_version=v1.5`) |
| PAD-002 | PaddleOCR-VL-1.5 워커 직접 추론 성공 | `docker exec synchub_ocr python -c "... ocr(...image_p1.pdf) ..."` |
| PAD-003 | 웹 파이프라인 처리 성공 + 품질 비교 | `POST /documents/upload` -> `doc_id=20` 완료, `compare_text_outputs.py` |
| PAD-004 | 전체 verify 비회귀 | `npm run verify:fast`, `npm run verify` |

## 5. Implementation Steps
1. OCR 워커에 `paddle` provider 경로 추가 및 PaddleOCRVL 결과(`parsing_res_list[].content`) 파싱 로직 구현.
2. OCR 워커 이미지에 Paddle 의존성/런타임 라이브러리(`libgl1`, `libglib2.0-0`, `libgomp1`) 반영.
3. `PADDLE_PIPELINE_VERSION=v1.5`, `PADDLE_MODEL_NAME=PaddleOCR-VL-1.5-0.9B` 환경변수 구성.
4. 이미지 PDF 1페이지 샘플로 추출/비교/verify 수행.

## 6. Rollback Plan
1. `.env`에서 `OCR_PROVIDER=paddle`를 기존 provider로 복원.
2. `app/ocr_worker.py`의 paddle 분기 제거.
3. `requirements.ocr-worker.txt`, `Dockerfile.ocr`, `docker-compose.gpu.yml`의 paddle 관련 변경 제거.

## 7. Evidence
- `curl http://localhost:8100/health`:
  - `provider: "paddle"`
  - `paddle_pipeline_version: "v1.5"`
  - `paddle_model: "PaddleOCR-VL-1.5-0.9B"`
  - `provider_ready: true`
- 워커 직접 추론:
  - `engine: "paddleocr-vl"`
  - `used_fallback: false`
  - 추출 텍스트에 `높이로 포착하는 인라인 3D 검사` 포함
- 웹 파이프라인:
  - `POST /documents/upload` -> `{"id":20,"status":"pending"}`
  - `GET /documents/20` -> `status:"completed"` + Paddle OCR 텍스트 저장
- 품질 비교 (`doc17` vs `doc20`):
  - `jaccard_similarity=0.7407`
  - `left_token_coverage_by_right=0.8696`
- 검증:
  - `npm run verify:fast` 통과
  - `npm run verify` 통과
