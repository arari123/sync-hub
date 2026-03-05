# Execution Plan: Project Overview Agenda Count to 3 (2026-02-16)

## 1. Goal
- 프로젝트 메인 페이지 안건 노출 개수를 5건에서 3건으로 조정한다.

## 2. Entry Points
- `frontend/src/pages/BudgetProjectOverview.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `docs/prd/project-overview-agenda-count-3-2026-02-16.md`
- `.agent/execplans/2026-02-16-project-overview-agenda-count-3.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 프로젝트 메인 안건 노출 최대 3건 확인 | 수동 확인 |
| REQ-002 | 최신 업데이트 순서 유지 확인 | 수동 확인 |
| - | 프론트 빌드 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 안건 목록 요청 `per_page`를 3으로 조정.
2. 렌더링용 slice 범위를 3으로 조정.
3. Docker 기준 빌드/검증 후 커밋/푸시.

## 6. Rollback Plan
- `per_page`와 `slice`를 5로 원복한다.

## 7. Evidence
- `git diff` 변경 내역
- Docker 빌드/검증 결과
