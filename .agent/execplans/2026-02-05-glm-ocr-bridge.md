# Execution Plan: GLM-OCR Bridge Integration

## 1. Goal
OCR 워커가 실제 GLM-OCR 엔드포인트를 호출할 수 있도록 브리지 로직(요청 포맷/응답 파싱/실패 fallback)을 구현한다.

## 2. Entry Points
- OCR worker API: `app/ocr_worker.py`
- OCR adapter (web -> worker): `app/core/ocr.py`
- GPU compose overlay: `docker-compose.gpu.yml`

## 3. Files-to-Touch
- `app/ocr_worker.py`: GLM 호출 모드 및 응답 파싱 로직.
- `docker-compose.gpu.yml`: GLM 관련 환경변수 전달.
- `.env`: GLM 연동 변수 템플릿.
- `docs/repo-map.md`: 워커 설정 반영.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| GLM-001 | 워커 health에서 OCR 모드 노출 | `GET /health` |
| GLM-002 | GLM 미설정 시 fallback 동작 | `POST /ocr` |
| GLM-003 | web 파이프라인이 워커 응답을 소비 | 업로드 후 `GET /documents/{id}` |

## 5. Implementation Steps
1. 워커에 `OCR_PROVIDER`, `GLM_OCR_*` 환경변수 기반 분기 추가.
2. 멀티파트/JSON(base64) 두 가지 GLM 요청 포맷 지원.
3. 다양한 응답 포맷에서 텍스트를 추출하는 파서 구현.
4. GLM 실패 시 기존 fallback으로 안전 복귀.
5. 컨테이너 재기동 후 업로드/검색 시나리오 검증.

## 6. Rollback Plan
1. `app/ocr_worker.py`를 pypdf-only 버전으로 복원.
2. `docker-compose.gpu.yml`, `.env`의 GLM 관련 변수 제거.

## 7. Evidence
- `npm run verify:fast` -> `Syntax check passed for 12 files.`
- `npm run verify` -> `{"status":"healthy"}` + `cluster_name : "docker-cluster"` + `All services are operational.`
- `curl http://localhost:8100/health` ->
  `{"status":"healthy","service":"ocr-worker","accelerator":"cpu","provider":"pypdf","glm_mode":"multipart","glm_endpoint_configured":false}`
- GLM 미설정 fallback 강제 검증:
  - `docker exec synchub_ocr python -c "... OCR_PROVIDER=glm ..."` ->
    `{"text": "", "engine": "pypdf-fallback", "pages": 1, "used_fallback": true, "error": "GLM_OCR_ENDPOINT is not configured."}`
- web 파이프라인 연동:
  - `POST /documents/upload` (`e2e.pdf`) -> `{"id":10,"status":"pending"}`
  - `GET /documents/10` -> `status:"completed"` 확인
  - OCR worker log -> `172.18.0.4 ... "POST /ocr HTTP/1.1" 200 OK` (web -> worker 호출 확인)
  - `GET /documents/search?q=pending&limit=3` -> `doc_id=10` 포함 검색 결과 반환
