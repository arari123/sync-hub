# Sync-Hub 저장소 맵

## 빠른 링크
- 운영 규칙: `AGENTS.md`
- 실행 계획 템플릿: `PLANS.md`
- 시스템 컨텍스트: `docs/ai-system-context.md`
- 프론트 구현 가이드: `docs/ai-frontend-guide.md`
- 디자인 가이드: `docs/ai-design-guide.md`
- 개발 환경/도커 가이드: `docs/dev-setup.md`
- 세션 재개 기준: `docs/session-handover-2026-02-08.md`
- 프로젝트 입력 스펙: `docs/project-input-spec.md`

## 최상위 구성
- `app/`: FastAPI 백엔드 애플리케이션
- `frontend/`: React(Vite) 프론트엔드 애플리케이션
- `docs/`: PRD/운영 문서
- `scripts/`: 검증/리포트/유틸 스크립트
- `tests/`: Python 단위 테스트
- `uploads/`: 업로드 파일(로컬/개발)
- `.agent/execplans/`: 실행 계획 문서

## 도커/설정 파일
- `docker-compose.yml`: 개발용 서비스 오케스트레이션
  - `db`(Postgres), `web`(API), `frontend`(Vite), `elasticsearch`, `kibana`, `ollama`
- `docker-compose.gpu.yml`: GPU OCR 오버레이
  - `ocr-worker`, `paddle-vlm-server`, `sglang`(GLM OCR), 그리고 `web`의 `OCR_WORKER_URL`/의존성 확장
- `Dockerfile`: 백엔드 컨테이너(uvicorn + FastAPI)
- `frontend/Dockerfile`: 프론트 컨테이너(Vite dev 서버)
- `Dockerfile.es`: Elasticsearch 커스텀 이미지
- `Dockerfile.ocr`: OCR worker 이미지
- `Dockerfile.sglang`: GLM OCR 서버(sglang) 이미지
- `.env` / `.env.example`: 개발 환경 변수
  - Frontend API 타겟: `VITE_API_URL` (기본 `http://localhost:8001`)
  - 검색 튜닝: `HYBRID_REQUIRE_KEYWORD_MATCH`
  - OCR: `OCR_PROVIDER`, `GLM_OCR_*`, `OLLAMA_*`, `PADDLE_*`
- `requirements.txt`: 백엔드 Python 의존성
- `requirements.ocr.txt`: OCR/임베딩 등 무거운 선택 의존성
- `requirements.ocr-worker.txt`: OCR worker 최소 의존성

## 백엔드(FastAPI) `app/`
- `app/main.py`: FastAPI 앱 엔트리(라우터 include, CORS, `/health`, `/health/detail`)
- `app/database.py`: DB 엔진/세션 + 런타임 스키마 보정
- `app/models.py`: SQLAlchemy 모델(스키마)
- `app/api/`: API 라우터
  - `documents.py`: 업로드/검색/상태 API(스니펫/요약/근거문장/매칭포인트 생성 포함)
  - `auth.py`: 로그인/세션/이메일 인증 관련 API
  - `budget.py`: 프로젝트/버전/설비/예산 상세 입력 및 조회 API (`/budget/*`)
  - `admin_debug.py`: 검색 디버그 API (`/api/admin/search_debug`)
  - `admin_dedup.py`: dedup 클러스터/대표 변경/ignore/감사 로그 API (`/api/admin/dedup/*`)
- `app/core/`: 핵심 도메인 로직
  - `pipeline.py`: PDF/OCR + Excel 파싱 통합 indexing 파이프라인
  - `vector_store.py`: Elasticsearch 하이브리드 검색(BM25 + vector) + 하이라이트 병합
  - `ocr.py`: Web -> OCR worker 어댑터
  - `document_summary.py`: 문서 메타 요약 생성
  - `parsing/`: `reflow.py`, `cleaning.py`, `spreadsheet.py`
  - `chunking/`: `sentence_splitter.py`, `chunker.py`
  - `indexing/reindex.py`: 재색인 CLI 로직(`--dry-run` 지원)
  - `dedup/`: `hash.py`, `minhash.py`, `doc_embedding.py`, `policies.py`, `service.py`
- `app/cli/dedup_scan.py`: dedup 배치 스캔 CLI
- `app/ocr_worker.py`: 외부 OCR worker API (GLM/Ollama/Paddle + pypdf fallback)

## 프론트엔드(React/Vite) `frontend/`
- 엔트리
  - `frontend/src/main.jsx`: React 앱 부트스트랩
  - `frontend/src/App.jsx`: 라우팅 정의(인증/검색/프로젝트 관리)
