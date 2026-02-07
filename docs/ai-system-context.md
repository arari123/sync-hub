# AI 시스템 컨텍스트 가이드

## 1. 문서 목적
- 이 문서는 Sync-Hub를 처음 접하는 AI/에이전트가 코드베이스를 빠르게 이해하고, 변경 영향을 정확히 판단하도록 돕는 운영 기준 문서다.
- 구현 전 최소 확인 문서: `AGENTS.md`, `docs/repo-map.md`, 본 문서.

## 2. 5분 온보딩
- 실행 원칙: Docker 100% 의존(비도커 실행 금지)
- 프론트: `http://localhost:8000`
- API: `http://localhost:8001`
- API 문서: `http://localhost:8001/docs`
- 주요 컨테이너: `synchub_frontend`, `synchub_web`, `synchub_db`, `synchub_es`, `synchub_ocr`, `synchub_ollama`

빠른 상태 점검:
```bash
curl -s http://localhost:8001/health/detail
curl -s http://localhost:8100/health
```

## 3. 시스템 구조 한눈에 보기

### 3.1 백엔드 레이어
- API 진입: `app/main.py`
- API 라우터:
  - 문서: `app/api/documents.py`
  - 프로젝트/예산: `app/api/budget.py`
  - 인증: `app/api/auth.py`
  - 관리자 디버그: `app/api/admin_debug.py`, `app/api/admin_dedup.py`
- 도메인/파이프라인:
  - 색인 파이프라인: `app/core/pipeline.py`
  - 요약/문서타입 분류: `app/core/document_summary.py`
  - 검색 엔진: `app/core/vector_store.py`
  - OCR 워커: `app/ocr_worker.py`
- 영속성:
  - 모델: `app/models.py`
  - DB 세션: `app/database.py`

### 3.2 프론트엔드 레이어
- 라우팅 엔트리: `frontend/src/App.jsx`
- 공통 레이아웃: `frontend/src/components/Layout.jsx`, `frontend/src/components/Sidebar.jsx`
- 핵심 페이지:
  - 홈: `frontend/src/pages/Home.jsx`
  - 검색: `frontend/src/pages/SearchResults.jsx`
  - 프로젝트 관리: `frontend/src/pages/BudgetManagement.jsx`
  - 프로젝트 상세: `frontend/src/pages/BudgetProjectOverview.jsx`
  - 예산 관리: `frontend/src/pages/BudgetProjectBudget.jsx`
  - 예산 입력: `frontend/src/pages/BudgetProjectEditor.jsx`
  - 인증: `frontend/src/pages/Login.jsx`, `frontend/src/pages/Signup.jsx`, `frontend/src/pages/VerifyEmail.jsx`
- UI 토큰/기초 스타일: `frontend/src/index.css`, `frontend/src/components/ui/*`

## 4. 핵심 도메인 모델
- `Document`
  - 파일 메타 + 본문 텍스트 + 문서타입(`document_types`) + AI 제목/요약 + dedup 상태 + 프로젝트 연결(`project_id`)
- `BudgetProject`
  - 프로젝트 기본정보 + 담당자(`manager_user_id`) + 프로젝트 종류 + 현재 단계
- `BudgetVersion`
  - 단계(`review|fabrication|installation|warranty|closure`), 상태(`draft|confirmed|revision`), 버전/리비전
- `BudgetEquipment`
  - 설비별 재료/인건비/경비 집계(제작/설치 축)
- `User/AuthSession/EmailVerificationToken`
  - 메일 인증 기반 가입/로그인/세션

## 5. 핵심 처리 플로우

### 5.1 인증 플로우
1. `POST /auth/signup` (허용 도메인 체크 + 이메일 인증 토큰 발급)
2. `POST /auth/verify-email` (활성화)
3. `POST /auth/login` (세션 토큰 발급)
4. 프론트 `session.js`가 토큰 저장, Axios 인터셉터가 `Authorization` 자동 첨부

### 5.2 문서 업로드/색인 플로우
1. `POST /documents/upload`
2. `documents.status=pending` 생성
3. 백그라운드 파이프라인(`process_document`) 실행
4. PDF/Excel 파싱 + OCR fallback + 문장/표 청킹
5. 임베딩 생성 + Elasticsearch 인덱싱
6. `status=completed`, 문서타입/AI 제목/요약 저장

### 5.3 검색 플로우(통합)
1. 프론트 `SearchResults`가 병렬 호출
   - `GET /documents/search`
   - `GET /budget/projects/search`
