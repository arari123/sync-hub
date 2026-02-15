# Execution Plan: 예산 메인 인건비 집행 수량 표시 및 경비 수량 제거 (2026-02-15)

## 1. Goal
- 예산 메인에서 인건비 항목별 `예산 수량 / 집행 수량`을 함께 표시한다.
- 경비 탭의 수량 열은 제거한다.

## 2. Entry Points
- 예산 메인 화면: `프로젝트 > 예산`
- 구현 파일: `frontend/src/pages/BudgetProjectBudget.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `docs/prd/budget-labor-execution-quantity-and-expense-remove-2026-02-15.md`
- `.agent/execplans/2026-02-15-budget-labor-execution-quantity-and-expense-remove.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 인건비 탭에 예산 수량 표시 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-002 | 인건비 탭에 집행 수량 표시(집행 앞) | `docker exec -w /app synchub_frontend npm run build` |
| REQ-003 | 집행 수량 계산식 적용 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-004 | 경비 탭 수량 열 제거 | `docker exec -w /app synchub_frontend npm run build` |

## 5. Implementation Steps
1. 인건비 집행 수량 계산: 행 단위로 `예산 수량 × 집행/예산` 계산 값을 `executionQuantity`로 추가한다.
2. 인건비 탭 테이블: `예산 수량`과 `집행 수량` 열을 추가하고, 소계/총괄까지 포함해 표시한다.
3. 경비 탭 테이블: 수량 열 관련 표시/집계를 제거하고 기존 컬럼 구성으로 복구한다.
4. Docker 기반 검증 스크립트를 실행한다.

## 6. Rollback Plan
- 해당 커밋을 revert 한다.

## 7. Evidence
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend npm run build`

