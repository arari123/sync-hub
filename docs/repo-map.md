# Sync-Hub Repository Map

## Core Folders
- `app/`: FastAPI backend application.
  - `main.py`: Entry point for the API.
  - `models.py`: SQLAlchemy models (Database schema).
  - `database.py`: DB engine and session configuration.
  - `api/documents.py`: Upload/search/status API, 스니펫/요약/근거문장/매칭포인트 생성 및 재랭킹.
  - `api/admin_debug.py`: 벡터/BM25 검색 디버그 API (`/api/admin/search_debug`).
  - `api/admin_dedup.py`: dedup 클러스터 조회/대표 변경/문서 ignore 관리자 API.
  - `core/pipeline.py`: PDF parsing + OCR fallback + 문장/문단 기반 chunk indexing pipeline.
  - `core/dedup/hash.py`: 파일/정규화 텍스트 SHA-256 계산.
  - `core/dedup/minhash.py`: MinHash/LSH 기반 near duplicate 후보 탐색.
  - `core/dedup/policies.py`: dedup/index 정책 판정.
  - `core/dedup/service.py`: exact/near dedup 클러스터 오케스트레이션.
  - `core/parsing/reflow.py`: bbox 기반 컬럼 감지/리플로우 + 병렬 컬럼 분리 + 표 후보 분리.
  - `core/parsing/cleaning.py`: 헤더/푸터 반복 제거, 하이픈 복원, soft line break 정리.
  - `core/chunking/sentence_splitter.py`: 한/영 혼합 문장 경계 분리.
  - `core/chunking/chunker.py`: sentence-aware chunk 생성 + overlap + table row sentence 변환.
  - `core/indexing/reindex.py`: 재색인 CLI (`--dry-run` 지원).
  - `cli/dedup_scan.py`: dedup 배치 스캔 CLI.
  - `core/vector_store.py`: Elasticsearch 하이브리드 검색(BM25 + vector) + 키워드 우선 랭킹/하이라이트 병합.
  - `core/ocr.py`: Web -> OCR worker adapter.
  - `ocr_worker.py`: External OCR worker API (GLM/Ollama/Paddle + pypdf fallback).
- `frontend/`: React UI.
  - `src/App.jsx`: 검색/결과/상세/업로드/헬스 패널 UI 및 답변형 결과 카드 렌더링(요약+근거).
  - `src/App.css`: 결과 카드/상태 패널/하이라이트/매칭포인트 스타일.
- `docs/`: Project documentation and PRD.
  - `reflow-chunking.md`: 리플로우/문장 청킹/표 분리/디버그 API/재색인 CLI 운영 가이드.
  - `dedup.md`: exact/near dedup 정책, 관리자 API, CLI 운영 가이드.
- `.agent/execplans/`: Execution plans for features.

## Configuration
- `Dockerfile`: Backend container build instructions.
- `Dockerfile.ocr`: OCR worker container build instructions.
- `docker-compose.yml`: Main service orchestration (Web, DB).
- `docker-compose.gpu.yml`: OCR GPU worker overlay compose.
- `.env`: Environment variables (Secrets).
  - OCR provider flags: `OCR_PROVIDER`, `GLM_OCR_*`, `OLLAMA_*`, `PADDLE_*`.
  - Search tuning flag: `HYBRID_REQUIRE_KEYWORD_MATCH`.
- `requirements.txt`: Python dependencies.
- `requirements.ocr.txt`: OCR/임베딩 등 무거운 선택 의존성.
- `requirements.ocr-worker.txt`: OCR worker 최소 의존성.

## Key Entry Points
- API Root: `http://localhost:8000/`
- API Health: `http://localhost:8000/health`
- API Health Detail: `http://localhost:8000/health/detail`
- API Search: `http://localhost:8000/documents/search?q=...&limit=...`
  - 반환 필드: `score`, `raw_score`, `summary`, `snippet`, `evidence`, `match_points`, `page`, `chunk_id`, `chunk_type`, `dedup_status`, `dedup_primary_doc_id`, `dedup_cluster_id`
- Admin Search Debug: `http://localhost:8000/api/admin/search_debug?q=...&limit=...`
  - 반환 필드: `request_id`, `vector_topk`, `bm25_topk`, `fused_topk`, `search_mode`
- Admin Dedup: `http://localhost:8000/api/admin/dedup/clusters`
  - 대표 변경: `POST /api/admin/dedup/clusters/{cluster_id}/set_primary`
  - 문서 제외: `POST /api/admin/dedup/documents/{doc_id}/ignore`
  - 감사 로그: `GET /api/admin/dedup/audit?limit=50`
- API Docs: `http://localhost:8000/docs`
