# Sync-Hub Repository Map

## 빠른 문서 링크
- 시스템/프론트/디자인 컨텍스트: `docs/ai-system-context.md`, `docs/ai-frontend-guide.md`, `docs/ai-design-guide.md`
- 저장소 운영 규칙: `AGENTS.md`
- PRD 템플릿/실행 계획: `docs/prd/`, `.agent/execplans/`, `PLANS.md`
- 세션 재개 기준: `docs/session-handover-2026-02-08.md`
- 프로젝트 입력 스펙: `docs/project-input-spec.md`

## 최상위 디렉토리
- `app/`: FastAPI 백엔드
- `frontend/`: React(Vite) 프론트엔드
- `docs/`: PRD/설계/운영 문서 및 예제 HTML
- `tests/`: 백엔드 단위 테스트
- `scripts/`: 검증/유틸 스크립트
- `uploads/`: 런타임 업로드 파일(문서/안건 첨부)
- `reports/`: OCR/리포트 산출물
- `.agent/execplans/`: 작업 실행 계획 문서

## Backend (`app/`)
- `app/main.py`: FastAPI 앱 생성, CORS, 라우터 등록, 헬스체크
- `app/models.py`: SQLAlchemy 모델(인증/문서/예산/안건 포함)
- `app/database.py`: DB 엔진/세션, 런타임 스키마 보정
- `app/api/`
  - `auth.py`: 회원가입/이메일 인증/로그인/로그아웃/사용자 조회
  - `documents.py`: 문서 업로드/검색/다운로드/상세
  - `budget.py`: 프로젝트/버전/예산 상세 CRUD 및 요약
  - `agenda.py`: 안건 메타/작성/임시저장/답변/댓글/상태/재등록 payload
  - `admin_debug.py`: 검색 디버그 API
  - `admin_dedup.py`: dedup 클러스터 관리자 API
- `app/core/`
  - `pipeline.py`: 문서 처리 파이프라인(OCR/파싱/청킹/임베딩)
  - `vector_store.py`: Elasticsearch 하이브리드 검색
  - `document_summary.py`: 문서 유형 분류/요약
  - `ocr.py`, `ocr_worker.py`: OCR 워커 연동/워커 API
  - `budget_logic.py`: 예산 집계/정규화 로직
  - `auth_utils.py`, `auth_mailer.py`: 인증 유틸/메일 발송
  - `parsing/`, `chunking/`, `dedup/`, `indexing/`: 파싱/청킹/dedup/재색인 모듈
- `app/cli/dedup_scan.py`: dedup 배치 스캔 CLI

## Frontend (`frontend/src/`)
- `main.jsx`: React 엔트리
- `App.jsx`: 전체 라우팅 정의
- `components/`
  - `Layout.jsx`: 라우트별 공통 레이아웃/상단바 분기
  - `GlobalTopBar.jsx`: 전역 상단바(검색/퀵메뉴/사용자)
  - `ProjectPageHeader.jsx`, `ProjectContextNav.jsx`: 프로젝트 페이지 브레드크럼/서브메뉴
  - `BudgetBreadcrumb.jsx`, `BudgetSidebar.jsx`: 프로젝트 문맥 네비게이션
  - `agenda/RichTextEditor.jsx`: 안건 작성용 리치 텍스트 에디터
  - `budget-dashboard/*Tab.jsx`: 예산 탭 UI 구성 컴포넌트
  - `ui/`: 공용 UI primitives (`Button`, `Input`, `Logo`)
- `pages/`
  - `SearchResults.jsx`: 홈(`/home`) 통합 검색 화면
  - `BudgetManagement.jsx`: 프로젝트 목록 메인
  - `BudgetProjectOverview.jsx`: 프로젝트 메인(상세 요약)
  - `BudgetProjectBudget.jsx`: 예산 메인
  - `BudgetProjectEditor.jsx`: 재료비/인건비/경비 입력 탭
  - `BudgetProjectCreate.jsx`, `BudgetProjectInfoEdit.jsx`: 프로젝트 생성/설정
  - `AgendaList.jsx`, `AgendaCreate.jsx`, `AgendaDetail.jsx`: 안건 목록/작성/상세
  - `ProjectPlaceholderPage.jsx`: 일정/사양/데이터 관리 임시 페이지
  - `Login.jsx`, `Signup.jsx`, `VerifyEmail.jsx`: 인증 페이지
