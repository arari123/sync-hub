# Execution Plan: Project Breadcrumb Label Unification (2026-02-16)

## 1. Goal
- 프로젝트 메인/예산 메인의 브레드크럼 첫 항목을 `프로젝트 관리`로 통일한다.

## 2. Entry Points
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `docs/prd/project-breadcrumb-label-unification-2026-02-16.md`
- `.agent/execplans/2026-02-16-project-breadcrumb-label-unification.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 프로젝트 메인 브레드크럼 첫 항목 확인 | 수동 확인 |
| REQ-002 | 예산 메인 브레드크럼 첫 항목 확인 | 수동 확인 |
| REQ-003 | `메인 / 글로벌 검색` 제거 확인 | 코드 확인 |
| - | 프론트 빌드 회귀 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `BudgetProjectOverview` 브레드크럼 링크를 `프로젝트 관리`로 변경.
2. `BudgetProjectBudget` 브레드크럼 링크를 `프로젝트 관리`로 변경.
3. Docker 기준 빌드/검증 후 커밋 및 푸시.

## 6. Rollback Plan
- 두 페이지의 브레드크럼 첫 항목을 기존 `메인 / 글로벌 검색` 형태로 되돌린다.

## 7. Evidence
- `git diff` 변경 내역
- `docker exec synchub_frontend npm run build`
- `docker exec synchub_web bash scripts/verify_fast.sh`
