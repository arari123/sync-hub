# AI 프론트엔드 구현 가이드

## 1. 문서 목적
- 이 문서는 현재 Sync-Hub 프론트 구조를 AI가 빠르게 이해하고, 기능 추가/수정 시 기존 UX 흐름을 깨지 않도록 하는 실무 기준이다.
- 대상 경로: `frontend/src`

## 2. 정보 구조(IA)
- 1차 네비게이션(사이드바)
  - `지식 검색` -> `/`
  - `프로젝트 관리` -> `/project-management`
  - `지식 베이스` -> `/knowledge` (현재 플레이스홀더)
  - `설정` -> `/settings` (현재 플레이스홀더)
- 검색 결과 페이지는 `/search`에서 문서+프로젝트 통합 결과를 표시한다.
- 프로젝트 관리 흐름
  - 목록(`/project-management`) -> 상세(`/project-management/projects/:projectId`) -> 예산 관리(`/project-management/projects/:projectId/budget`) -> 항목 입력(`/project-management/projects/:projectId/edit/:section`)

## 3. 라우팅/인증 규칙
- 라우트 정의: `frontend/src/App.jsx`
- 보호 라우트: `ProtectedRoute`
  - 로그인 필요: `/`, `/search`, `/project-management` 하위 경로
  - 비로그인 허용: `/login`, `/signup`, `/verify-email`
- 레거시 경로 리다이렉트
  - `/budget-management/*` -> `/project-management/*`

## 4. 페이지별 구현 계약

### 4.1 Home (`pages/Home.jsx`)
- 목적: 검색 진입 + 빠른 액션 + 시스템 상태 모니터링
- 핵심 블록
  - Hero
  - `SearchInput`
  - QuickActionCard 3종
  - `HealthStatus`, `UploadWidget`

### 4.2 SearchResults (`pages/SearchResults.jsx`)
- 목적: 문서/프로젝트 통합 검색
- 검색 실행
  - `GET /documents/search?q=...&limit=10`
  - `GET /budget/projects/search?q=...&limit=8`
- 장애 fallback
  - 프로젝트 검색 API 실패 시 `GET /budget/projects` + 로컬 점수 계산
- 표시 규칙
  - 프로젝트 결과: `ProjectResultList`
  - 문서 결과: `ResultList`
  - 문서 상세 패널: `DocumentDetail`

### 4.3 Project Management (`pages/BudgetManagement.jsx`)
- 목적: 프로젝트 현황 모니터링 + 필터링
- 상단
  - 브레드크럼 + 페이지 타이틀
  - 프로젝트 생성 버튼
- 중단
  - 상태 요약 카드(전체/검토/제작/설치/워런티/종료)
- 필터
  - 프로젝트명, 고객사, 담당자, 정렬
  - 상태/종류는 내부 state로 다중 선택 가능
- 하단
  - 프로젝트 카드 그리드 (`ProjectCard`)

### 4.4 Project Create (`pages/BudgetProjectCreate.jsx`)
- 목적: 신규 프로젝트 생성
- 입력값
  - 이름, 코드, 프로젝트 종류, 담당자, 고객사, 설치장소, 개요
- 생성 후
  - `POST /budget/projects`
  - `POST /budget/projects/{id}/versions`(review)
  - 상세 페이지로 이동

### 4.5 Project Overview (`pages/BudgetProjectOverview.jsx`)
- 목적: 프로젝트 전체 요약 모니터링
- 표시 항목
  - 헤더 배지(단계/버전/마지막 업데이트)
  - 기본 정보(간소 필드 + 개요 + 대표 이미지)
  - 요약 일정 마일스톤(설계-제작-설치)
  - 전체 예산 요약(확정 예산/집행 금액/차액 포함)
  - 설비별 그래프(재료비/인건비/경비/집행)
- 액션
  - `예산 관리` 이동 버튼
  - `기본 정보 수정` 모달 저장 (`PUT /budget/projects/{project_id}`)
- 참고
  - 상세 일정 작성은 추후 구현 예정(별도 지시 시 구현)

### 4.6 Budget Management (`pages/BudgetProjectBudget.jsx`)
- 목적: 프로젝트 예산 현황 확인 + 입력 페이지 진입
- 표시 항목
  - 예산 요약(재료/인건/경비/총액)
  - 모니터링 값(확정 예산/집행 금액/차액)
  - 설비별 현황 그래프
- 입력 페이지 이동
  - 재료비/인건비/경비 섹션

