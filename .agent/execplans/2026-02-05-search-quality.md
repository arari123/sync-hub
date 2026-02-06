# Execution Plan: Search Quality Enhancement

## 1. Goal
검색 정확도와 안정성을 높이기 위해 문서를 청크 단위로 인덱싱하고, BM25 + 벡터 점수를 RRF로 결합한다.

## 2. Entry Points
- Search API: `GET /documents/search`
- Pipeline: `app/core/pipeline.py`
- Vector store: `app/core/vector_store.py`

## 3. Files-to-Touch
- `app/core/pipeline.py`: 텍스트 청크 분할 및 배치 임베딩 인덱싱.
- `app/core/vector_store.py`: 문서 단위 삭제/청크 인덱싱/하이브리드 검색(RRF).

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SEARCH-001 | 청크 기반 인덱싱 동작 | `POST /documents/upload` 후 `GET /documents/{id}` completed |
| SEARCH-002 | BM25 + 벡터 결합 검색 결과 반환 | `GET /documents/search?q=OCR&limit=5` 결과 반환 |
| SEARCH-003 | 실패 문서 재시도 후 상태 기록 유지 | `bad.pdf` 업로드 후 `status=failed`, retry 로그 |

## 5. Implementation Steps
1. 파이프라인에 문자 기반 overlap chunking 추가.
2. 청크 배치 임베딩 후 `doc_id:chunk_id` 키로 인덱싱.
3. 검색 시 keyword/vector 결과를 RRF로 합산하고 doc 단위로 collapse.
4. 업로드/상태/검색/실패 시나리오 검증.

## 6. Rollback Plan
1. `app/core/pipeline.py`를 단일 본문 인덱싱 버전으로 복원.
2. `app/core/vector_store.py`를 단일 쿼리 검색 버전으로 복원.

## 7. Evidence
- `npm run verify:fast` -> `Syntax check passed for 11 files.`
- `npm run verify` -> `{"status":"healthy"}` + `cluster_name : "docker-cluster"` + `All services are operational.`
- `POST /documents/upload` (`e2e.pdf`) -> `{"id":7,"status":"pending"}`
- `GET /documents/7` -> `status:"completed"`
- `GET /documents/search?q=OCR&limit=5` -> 문서 결과 3건 반환
- `POST /documents/upload` (`bad.pdf`) -> `{"id":8,"status":"pending"}`
- `GET /documents/8` -> `status:"failed"`, `content_text` 오류 기록
- `docker logs synchub_web` -> `attempt=1~3` 재시도 로그 확인
