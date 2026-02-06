# Execution Plan: Document Pipeline Enhancement

## 1. Goal
문서 처리 파이프라인의 안정성을 높이기 위해 OCR 경로를 명확히 하고, 백그라운드 처리 실패 시 재시도/오류 기록을 도입한다.

## 2. Entry Points
- Upload API: `POST /documents/upload`
- Status API: `GET /documents/{doc_id}`
- Pipeline core: `app/core/pipeline.py`
- OCR adapter: `app/core/ocr.py`

## 3. Files-to-Touch
- `app/api/documents.py`: 업로드 후 백그라운드 작업 호출 경로 개선.
- `app/core/pipeline.py`: 세션 분리, 재시도, OCR fallback, 상태 반영 로직.
- `app/core/ocr.py`: OCR 워커 연동 함수 및 안전 fallback.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| PIPE-001 | 업로드 후 백그라운드 작업이 독립 세션으로 실행 | `POST /documents/upload` 후 상태 조회 |
| PIPE-002 | 처리 실패 시 재시도 후 최종 실패 상태 기록 | 로그 확인 + 상태 API 응답 |
| PIPE-003 | 텍스트 추출 실패 시 OCR 경로 동작 | 업로드 문서의 `content_text` 확인 |

## 5. Implementation Steps
1. 현 파이프라인의 요청 세션 재사용/오류 처리 취약점 정리.
2. 파이프라인 실행 진입점을 `doc_id` 기반 독립 세션 작업으로 변경.
3. OCR helper를 워커 호출 + fallback 구조로 개선.
4. 재시도(backoff)와 최종 실패 메시지 기록 추가.
5. 업로드/상태/검색 시나리오로 동작 검증.

## 6. Rollback Plan
1. `app/api/documents.py`, `app/core/pipeline.py`, `app/core/ocr.py`를 이전 상태로 복원.
2. 문제가 재시도 정책에 국한되면 retry 관련 블록만 제거한다.

## 7. Evidence
- `npm run verify:fast` -> `Syntax check passed for 11 files.`
- `npm run verify` -> `{"status":"healthy"}` + `cluster_name : "docker-cluster"` + `All services are operational.`
- 정상 문서 처리:
  - `POST /documents/upload` -> `{"id":5,"status":"pending"}`
  - `GET /documents/5` -> `status:"completed"`, `content_text` OCR fallback 문구 기록
- 실패/재시도:
  - `POST /documents/upload` (`bad.pdf`) -> `{"id":6,"status":"pending"}`
  - `GET /documents/6` -> `status:"failed"`, `content_text:"[PIPELINE ERROR] ..."`
  - `docker logs synchub_web` -> `attempt=1`, `attempt=2`, `attempt=3` 재시도 로그 확인
- 검색 동작:
  - `GET /documents/search?q=OCR&limit=3` -> 업로드 문서 결과 반환
