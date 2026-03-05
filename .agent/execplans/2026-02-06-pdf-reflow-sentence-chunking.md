# Execution Plan: PDF Reflow + Sentence-Aware Chunking + Table Split

## 1. Goal
PDF 2단/병렬 레이아웃에서 읽기 순서를 복원하고, 문장 경계 기반 청킹/표 분리 저장/검색 디버그/reindex를 추가해 벡터 검색 품질을 안정화한다.

## 2. Entry Points
- Ingest pipeline: `app/core/pipeline.py`
- Parsing/Reflow: `app/core/parsing/reflow.py`
- Cleaning: `app/core/parsing/cleaning.py`
- Chunking: `app/core/chunking/sentence_splitter.py`, `app/core/chunking/chunker.py`
- Vector store/index schema: `app/core/vector_store.py`
- Search APIs: `app/api/documents.py`, `app/api/admin_debug.py`
- Reindex CLI: `app/core/indexing/reindex.py`

## 3. Files-to-Touch
- 신규
  - `app/core/parsing/__init__.py`
  - `app/core/parsing/reflow.py`
  - `app/core/parsing/cleaning.py`
  - `app/core/chunking/__init__.py`
  - `app/core/chunking/sentence_splitter.py`
  - `app/core/chunking/chunker.py`
  - `app/core/indexing/__init__.py`
  - `app/core/indexing/reindex.py`
  - `app/api/admin_debug.py`
  - `tests/test_sentence_chunker.py`
- 수정
  - `app/core/pipeline.py`
  - `app/core/vector_store.py`
  - `app/api/documents.py`
  - `app/main.py`
  - `scripts/verify_fast.sh`
  - `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| RFL-001 | 2단/병렬에서 가로 결합 방지 | `python3 -m unittest tests.test_sentence_chunker -v` 내 reflow/parallel 규칙 테스트 |
| CHK-001 | 문장 경계 청킹 + overlap | `python3 -m unittest tests.test_sentence_chunker -v` 내 chunking 테스트 |
| TBL-001 | 표 청크 분리 저장(`table_raw`, `table_row_sentence`) | dry-run 출력 + search_debug `chunk_type` 확인 |
| DBG-001 | `/api/admin/search_debug`에서 score/preview 확인 | API 호출 응답(`vector_topk`, `bm25_topk`, `request_id`) |
| REI-001 | reindex CLI dry-run/실색인 동작 | `python3 -m app.core.indexing.reindex --dry-run --file-path e2e.pdf --filename e2e.pdf` |
| REG-001 | 기본 정적 검증 통과 | `npm run verify:fast` |

## 5. Implementation Steps
1. 기존 파이프라인을 문서 추출/리플로우/클린업/청킹/인덱싱 단계로 분리한다.
2. bbox 기반 페이지 블록 정렬 + 컬럼 감지 + 컬럼 간 병합 금지 + 병렬 컬럼 감지를 구현한다.
3. 헤더/푸터 반복 제거, 줄바꿈/하이픈 복원, 문장 분할, sentence-aware chunker를 구현한다.
4. 표 후보를 본문과 분리해 `table_raw` + `table_row_sentence`로 저장한다.
5. 벡터 인덱스 필드 확장(`chunk_type/page/chunk_index/quality_score/schema version`)과 debug 검색 경로를 추가한다.
6. `/api/admin/search_debug`와 reindex CLI(`--dry-run`)를 추가한다.
7. 단위 테스트 및 verify를 실행하고 docs를 업데이트한다.

## 6. Rollback Plan
1. `app/core/pipeline.py`를 기존 단일 텍스트 청킹 로직으로 복원한다.
2. `app/core/vector_store.py`의 신규 메타 필드를 제거하고 기존 인덱싱 구조로 되돌린다.
3. `app/api/admin_debug.py`, `app/core/indexing/reindex.py`, 신규 parsing/chunking 모듈을 제거한다.

## 7. Evidence
- 구현 후 아래 명령 결과를 기록한다.
  - `python3 -m unittest tests.test_sentence_chunker -v`
  - `python3 -m app.core.indexing.reindex --dry-run --file-path e2e.pdf --filename e2e.pdf`
  - `npm run verify:fast`
