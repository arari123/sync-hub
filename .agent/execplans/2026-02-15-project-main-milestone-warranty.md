# Execution Plan: 워런티 용어 통일 + 프로젝트 메인 일정 마일스톤 연동 (2026-02-15)

## 1. Goal
UI 전반의 `AS/유지보수` 표기를 `워런티`로 통일하고, 프로젝트 메인 페이지의 일정 마일스톤을 `설계-제작-설치-워런티` 4단계로 일정관리(WBS) 데이터와 연동한다. 프로젝트가 `검토/종료` 단계이면 마일스톤 위에 큰 오버레이로 표시한다.

## 2. Entry Points
- 프로젝트 메인: `frontend/src/pages/BudgetProjectOverview.jsx`
- 메인(/home) 프로젝트 리스트/필터: `frontend/src/pages/SearchResults.jsx`
- 프로젝트 생성/수정/목록: `frontend/src/pages/BudgetProjectCreate.jsx`, `frontend/src/pages/BudgetProjectInfoEdit.jsx`, `frontend/src/pages/BudgetManagement.jsx`
- 프로젝트 타입 라벨 직렬화: `app/api/budget.py`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/BudgetProjectCreate.jsx`
- `frontend/src/pages/BudgetProjectInfoEdit.jsx`
- `frontend/src/pages/BudgetManagement.jsx`
- `app/api/budget.py`
- `docs/prd/project-main-milestone-warranty-2026-02-15.md`
- `.agent/execplans/2026-02-15-project-main-milestone-warranty.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| FE-REQ-001~005, BE-REQ-001~002 | 브라우저에서 워런티 표기/프로젝트 메인 마일스톤 확인 | 수동 확인 |
| AC-006 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |
| AC-007 | 프론트 빌드 통과 | `docker exec -w /app synchub_frontend npm run build` |

## 5. Implementation Steps
1. `app/api/budget.py`에서 프로젝트 타입 `as` 라벨과 사용자 메시지의 `AS` 표기를 `워런티`로 통일한다(호환을 위해 입력 alias는 유지).
2. 프론트의 프로젝트 타입/라벨/필터에서 `AS/유지보수` 텍스트를 `워런티`로 교체한다.
3. `BudgetProjectOverview.jsx`의 일정 마일스톤을 WBS 일정(`GET /budget/projects/{id}/schedule`) 기반으로 계산해 4단계로 렌더링한다(기존 UI 디자인 유지).
4. 프로젝트가 `검토/종료` 단계일 때 마일스톤 영역 위에 반투명 글래스 오버레이를 추가한다.
5. Docker에서 `verify:fast` 및 `npm run build` 실행 후 커밋/푸시한다.

## 6. Rollback Plan
- 변경 커밋을 되돌리고(`git revert`), 프로젝트 메인 마일스톤은 기존 mock 데이터 기반 렌더링으로 복원한다.

## 7. Evidence
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend npm run build`

