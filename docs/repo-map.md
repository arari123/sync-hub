# Sync-Hub Repository Map

## AI Quick Links
- 시스템 컨텍스트: `docs/ai-system-context.md`
- 프론트 구현 가이드: `docs/ai-frontend-guide.md`
- 디자인 가이드: `docs/ai-design-guide.md`
- 세션 재개 기준: `docs/session-handover-2026-02-08.md`

## Core Folders
- `app/`: FastAPI backend application.
  - `main.py`: Entry point for the API.
  - `models.py`: SQLAlchemy models (Database schema).
  - `database.py`: DB engine and session configuration.
  - `api/documents.py`: Upload/search/status API, 스니펫/요약/근거문장/매칭포인트 생성 및 재랭킹.
  - `api/admin_debug.py`: 벡터/BM25 검색 디버그 API (`/api/admin/search_debug`).
  - `api/admin_dedup.py`: dedup 클러스터 조회/대표 변경/문서 ignore 관리자 API.
  - `core/pipeline.py`: PDF/OCR + Excel 파싱을 통합한 문장/문단 기반 chunk indexing pipeline.
  - `core/dedup/hash.py`: 파일/정규화 텍스트 SHA-256 계산.
  - `core/dedup/minhash.py`: MinHash/LSH 기반 near duplicate 후보 탐색.
  - `core/dedup/policies.py`: dedup/index 정책 판정.
  - `core/dedup/service.py`: exact/near dedup 클러스터 오케스트레이션.
  - `core/parsing/reflow.py`: bbox 기반 컬럼 감지/리플로우 + 병렬 컬럼 분리 + 표 후보 분리.
  - `core/parsing/cleaning.py`: 헤더/푸터 반복 제거, 하이픈 복원, soft line break 정리.
  - `core/parsing/spreadsheet.py`: Excel/CSV 시트 텍스트 추출 및 표/행 문장 세그먼트 생성.
  - `core/chunking/sentence_splitter.py`: 한/영 혼합 문장 경계 분리.
  - `core/chunking/chunker.py`: sentence-aware chunk 생성 + overlap + table row sentence 변환.
  - `core/indexing/reindex.py`: 재색인 CLI (`--dry-run` 지원).
  - `cli/dedup_scan.py`: dedup 배치 스캔 CLI.
  - `core/vector_store.py`: Elasticsearch 하이브리드 검색(BM25 + vector) + 키워드 우선 랭킹/하이라이트 병합.
  - `core/ocr.py`: Web -> OCR worker adapter.
  - `ocr_worker.py`: External OCR worker API (GLM/Ollama/Paddle + pypdf fallback).
- `frontend/`: React UI.
  - `src/App.jsx`: 라우팅 엔트리(`/search`, `/project-management`, 인증 라우트).
  - `src/components/Layout.jsx`: 인증 상태별 레이아웃 분기(사이드바/비사이드바).
  - `src/components/Sidebar.jsx`: 1차 네비게이션, 사용자 정보, 로그아웃.
  - `src/pages/Home.jsx`: 홈 대시보드/검색 진입/업로드 위젯.
  - `src/pages/SearchResults.jsx`: 프로젝트+문서 통합 검색 결과 화면.
  - `src/pages/BudgetManagement.jsx`: 프로젝트 관리 메인(필터/정렬/모니터링 카드).
  - `src/pages/BudgetProjectOverview.jsx`: 프로젝트 상세 모니터링 화면.
  - `src/pages/BudgetProjectBudget.jsx`: 예산 관리 요약/입력 진입 화면.
  - `src/pages/BudgetProjectEditor.jsx`: 재료비/인건비/경비 상세 입력 화면.
- `docs/`: Project documentation and PRD.
  - `dev-setup.md`: Docker/비도커 개발 환경 구성 및 종속성 점검 가이드.
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
- Frontend: `http://localhost:8000/`
- API Root: `http://localhost:8001/`
- API Health: `http://localhost:8001/health`
- API Health Detail: `http://localhost:8001/health/detail`
- API Search: `http://localhost:8001/documents/search?q=...&limit=...`
  - 응답 형식: `{ items, page, page_size, total }`
  - `items[]` 반환 필드: `score`, `raw_score`, `summary`, `snippet`, `evidence`, `match_points`, `page`, `chunk_id`, `chunk_type`, `dedup_status`, `dedup_primary_doc_id`, `dedup_cluster_id`
- Admin Search Debug: `http://localhost:8001/api/admin/search_debug?q=...&limit=...`
  - 반환 필드: `request_id`, `vector_topk`, `bm25_topk`, `fused_topk`, `search_mode`
- Admin Dedup: `http://localhost:8001/api/admin/dedup/clusters`
  - 대표 변경: `POST /api/admin/dedup/clusters/{cluster_id}/set_primary`
  - 문서 제외: `POST /api/admin/dedup/documents/{doc_id}/ignore`
  - 감사 로그: `GET /api/admin/dedup/audit?limit=50`
- API Docs: `http://localhost:8001/docs`
