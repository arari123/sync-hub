# Execution Plan: AS 프로젝트 종속/일정 간소화 (2026-02-15)

## 1. Goal
AS 프로젝트를 설비 프로젝트에 종속시키고, AS 프로젝트의 일정 UI를 시작/종료 2단계로 간소화한다. 생성/수정 UI에서 소속 설비 선택을 필수로 하고, 기존 데이터도 종속 구조로 마이그레이션한다.

## 2. Entry Points
- 프로젝트 API/직렬화: `app/api/budget.py`
- DB 스키마 호환: `app/database.py`
- 모델: `app/models.py`
- 메인(/home) 카드: `frontend/src/pages/SearchResults.jsx`
- 프로젝트 메인: `frontend/src/pages/BudgetProjectOverview.jsx`
- 프로젝트 생성/수정: `frontend/src/pages/BudgetProjectCreate.jsx`, `frontend/src/pages/BudgetProjectInfoEdit.jsx`

## 3. Files-to-Touch
- `app/models.py`
- `app/database.py`
- `app/api/budget.py`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectCreate.jsx`
- `frontend/src/pages/BudgetProjectInfoEdit.jsx`
- `docs/prd/as-project-overhaul-2026-02-15.md`
- `.agent/execplans/2026-02-15-as-project-overhaul.md`
- `docs/project-input-spec.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BE-REQ/FE-REQ 전체 | 브라우저에서 AS 생성/표시/일정 확인 | 수동 확인 |
| AC-007 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |
| AC-008 | 프론트 빌드 통과 | `docker exec -w /app synchub_frontend npm run build` |

## 5. Implementation Steps
1. DB/모델: `budget_projects.parent_project_id` 추가 및 런타임 스키마 보강.
2. BE: AS 프로젝트 생성/수정 시 소속 설비 필수 검증 + 직렬화에 parent 정보 포함 + AS 프로젝트 schedule PUT 차단.
3. BE: 기존 AS 프로젝트를 종속 구조로 마이그레이션(필요 시 placeholder 설비 생성 포함).
4. FE: 프로젝트 생성/수정 화면에 소속 설비 선택 UI 추가(AS일 때 필수).
5. FE: `/home` 프로젝트 카드에서 AS 프로젝트는 소속 설비 표시 + 일정 영역을 시작/종료 2단계로 렌더링.
6. FE: 프로젝트 메인 일정 마일스톤을 AS일 때 시작/종료 2단계로 렌더링 + 정보 패널에 소속 설비 표시.
7. Docker에서 `verify:fast` 및 `npm run build` 실행 후 커밋/푸시.

## 6. Rollback Plan
- `parent_project_id` 관련 변경을 제거하고, AS 프로젝트를 일반 프로젝트처럼 취급하도록 복원한다.

## 7. Evidence
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend npm run build`