2. 프로젝트 검색 API 실패 시 `GET /budget/projects` 후 프론트 로컬 스코어링 fallback
3. UI 표시
   - 프로젝트 결과: 이름/개요/고객사/담당자/단계
   - 문서 결과: 제목/파일명/요약/문서타입/페이지/점수

### 5.4 프로젝트 관리 플로우
1. 프로젝트 목록: `GET /budget/projects` (+ 필터/정렬 파라미터)
2. 프로젝트 생성: `POST /budget/projects` 후 `POST /budget/projects/{id}/versions`
3. 상세 모니터링: `GET /budget/projects/{id}/versions` + `GET /budget/versions/{id}/equipments`
4. 예산 입력: `PUT /budget/versions/{id}/details`
5. 버전 확정/리비전: `POST /budget/versions/{id}/confirm`, `POST /budget/versions/{id}/revision`

## 6. API 그룹 요약

### 6.1 Auth
- `POST /auth/signup`
- `POST /auth/verify-email`
- `POST /auth/login`
- `GET /auth/me`
- `GET /auth/users`
- `POST /auth/logout`

### 6.2 Documents
- `POST /documents/upload`
- `GET /documents/search`
- `GET /documents/{doc_id}`
- `GET /documents/{doc_id}/download`

### 6.3 Project/Budget
- `GET /budget/projects`
- `GET /budget/projects/search`
- `POST /budget/projects`
- `GET /budget/projects/{project_id}/versions`
- `POST /budget/projects/{project_id}/versions`
- `GET/PUT /budget/versions/{version_id}/details`
- `GET/PUT /budget/versions/{version_id}/equipments`
- `POST /budget/versions/{version_id}/confirm`
- `POST /budget/versions/{version_id}/revision`
- `GET /budget/projects/{project_id}/summary`

### 6.4 Admin Debug
- `GET /api/admin/search_debug`
- `GET /api/admin/dedup/clusters`
- `POST /api/admin/dedup/clusters/{cluster_id}/set_primary`
- `POST /api/admin/dedup/documents/{doc_id}/ignore`

## 7. 프론트 라우팅 요약
- `/login`, `/signup`, `/verify-email`
- `/` 홈
- `/search` 검색 결과
- `/project-management` 프로젝트 관리
- `/project-management/projects/new` 프로젝트 생성
- `/project-management/projects/:projectId` 프로젝트 상세
- `/project-management/projects/:projectId/budget` 예산 관리
- `/project-management/projects/:projectId/edit/:section` 예산 입력
- `/budget-management/*`는 레거시 리다이렉트

## 8. 현재 프론트 변경 핵심(요약)
- 상단 버튼형 네비게이션에서 좌측 사이드바 구조로 전환
- 검색 결과를 문서/프로젝트 2개 섹션으로 분리
- 프로젝트 관리 필터는 compact 형태로 통일
- 인증(로그인/가입/메일인증) 화면을 프론트 라우트로 통합
- 디자인 토큰(`index.css`) 기반 스타일링 일관성 강화

## 9. AI 작업 시 필수 규칙
- 문서/사용자 커뮤니케이션: 한국어
- 코드/변수명: 영어
- Docker 외 실행 경로 사용 금지
- 완료 기준: `npm run verify:fast`(필요 시 `npm run verify`)
- 가능하면 변경 단위별 검증, 커밋, 푸시까지 수행

## 10. 작업 전/후 체크리스트
- 변경 전
  - 관련 API/컴포넌트 실제 호출 경로 확인
  - 기존 라우팅/레이아웃 흐름 파괴 여부 검토
- 변경 후
  - 백엔드: `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
  - 프론트: `docker exec synchub_frontend sh -lc 'cd /app && npm run build'`
  - 화면: 인증/검색/프로젝트 관리 주요 플로우 수동 확인

## 11. 다음 작업 후보(재개용)
사용자가 `다음 작업 진행해줘`라고 입력하면 아래 순서로 이어서 진행 권장.
1. 레거시 `posts` API 정리 방향 확정 및 제거/분리
2. 프로젝트/문서 목록 pagination 표준화
3. 검색 품질 회귀 E2E 스모크 자동화
4. 디자인 토큰/컴포넌트 규칙 lint 가이드 자동 점검

## 12. 연관 문서
- `docs/repo-map.md`
- `docs/ai-frontend-guide.md`
- `docs/ai-design-guide.md`
- `docs/session-handover-2026-02-07.md`
