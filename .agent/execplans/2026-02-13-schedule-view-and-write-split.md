# 2026-02-13 일정관리 조회 페이지 신설 및 일정작성 분리

## 1. Goal
- 일정 메뉴를 조회/작성으로 분리하고, 색상 구분 기반의 상세 일정관리 화면을 신규 구현한다.

## 2. Entry Points
- `frontend/src/App.jsx`
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/pages/BudgetProjectSchedule.jsx`
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx`

## 3. Files-to-Touch
- `frontend/src/App.jsx`
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/BudgetProjectSchedule.jsx`
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx` (new)
- `docs/repo-map.md`
- `docs/prd/schedule-view-and-write-split-2026-02-13.md` (new)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SCH-UX-001 | 일정관리/일정작성 라우트 분리 및 메뉴 노출 확인 | `docker exec synchub_frontend sh -lc "cd /app && npm run build"` 통과 + 라우트 코드 확인 |
| SCH-UX-002 | 일정관리 상세 조회 UI 렌더링 정합성 확인 | 동일 빌드 검증 및 컴포넌트 정적 검토 |
| SCH-UX-003 | 일정작성 라벨/브레드크럼 변경 확인 | `frontend/src/pages/BudgetProjectSchedule.jsx` 확인 |
| SCH-UX-004 | 일정작성 이벤트 행 배경색 구분 확인 | 브라우저 수동 확인 + `docker exec -w /app synchub_frontend npm run build` 통과 |

## 5. Implementation Steps
1. 새 조회 전용 일정관리 페이지를 추가한다.
2. 기존 일정 편집 페이지를 일정작성으로 라벨 변경하고 조회 페이지 이동 동선을 추가한다.
3. 라우트/상단 메뉴를 일정관리/일정작성으로 분리한다.
4. repo-map과 PRD를 동기화한다.
5. Docker 컨테이너에서 빌드/검증을 수행한다.

## 6. Rollback Plan
1. `BudgetProjectScheduleManagement.jsx` 파일을 제거한다.
2. `App.jsx` 라우트를 기존 `/schedule -> BudgetProjectSchedule` 형태로 되돌린다.
3. 메뉴(`ProjectContextNav`, `BudgetProjectOverview`, `BudgetProjectBudget`)의 `일정 작성` 항목을 제거하고 기존 단일 `일정 관리`로 복구한다.

## 7. Evidence
- Docker 기반 프론트 빌드 성공 로그
- 변경 파일 diff 및 경로 정합성
