# Execution Plan: Project Nav + Breadcrumb Main Page Unification (2026-02-16)

## 1. Goal
- `이슈 관리`를 `안건 관리`로 통일하고,
- 프로젝트 관련 브레드크럼 첫 항목을 `메인 페이지`로 통일하며,
- 홈/프로젝트 브레드크럼 바의 세로폭 인상을 맞춘다.

## 2. Entry Points
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/*` (ProjectPageHeader breadcrumbItems 전달부)

## 3. Files-to-Touch
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/AgendaCreate.jsx`
- `frontend/src/pages/AgendaDetail.jsx`
- `frontend/src/pages/AgendaList.jsx`
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/pages/BudgetProjectInfoEdit.jsx`
- `frontend/src/pages/BudgetProjectSchedule.jsx`
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx`
- `frontend/src/pages/ProjectPlaceholderPage.jsx`
- `docs/prd/project-nav-and-breadcrumb-main-page-unification-2026-02-16.md`
- `.agent/execplans/2026-02-16-project-nav-breadcrumb-main-page-unification.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 메뉴 `이슈 관리` 제거, `안건 관리` 표시 | `rg -n "이슈 관리" frontend/src` |
| REQ-002 | 브레드크럼 첫 항목 `메인 페이지` 확인 | 코드 확인 + 수동 확인 |
| REQ-003 | 홈 브레드크럼 바 높이 인상 정렬 | 수동 확인 |
| - | 프론트 빌드 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 프로젝트 컨텍스트 메뉴 라벨 변경(`이슈 관리` -> `안건 관리`).
2. 프로젝트 관련 브레드크럼 배열 첫 항목 라벨 변경(`프로젝트 관리` -> `메인 페이지`).
3. 프로젝트 메인/예산 메인 커스텀 브레드크럼 첫 항목 라벨 변경.
4. 홈 브레드크럼 바 레이아웃 높이/패딩을 프로젝트 페이지와 유사하게 조정.
5. Docker 기준 빌드/검증 후 커밋 및 푸시.

## 6. Rollback Plan
- 라벨 변경을 원복하고 SearchResults 브레드크럼 바 레이아웃을 이전 값으로 되돌린다.

## 7. Evidence
- `git diff` 변경 내역
- `docker exec synchub_frontend npm run build`
- `docker exec synchub_web bash scripts/verify_fast.sh`