- `lib/`
  - `api.js`: API 호출 래퍼
  - `session.js`: 인증 세션 저장/조회
  - `highlight.jsx`, `utils.js`: 표시/유틸 함수

## 주요 프론트 라우트
- `/home`: 메인 검색 페이지
- `/project-management`: 프로젝트 목록
- `/project-management/projects/new`: 프로젝트 생성
- `/project-management/projects/:projectId`: 프로젝트 메인
- `/project-management/projects/:projectId/budget`: 예산 메인
- `/project-management/projects/:projectId/edit/:section`: 예산 상세 편집(`material|labor|expense`)
- `/project-management/projects/:projectId/agenda`: 안건 목록
- `/project-management/projects/:projectId/agenda/new`: 안건 작성
- `/project-management/projects/:projectId/agenda/:agendaId`: 안건 상세
- `/project-management/projects/:projectId/schedule`: 일정(임시)
- `/project-management/projects/:projectId/spec`: 사양(임시)
- `/project-management/projects/:projectId/data`: 데이터 관리(임시)

## 주요 API 엔드포인트
- 기본/헬스: `GET /`, `GET /health`, `GET /health/detail`
- 인증: `/auth/signup`, `/auth/verify-email`, `/auth/login`, `/auth/me`, `/auth/users`, `/auth/logout`
- 문서: `/documents/upload`, `/documents/search`, `/documents/{doc_id}`, `/documents/{doc_id}/download`
- 예산:
  - 프로젝트: `/budget/projects`, `/budget/projects/search`, `/budget/projects/{project_id}`, `/budget/projects/{project_id}/summary`
  - 버전: `/budget/projects/{project_id}/versions`, `/budget/versions/{version_id}/confirm`, `/budget/versions/{version_id}/revision`
  - 상세: `/budget/versions/{version_id}/equipments`, `/budget/versions/{version_id}/details`
- 안건:
  - 메타/목록: `/agenda/projects/{project_id}/meta`, `/agenda/projects/{project_id}/threads`, `/agenda/projects/{project_id}/drafts`
  - 생성/수정: `/agenda/projects/{project_id}/threads`, `/agenda/threads/{thread_id}/draft`, `/agenda/threads/{thread_id}/replies`
  - 상세/코멘트: `/agenda/threads/{thread_id}`, `/agenda/threads/{thread_id}/entries/{entry_id}`, `/agenda/threads/{thread_id}/comments`
  - 상태/재등록/첨부: `/agenda/threads/{thread_id}/status`, `/agenda/threads/{thread_id}/reregister-payload`, `/agenda/attachments/{attachment_id}/download`
- 관리자:
  - 검색 디버그: `/api/admin/search_debug`
  - dedup: `/api/admin/dedup/clusters`, `/api/admin/dedup/clusters/{cluster_id}`, `/api/admin/dedup/audit`

## 검증/운영 스크립트
- 빠른 검증: `scripts/verify_fast.sh`
- 전체 검증: `scripts/verify.sh`
- 디자인 토큰 린트: `scripts/lint_frontend_design_tokens.py`
- 예산 목업 데이터 초기화: `scripts/reset_and_seed_budget_mock_data.py`

## 테스트
- 테스트 위치: `tests/`
- 핵심 범위: 인증(`test_auth_utils.py`), 예산(`test_budget_*`), 안건 검색(`test_agenda_search.py`), 문서 파이프라인/요약/dedup/청킹

## 인프라/설정 파일
- Compose: `docker-compose.yml`, `docker-compose.gpu.yml`
- Dockerfile: `Dockerfile`, `Dockerfile.ocr`, `Dockerfile.es`, `Dockerfile.sglang`
- 의존성: `requirements.txt`, `requirements.ocr.txt`, `requirements.ocr-worker.txt`
- 환경변수: `.env`, `.env.example`

## 참고
- `frontend/dist`, `frontend/node_modules`, `uploads/`, `reports/`는 빌드/런타임 산출물이 포함될 수 있다.
- `frontend_corrupted/`는 운영 코드 경로가 아니며 복구/비교용 잔존 디렉토리다.
