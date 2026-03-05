# Execution Plan: Dedup(Exact + Near) Management for Sync-Hub

## 1. Goal
중복/준중복 문서를 자동 탐지하고, 클러스터/대표 문서를 관리하며, 인덱싱/재색인/검색에서 중복 정책을 적용해 벡터 검색 품질을 안정화한다.

## 2. Entry Points
- Document model/schema: `app/models.py`, `app/database.py`
- Ingest/index pipeline: `app/core/pipeline.py`, `app/core/vector_store.py`
- Dedup modules: `app/core/dedup/*`
- Admin APIs: `app/api/admin_dedup.py`, `app/main.py`
- Reindex/scan CLI: `app/core/indexing/reindex.py`, `app/cli/dedup_scan.py`
- Search endpoint: `app/api/documents.py`

## 3. Files-to-Touch
- 신규
  - `app/core/dedup/__init__.py`
  - `app/core/dedup/hash.py`
  - `app/core/dedup/minhash.py`
  - `app/core/dedup/doc_embedding.py`
  - `app/core/dedup/policies.py`
  - `app/core/dedup/service.py`
  - `app/api/admin_dedup.py`
  - `app/cli/__init__.py`
  - `app/cli/dedup_scan.py`
  - `tests/test_dedup.py`
  - `docs/dedup.md`
- 수정
  - `app/models.py`
  - `app/database.py`
  - `app/core/pipeline.py`
  - `app/core/vector_store.py`
  - `app/core/indexing/reindex.py`
  - `app/api/documents.py`
  - `app/api/admin_debug.py`
  - `app/main.py`
  - `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| DED-001 | 동일 텍스트 변형(개행/공백) 해시 동일 | `python3 -m unittest tests.test_dedup -v` hash test |
| DED-002 | exact duplicate 탐지/정책 판정 | `python3 -m unittest tests.test_dedup -v` policy/exact test |
| DED-003 | near duplicate 후보/클러스터 생성 | `python3 -m unittest tests.test_dedup -v` minhash cluster test |
| DED-004 | index policy primary-only 판정 | `python3 -m unittest tests.test_dedup -v` policy test |
| DED-005 | reindex dedup 옵션 파싱/연동 | `python3 -m app.core.indexing.reindex --help` |
| DED-006 | 기본 검증 통과 | `npm run verify:fast` |

## 5. Implementation Steps
1. 문서/클러스터 모델 및 런타임 스키마 보정(ALTER) 로직 추가.
2. hash/minhash/doc_embedding/policies/service 모듈을 구현한다.
3. pipeline에서 hash 저장 + exact/near 판단 + index policy 적용을 연결한다.
4. vector_store 메타에 dedup 필드를 저장하고 search 응답 다양성 필터를 추가한다.
5. admin dedup API(클러스터 목록/상세/대표 변경/문서 무시)와 dedup_scan CLI를 구현한다.
6. reindex CLI에 `--dedup`, `--index-policy` 옵션을 추가한다.
7. 단위 테스트/문서화/verify를 실행한다.

## 6. Rollback Plan
1. `app/core/dedup/*`, `app/api/admin_dedup.py`, `app/cli/dedup_scan.py`, `tests/test_dedup.py`를 제거한다.
2. `app/core/pipeline.py`, `app/core/vector_store.py`, `app/core/indexing/reindex.py`, `app/api/documents.py`의 dedup 분기를 제거한다.
3. `app/models.py`, `app/database.py`의 dedup 스키마 확장을 제거한다.

## 7. Evidence
- `python3 -m unittest tests.test_dedup -v`
- `python3 -m app.core.indexing.reindex --help`
- `python3 -m app.cli.dedup_scan --help`
- `npm run verify:fast`