- 라우팅(주요)
  - `/home`: `frontend/src/pages/SearchResults.jsx`
  - `/project-management`: `frontend/src/pages/BudgetManagement.jsx`
  - `/project-management/projects/new`: `frontend/src/pages/BudgetProjectCreate.jsx`
  - `/project-management/projects/:projectId`: `frontend/src/pages/BudgetProjectOverview.jsx` (프로젝트 메인/모니터)
  - `/project-management/projects/:projectId/budget`: `frontend/src/pages/BudgetProjectBudget.jsx`
  - `/project-management/projects/:projectId/edit/:section`: `frontend/src/pages/BudgetProjectEditor.jsx`
  - `/project-management/projects/:projectId/info/edit`: `frontend/src/pages/BudgetProjectInfoEdit.jsx`
  - `/project-management/projects/:projectId/agenda*`: `frontend/src/pages/AgendaList.jsx`, `AgendaCreate.jsx`, `AgendaDetail.jsx`
    - 현재는 플레이스홀더 UI이며, 백엔드 `agenda` API는 별도 구현이 필요하다.
  - `/project-management/projects/:projectId/schedule|spec|data`: `frontend/src/pages/ProjectPlaceholderPage.jsx` (플레이스홀더)
- 페이지
  - `frontend/src/pages/Login.jsx`, `Signup.jsx`, `VerifyEmail.jsx`
  - `frontend/src/pages/ProjectPlaceholderPage.jsx`: 프로젝트 컨텍스트 페이지 공용 플레이스홀더
- 컴포넌트/유틸
  - `frontend/src/components/Layout.jsx`: 라우트 유형별 레이아웃 분기 + `GlobalTopBar`
  - `frontend/src/components/ProjectContextNav.jsx`: 프로젝트 상세 상단 탭(예산/이슈/일정/사양/데이터/설정)
  - `frontend/src/components/Sidebar.jsx`, `frontend/src/components/BudgetSidebar.jsx`: 네비게이션
  - `frontend/src/lib/api.js`: axios 인스턴스 + 인증 토큰 인터셉터
  - `frontend/src/lib/session.js`: 세션/토큰 로컬 저장소 관리
  - `frontend/src/index.css`: 디자인 토큰(CSS 변수) 정의

## 검증/스크립트
- `scripts/verify_fast.sh`: 빠른 검증(파이썬 문법 체크 + 디자인 토큰 린트 + 단위 테스트)
- `scripts/verify.sh`: 전체 검증(구현/확장 예정)
- `scripts/reset_and_seed_budget_mock_data.py`: 예산 목데이터 초기화/시드
- `scripts/search_e2e_smoke.py`: 검색 E2E 스모크

## 실행 포트(기본 docker-compose 기준)
- Frontend: `http://localhost:8000/` (컨테이너 `frontend` 3000 -> 호스트 8000)
- API: `http://localhost:8001/` (컨테이너 `web` 8000 -> 호스트 8001)
- Elasticsearch: `http://localhost:9200/`
- Kibana: `http://localhost:5601/`
- Ollama: `http://localhost:11434/`
- OCR Worker(GPU 오버레이): `http://localhost:8100/`
- Paddle VLM server(GPU 오버레이): `http://localhost:8118/`
- SGLang(GLM OCR, GPU 오버레이): `http://localhost:8080/` (compose profile `glm`)

## 참고 엔드포인트
- API Health: `http://localhost:8001/health`
- API Health Detail: `http://localhost:8001/health/detail`
- API Docs: `http://localhost:8001/docs`
- 문서 검색: `GET http://localhost:8001/documents/search?q=...&limit=...`
  - 응답 형식: `{ items, page, page_size, total }`
  - `items[]` 반환 필드 예: `score`, `summary`, `snippet`, `evidence`, `match_points`, `page`, `chunk_id`, `chunk_type`, `dedup_status`, `dedup_primary_doc_id`, `dedup_cluster_id`
- 검색 디버그: `GET http://localhost:8001/api/admin/search_debug?q=...&limit=...`
  - 반환 필드 예: `request_id`, `vector_topk`, `bm25_topk`, `fused_topk`, `search_mode`
- Dedup 관리자: `http://localhost:8001/api/admin/dedup/clusters`
  - 대표 변경: `POST /api/admin/dedup/clusters/{cluster_id}/set_primary`
  - 문서 제외: `POST /api/admin/dedup/documents/{doc_id}/ignore`
  - 감사 로그: `GET /api/admin/dedup/audit?limit=50`

