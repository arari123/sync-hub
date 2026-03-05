# Execution Plan: 프로젝트 메인 최신 안건 5개 + 전 페이지 배경 통일

## 1. Goal
- 프로젝트 메인 “마지막 안건”을 최신순으로 최대 5개 노출한다.
- 모든 페이지 배경을 이슈관리(안건관리) 페이지와 동일한 배경으로 통일한다.

## 2. Entry Points
- `frontend/src/pages/BudgetProjectOverview.jsx` (프로젝트 메인: “마지막 안건”)
- `app/api/agenda.py` (`GET /agenda/projects/{project_id}/threads`)
- `frontend/src/pages/SearchResults.jsx` (메인/글로벌 검색 페이지 배경)
- `frontend/src/pages/BudgetProjectBudget.jsx` (예산 메인 페이지 배경)

## 3. Files-to-Touch
- `app/api/agenda.py`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `docs/prd/project-main-latest-agenda-and-global-background-2026-02-15.md`
- `.agent/execplans/2026-02-15-project-main-latest-agenda-and-global-background.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 프로젝트 메인 “마지막 안건”이 최신순 최대 5개 노출 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |
| REQ-002 | 페이지 루트 배경 통일(이슈관리 페이지와 동일한 body 배경 노출) | `docker exec -w /app synchub_frontend npm run build` |

## 5. Implementation Steps
1. `GET /agenda/projects/{project_id}/threads` 기본 정렬을 최신 업데이트 기준 내림차순으로 변경한다.
2. 페이지 루트 컨테이너에서 `bg-background` 오버라이드를 제거하여 body 기본 배경이 노출되도록 한다.
3. Docker 환경에서 `verify_fast` 및 프론트 `build`를 실행하여 회귀를 확인한다.
4. 변경 사항을 원자적으로 커밋하고 `git push` 한다.

## 6. Rollback Plan
- `app/api/agenda.py`의 정렬을 기존 순서로 되돌린다.
- 각 페이지 루트의 `bg-background` 클래스를 복구한다.

## 7. Evidence
- `scripts/verify_fast.sh` 통과 로그
- `npm run build` 성공 로그

