# Execution Plan: 예산 메인 재료비 탭 유닛 표시 모드(예산/집행) 전환 (2026-02-15)

## 1. Goal
- 재료비 탭 조회 화면에서 프로젝트 단계에 따라 예산/집행 유닛 기본 표시를 전환한다.
- 예산/집행 전환 버튼으로 두 모드를 언제든 확인할 수 있게 한다.

## 2. Entry Points
- 예산 메인: `프로젝트 > 예산 > 재료비`
- 구현: `frontend/src/pages/BudgetProjectBudget.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `docs/prd/budget-material-unit-mode-toggle-2026-02-15.md`
- `.agent/execplans/2026-02-15-budget-material-unit-mode-toggle.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 검토 단계 기본 모드가 예산 유닛 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-002 | 검토 외 단계 기본 모드가 집행 유닛 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-003 | 예산/집행 전환 버튼 노출 및 전환 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-004 | 예산 유닛 모드에서 예산 유닛만 표시 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-005 | 집행 유닛 모드에서 집행 유닛만 표시 | `docker exec -w /app synchub_frontend npm run build` |

## 5. Implementation Steps
1. 재료비 탭 조회 화면에 `예산 유닛/집행 유닛` 토글을 추가한다.
2. 프로젝트 단계(`review` 여부)에 따라 기본 모드를 결정한다.
3. 집행 유닛 모드용 집행 데이터 그룹핑(유닛/파츠) 로직을 추가한다.
4. Docker 검증 스크립트를 실행한다.

## 6. Rollback Plan
- 해당 커밋을 revert 한다.

## 7. Evidence
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend npm run build`

