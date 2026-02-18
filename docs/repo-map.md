# Sync-Hub Repository Map

- 업데이트 기준: 2026-02-16

## 빠른 문서 링크
- 시스템/프론트/디자인 컨텍스트: `docs/ai-system-context.md`, `docs/ai-frontend-guide.md`, `docs/ai-design-guide.md`
- 저장소 운영 규칙: `AGENTS.md`
- localhost 시작/복구 가이드: `docs/localhost-startup.md`
- 배포 가이드: `docs/backend-deploy.md`
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
- `.firebase/`: Firebase 로컬 상태/캐시 파일

## Backend (`app/`)
- `app/main.py`: FastAPI 앱 생성, CORS, 라우터 등록, 헬스체크
- `app/models.py`: SQLAlchemy 모델(인증/문서/예산/안건 포함)
- `app/database.py`: DB 엔진/세션, 런타임 스키마 보정
- `app/api/`
  - `auth.py`: 회원가입/이메일 인증/로그인/로그아웃/사용자 조회
  - `documents.py`: 문서 업로드/검색/다운로드/상세
  - `budget.py`: 프로젝트/버전/예산 상세 CRUD 및 요약
  - `agenda.py`: 안건 메타/작성/임시저장/답변/댓글/상태/재등록 payload
  - `data_hub.py`: 임시 데이터 허브(문서 업로드/검색/AI 답변) API
  - `admin_debug.py`: 검색 디버그 API
  - `admin_dedup.py`: dedup 클러스터 관리자 API
- `app/core/`
  - `pipeline.py`: 문서 처리 파이프라인(OCR/파싱/청킹/임베딩)
  - `vector_store.py`: Elasticsearch 하이브리드 검색
  - `document_summary.py`: 문서 유형 분류/요약
  - `ocr.py`: OCR 워커 헬스체크/연동
  - `budget_logic.py`: 예산 집계/정규화 로직
  - `admin_access.py`: 관리자 식별(환경변수 기반) 유틸
  - `auth_utils.py`, `auth_mailer.py`: 인증 유틸/메일 발송
  - `html_sanitizer.py`: 안건 리치 텍스트 HTML allow-list sanitize(XSS 방어)
  - `data_hub_ai.py`: 데이터 허브 RAG 컨텍스트/프롬프트/캐시 유틸
  - `gemini_client.py`: Gemini API(Flash) 호출 클라이언트(urllib 기반)
  - `parsing/`, `chunking/`, `dedup/`, `indexing/`: 파싱/청킹/dedup/재색인 모듈
- `app/cli/dedup_scan.py`: dedup 배치 스캔 CLI
- `app/ocr_worker.py`: OCR 워커 FastAPI 서비스 엔트리포인트
- `app/ocr_parsing_utils.py`: OCR 결과 정규화/후처리 유틸

## Frontend (`frontend/src/`)
- `main.jsx`: React 엔트리
- `App.jsx`: 전체 라우팅 정의
- `components/`
  - `Layout.jsx`: 라우트별 공통 레이아웃/상단바 분기
  - `ProtectedRoute.jsx`: 인증 가드
  - `GlobalTopBar.jsx`: 전역 상단바(검색/퀵메뉴/사용자)
  - `UserMenu.jsx`: 상단바 사용자 메뉴(이름/이메일 표시 + 로그아웃)
  - `ProjectResultList.jsx`: 프로젝트 검색 결과(구글형 리스트, 매칭 이유/스니펫/하이라이트 표시)
  - `HealthStatus.jsx`: 백엔드/의존성 헬스 상태 표시
  - `ProjectPageHeader.jsx`, `ProjectContextNav.jsx`: 프로젝트 페이지 브레드크럼/서브메뉴
  - `BudgetBreadcrumb.jsx`, `BudgetSidebar.jsx`: 예산 브레드크럼/입력 트리 네비게이션
  - `agenda/RichTextEditor.jsx`: 안건 작성용 리치 텍스트 에디터
  - `agenda/AgendaSplitView.jsx`: 안건 아웃룩형 Split View(좌측 엔트리 리스트/우측 상세, 리스트 접기/펼치기)
  - `budget-dashboard/*Tab.jsx`: 예산 탭 UI 구성 컴포넌트
  - `ui/`: 공용 UI primitives (`Button`, `Input`, `Logo`)
