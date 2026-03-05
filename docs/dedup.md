# Dedup 운영 가이드

## 1) 목적
- 동일 문서(Exact duplicate)와 준중복 문서(Near duplicate)를 자동 탐지한다.
- 클러스터/대표 문서를 관리해 인덱싱 중복 오염을 줄인다.
- 재색인과 검색에서 dedup 정책을 적용해 결과 산발을 완화한다.

## 2) 핵심 개념
- `Exact duplicate`: `file_sha256` 또는 `normalized_text_sha256` 일치
- `Near duplicate`: MinHash/LSH 기반 유사 문서 그룹
- `primary_doc_id`: 클러스터 대표 문서

## 3) DB 필드
- `documents`
  - `file_sha256`
  - `normalized_text_sha256`
  - `dedup_status`: `unique|exact_dup|near_dup|ignored`
  - `dedup_primary_doc_id`
  - `dedup_cluster_id`
- `dedup_clusters`
  - `id`, `method`, `primary_doc_id`, `threshold_used`, `notes`, `created_at`, `updated_at`
- `dedup_cluster_members`
  - `cluster_id`, `doc_id`, `similarity_score`, `is_primary`

## 4) 설정값(Environment)
- `DEDUP_MODE`: `off|exact_only|exact_and_near` (기본 `exact_only`)
- `INDEX_POLICY`: `index_all|index_primary_only|index_primary_prefer` (기본 `index_all`)
- `NEAR_DUP_JACCARD_THRESHOLD`: near duplicate 임계값 (기본 `0.93`)
- `NEAR_DUP_COSINE_THRESHOLD`: 문서 임베딩 임계값 예약 필드 (기본 `0.95`)
- `MINHASH_SHINGLE_SIZE`: 기본 `5`
- `MINHASH_NUM_PERM`: 기본 `64`
- `MINHASH_BANDS`: 기본 `8`
- `NEAR_DUP_METHOD`: `minhash|doc_embedding|hybrid` (기본 `minhash`)
- `DOC_EMBEDDING_DIMS`: 문서 해시 임베딩 차원 (기본 `256`)
- `DOC_EMBEDDING_SIMHASH_BANDS`: 문서 임베딩 후보 탐색용 simhash band 수 (기본 `8`)
- `SEARCH_CLUSTER_DIVERSITY`: 검색 결과에서 동일 클러스터 중복 노출 방지 (기본 `true`)

## 5) 관리자 API
- `GET /api/admin/dedup/clusters?status=all|near_dup|exact_dup&limit=20`
- `GET /api/admin/dedup/clusters/{cluster_id}`
- `POST /api/admin/dedup/clusters/{cluster_id}/set_primary`
  - body: `{ "primary_doc_id": 123 }`
- `POST /api/admin/dedup/documents/{doc_id}/ignore`
- `GET /api/admin/dedup/audit?limit=50`

## 6) CLI
1. Dedup 스캔
```bash
python3 -m app.cli.dedup_scan --mode both --dry-run --limit 50
```

2. 최근 N일 문서만 스캔
```bash
python3 -m app.cli.dedup_scan --mode near --days 7
```

3. 특정 범위 스캔
```bash
python3 -m app.cli.dedup_scan --mode exact --doc-id-start 100 --doc-id-end 300
```

4. 재색인(DEDUP 적용)
```bash
python3 -m app.core.indexing.reindex --dedup near --index-policy primary-only --limit 20
```

## 7) 정책 동작
- `DEDUP_MODE=exact_only`
  - exact duplicate는 기본 제외
- `DEDUP_MODE=exact_and_near` + `INDEX_POLICY=index_primary_only`
  - near duplicate는 대표 문서만 색인
- `INDEX_POLICY=index_primary_prefer`
  - 비대표 near duplicate는 검색 재랭킹에서 감점
- `NEAR_DUP_METHOD=doc_embedding`
  - SimHash 후보 축소 + 코사인 유사도로 near duplicate를 판단