### 4.7 Budget Editor (`pages/BudgetProjectEditor.jsx`)
- 목적: 재료/인건/경비 상세 행 입력
- 핵심 규칙
  - 확정 버전 또는 권한 없음이면 읽기 전용
  - 저장(`PUT /budget/versions/{id}/details`)
  - 버전 확정/리비전 생성 가능

### 4.8 Auth (`pages/Login.jsx`, `pages/Signup.jsx`)
- 목적: 세션 기반 로그인/가입
- API
  - 로그인: `POST /auth/login`
  - 가입: `POST /auth/signup`
- 세션 저장
  - `lib/session.js` localStorage 사용

## 5. 컴포넌트 책임
- `Layout.jsx`
  - 인증 상태 기준으로 사이드바 레이아웃 적용/해제
- `Sidebar.jsx`
  - 1차 네비, collapse, 사용자 정보, 로그아웃
- `ResultList.jsx`
  - 문서 검색 카드 렌더링
  - 장애 조치보고서(`equipment_failure_report`)는 구조화 요약 표시
- `ProjectResultList.jsx`
  - 프로젝트 검색 카드 렌더링
- `ui/Button.jsx`, `ui/Input.jsx`
  - 공용 스타일 계약. 페이지별 하드코딩 버튼/입력 스타일 남발 금지

## 6. API/데이터 계약 핵심
- 문서 검색 결과 주요 필드
  - `doc_id`, `filename`, `title`, `summary`, `page`, `score`, `document_types`
- 프로젝트 검색 결과 주요 필드
  - `project_id`, `name`, `description`, `customer_name`, `manager_name`, `current_stage_label`, `score`
- 프로젝트 상세 주요 필드
  - `cover_image_display_url`, `summary_milestones[]`, `monitoring.confirmed_budget_total`, `monitoring.actual_spent_total`, `monitoring.variance_total`
- 프로젝트 목록 필터 파라미터(주요)
  - `project_name`, `project_code`, `customer_name`, `manager_name`, `project_types`, `stages`, `sort_by`

## 7. 스타일/레이아웃 실무 규칙
- 기본 레이아웃
  - 사이드바 + 메인 스크롤 영역
- 화면 밀도
  - 필터/카드 컴포넌트는 compact 우선 (`h-8~h-10`, `text-xs~text-sm`)
- 상태 표현
  - 로딩/오류/빈결과는 반드시 별도 블록으로 노출
- 메인 페이지 테마 색상 (기준: `docs/code.html`)
  - `primary`: `#1A73E8` (hover `#1557B0`)
  - `background-light`: `#F7F9FC`
  - `surface-light`: `#FFFFFF`
  - `border-light`: `#DFE5EF`
  - `surface-dark`: `#1A2234`
  - `background-dark`: `#0F172A`
- 메인 페이지 색상 토큰 매핑 (`frontend/src/index.css`)
  - `--primary`: `#1A73E8`
  - `--background`: `#F7F9FC`
  - `--card`: `#FFFFFF`
  - `--border`, `--input`: `#DFE5EF`
  - `--ring`: `#1A73E8`
- 메인 페이지 적용 규칙
  - 상단 로고 배경, 활성 버튼, 포커스 링은 `primary` 계열만 사용한다.
  - 화면 바탕은 `bg-background`, 카드/패널은 `bg-card`, 경계선은 `border-border`를 사용한다.
  - 페이지 단위 임의 HEX 색상 추가를 금지하고, 색상은 토큰으로만 확장한다.

## 8. 변경 시 주의사항
- `/project-management` 계열 URL을 직접 하드코딩 변경하지 말고, `App.jsx` 라우트와 함께 동기화한다.
- 검색 페이지는 문서 결과와 프로젝트 결과를 동시에 다루므로, 한쪽만 성공/실패하는 케이스를 항상 고려한다.
- 인증 페이지는 레이아웃에서 사이드바가 표시되지 않는 상태를 전제로 한다.
- 프로젝트 단계 값은 백엔드 enum(`review|fabrication|installation|warranty|closure`)과 반드시 일치해야 한다.

## 9. 최소 검증 시나리오
1. 로그인 -> 홈 진입
2. 검색어 입력 -> 문서/프로젝트 결과 동시 표시
3. 프로젝트 카드 클릭 -> 상세 이동
4. 상세 -> 예산 관리 -> 재료/인건/경비 입력 페이지 이동
5. 로그아웃 -> 보호 라우트 접근 시 로그인 리다이렉트

## 10. 연관 문서
- `docs/ai-system-context.md`
- `docs/ai-design-guide.md`
- `docs/repo-map.md`