- `pages/`
  - `SearchResults.jsx`: 홈(`/home`) 탭(내프로젝트/전체프로젝트/전체안건) + 프로젝트 리스트 + 전체안건 Split View + 검색결과 UI
  - `DataHub.jsx`: 임시 데이터 허브(`/data-hub`) 문서 검색 + AI 답변 + 관리자 업로드
  - `BudgetManagement.jsx`: 레거시 프로젝트 목록 페이지(현재 `App.jsx`에서 직접 라우트 연결 없이 레거시 리다이렉트만 유지)
  - `BudgetProjectOverview.jsx`: 프로젝트 메인(상세 요약)
  - `BudgetProjectBudget.jsx`: 예산 메인(통합요약/재료비/인건비/경비)
  - `BudgetProjectEditor.jsx`: 재료비/인건비/경비 입력 탭
  - `BudgetProjectCreate.jsx`, `BudgetProjectInfoEdit.jsx`: 프로젝트 생성/설정
  - `BudgetProjectScheduleManagement.jsx`: 프로젝트 일정 통합 조회/필터/타임라인 관리 페이지
  - `BudgetProjectSchedule.jsx`: 프로젝트 공통 일정(WBS) 작성/편집 페이지
  - `AgendaList.jsx`, `AgendaCreate.jsx`, `AgendaDetail.jsx`: 안건 목록(Split View)/작성/상세
  - `ProjectPlaceholderPage.jsx`: 사양/데이터 관리 임시 페이지
  - `Login.jsx`, `Signup.jsx`, `VerifyEmail.jsx`: 인증 페이지
- `lib/`
  - `api.js`: API 호출 래퍼
  - `agendaSeen.js`: 안건 미확인(조회 기준) localStorage 유틸
  - `budgetSync.js`: 예산 데이터 갱신 브로드캐스트(입력/조회 페이지 동기화)
  - `download.js`: Authorization 포함 blob 다운로드 유틸(문서/첨부 공용)
  - `scheduleUtils.js`: WBS 일정 정규화/연쇄 계산/간트 유틸
  - `session.js`: 인증 세션 저장/조회
  - `highlight.jsx`, `utils.js`: 표시/유틸 함수

## 주요 프론트 라우트
- `/`: `/home` 리다이렉트
- `/home`: 메인 검색 페이지
- `/data-hub`: 데이터 허브(임시) - PDF 업로드/검색/AI 답변
- `/search`: `/home` 리다이렉트(레거시)
- `/project-management`: 레거시 경로(현재 `/home` 리다이렉트)
- `/project-management/projects/new`: 프로젝트 생성
- `/project-management/projects/:projectId`: 프로젝트 메인
- `/project-management/projects/:projectId/info/edit`: 프로젝트 정보 수정
- `/project-management/projects/:projectId/budget`: 예산 메인
- `/project-management/projects/:projectId/budget-dashboard`: `/project-management/projects/:projectId/budget` 리다이렉트(레거시)
- `/project-management/projects/:projectId/edit/:section`: 예산 상세 편집(`material|labor|expense`)
- `/project-management/projects/:projectId/agenda`: 안건 목록
- `/project-management/projects/:projectId/agenda/new`: 안건 작성
- `/project-management/projects/:projectId/agenda/:agendaId`: 안건 상세
- `/project-management/projects/:projectId/joblist`: `/project-management/projects/:projectId/agenda` 리다이렉트(레거시)
- `/project-management/projects/:projectId/schedule`: 일정 관리(통합 조회)
- `/project-management/projects/:projectId/schedule/write`: 일정 작성(WBS 편집)
- `/project-management/projects/:projectId/spec`: 사양(임시)
- `/project-management/projects/:projectId/data`: 데이터 관리(임시)
- `/knowledge`, `/settings`: `/home` 리다이렉트
- `/budget-management/*`: `/project-management/*` 리다이렉트(레거시)

