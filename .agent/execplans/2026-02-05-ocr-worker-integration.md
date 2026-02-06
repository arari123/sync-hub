# Execution Plan: OCR Worker Integration

## 1. Goal
GPU compose 기반 OCR 워커를 실사용 가능한 API 형태로 연결하여 문서 처리 파이프라인에서 외부 OCR 호출이 가능하도록 만든다.

## 2. Entry Points
- OCR adapter: `app/core/ocr.py`
- OCR worker app: `app/ocr_worker.py`
- GPU compose: `docker-compose.gpu.yml`

## 3. Files-to-Touch
- `app/ocr_worker.py`: OCR 워커 API 엔드포인트 구현.
- `Dockerfile.ocr`: OCR 워커 컨테이너 빌드 파일.
- `requirements.ocr-worker.txt`: OCR 워커 의존성.
- `docker-compose.gpu.yml`: OCR 워커 서비스 및 web 환경변수 연동.
- `docs/repo-map.md`: 워커 관련 파일 반영.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| OCR-001 | OCR 워커 컨테이너 빌드/기동 성공 | `docker-compose -f docker-compose.yml -f docker-compose.gpu.yml up -d ocr-worker` |
| OCR-002 | OCR 워커 health 응답 | `curl /health` |
| OCR-003 | web 파이프라인에서 OCR 워커 URL 사용 가능 | 업로드 후 status 확인 + web 로그 |

## 5. Implementation Steps
1. OCR 워커 FastAPI 앱과 요청/응답 스키마 확정.
2. 워커 전용 Dockerfile/requirements 작성.
3. GPU compose에 워커 서비스 및 web의 `OCR_WORKER_URL` override 연결.
4. 워커 health/ocr API 및 문서 업로드 시나리오 검증.

## 6. Rollback Plan
1. `docker-compose.gpu.yml`의 web override/ocr-worker 블록 제거.
2. `app/ocr_worker.py`, `Dockerfile.ocr`, `requirements.ocr-worker.txt` 삭제.

## 7. Evidence
- `sg docker -c 'docker-compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build --no-deps ocr-worker'`로 OCR 워커 빌드/기동.
- `curl http://localhost:8100/health` -> `{"status":"healthy","service":"ocr-worker"}`
- `POST http://localhost:8100/ocr` (`uploads/e2e.pdf`) -> OCR 응답(`text`, `engine`, `pages`) 확인.
- `POST /documents/upload` -> `{"id":9,"status":"pending"}` 후 `GET /documents/9` -> `status:"completed"` + OCR 워커 텍스트 반영.
- `GET /documents/search?q=fallback&limit=5` -> `doc_id=9` 포함 검색 결과 반환.
- `npm run verify:fast`, `npm run verify` 통과.
