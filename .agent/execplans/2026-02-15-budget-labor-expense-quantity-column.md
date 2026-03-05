# Execution Plan: 예산 메인 인건비/경비 탭 수량 열 추가 (2026-02-15)

## 1. Goal
- 예산 메인의 `인건비`, `경비` 탭 테이블에 `수량` 열을 추가한다(예산 앞).

## 2. Entry Points
- `frontend/src/pages/BudgetProjectBudget.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `docs/prd/budget-labor-expense-quantity-column-2026-02-15.md`
- `.agent/execplans/2026-02-15-budget-labor-expense-quantity-column.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001~003 | 인건비/경비 탭에서 수량 열 노출 및 값 렌더링 확인 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-001~003 | 회귀/문법/유닛 테스트 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 인건비/경비 항목 집계 모델에 `quantity` 정보를 포함한다.
2. 인건비 탭 테이블에 `수량` 열을 `예산` 앞에 추가한다.
3. 경비 탭 테이블에 `수량` 열을 `예산` 앞에 추가한다.
4. Docker에서 `verify_fast` + 프론트 `build`를 실행한다.
5. 변경을 커밋하고 `git push` 한다.

## 6. Rollback Plan
- `frontend/src/pages/BudgetProjectBudget.jsx`에서 수량 집계/표시 로직을 제거해 이전 테이블로 되돌린다.

## 7. Evidence
- `verify_fast` 통과 로그
- `npm run build` 성공 로그