## 주요 API 엔드포인트
- 기본/헬스: `GET /`, `GET /health`, `GET /health/detail`
- 인증: `/auth/signup`, `/auth/verify-email`, `/auth/login`, `/auth/me`, `/auth/users`, `/auth/logout`
- 문서: `/documents/upload`, `/documents/search`, `/documents/{doc_id}`, `/documents/{doc_id}/download`
- 데이터 허브(임시): `/data-hub/permissions`, `/data-hub/documents/upload`, `/data-hub/ask`
- 예산:
  - 프로젝트: `GET /budget/projects`, `GET /budget/projects/search`(매칭 이유/스니펫 포함), `POST /budget/projects`, `GET/PUT /budget/projects/{project_id}`, `GET /budget/projects/{project_id}/summary`
  - 프로젝트 커버: `POST /budget/project-covers/upload`, `GET /budget/project-covers/{stored_filename}`
  - 일정: `GET/PUT /budget/projects/{project_id}/schedule`
  - 버전: `/budget/projects/{project_id}/versions`, `/budget/versions/{version_id}/confirm`, `/budget/versions/{version_id}/confirm-cancel`, `/budget/versions/{version_id}/revision`
  - 상세: `GET/PUT /budget/versions/{version_id}/equipments`, `GET/PUT /budget/versions/{version_id}/details`
- 안건:
  - 메타/목록/검색: `/agenda/projects/{project_id}/meta`, `/agenda/projects/{project_id}/threads`, `/agenda/projects/{project_id}/drafts`, `GET /agenda/projects/{project_id}/entries`, `GET /agenda/entries/my`, `GET /agenda/threads/search`, `GET /agenda/threads/my`
  - 생성/수정: `POST /agenda/projects/{project_id}/threads`, `PUT /agenda/threads/{thread_id}/draft`, `POST /agenda/threads/{thread_id}/replies`
  - 상세/코멘트: `GET /agenda/threads/{thread_id}`, `GET /agenda/threads/{thread_id}/entries/{entry_id}`, `GET/POST /agenda/threads/{thread_id}/comments`
  - 상태/재등록/첨부: `/agenda/threads/{thread_id}/status`, `/agenda/threads/{thread_id}/reregister-payload`, `/agenda/attachments/{attachment_id}/download`
- 관리자:
  - 검색 디버그: `/api/admin/search_debug`
  - dedup: `/api/admin/dedup/clusters`, `/api/admin/dedup/clusters/{cluster_id}`, `/api/admin/dedup/clusters/{cluster_id}/set_primary`, `/api/admin/dedup/documents/{doc_id}/ignore`, `/api/admin/dedup/audit`

## 검증/운영 스크립트
- localhost 시작/복구: `scripts/start_localhost.sh`
- Cloud Run 백엔드 배포: `scripts/deploy_backend_cloudrun.sh`
- 빠른 검증: `scripts/verify_fast.sh`
- 전체 검증: `scripts/verify.sh`
- 디자인 토큰 린트: `scripts/lint_frontend_design_tokens.py`
- 예산 목업 데이터 초기화: `scripts/reset_and_seed_budget_mock_data.py`
- 데모 데이터 초기화/생성(프로젝트/안건/예산/일정): `scripts/reset_and_seed_demo_data.py`
- 안건 본문 장문화(로컬 데모 데이터): `scripts/expand_agenda_bodies.py`
- 검색 E2E 스모크: `scripts/search_e2e_smoke.py`
- OCR 품질/비교 리포트: `scripts/generate_ocr_quality_report.py`, `scripts/generate_ocr_comparison_report.py`

## 테스트
- 테스트 위치: `tests/`
- 핵심 범위: 인증(`test_auth_utils.py`), 예산(`test_budget_*`), 안건 검색(`test_agenda_search.py`), 문서 파이프라인/요약/dedup/청킹

## 인프라/설정 파일
- Compose: `docker-compose.yml`, `docker-compose.gpu.yml`
- Dockerfile: `Dockerfile`, `Dockerfile.ocr`, `Dockerfile.es`, `Dockerfile.sglang`
- Docker build ignore: `.dockerignore`
- 의존성: `requirements.txt`, `requirements.ocr.txt`, `requirements.ocr-worker.txt`
- 환경변수: `.env`, `.env.example`
- Firebase Hosting: `firebase.json`, `.firebaserc`

## 참고
- `frontend/dist`, `frontend/node_modules`, `uploads/`, `reports/`는 빌드/런타임 산출물이 포함될 수 있다.
- `frontend_corrupted/`는 운영 코드 경로가 아니며 복구/비교용 잔존 디렉토리다.
