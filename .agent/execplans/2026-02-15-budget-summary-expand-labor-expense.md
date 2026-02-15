# Execution Plan: 예산 통합 요약 탭 인건비/경비 단계별 상세 펼침 (2026-02-15)

## 1. Goal
- 예산 메인 `통합 요약` 탭의 “통합 원가 상세”에서 인건비/경비도 재료비처럼 `제작/설치` 단계 클릭 시 상세 항목을 펼칠 수 있게 한다.

## 2. Entry Points
- `frontend/src/pages/BudgetProjectBudget.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `docs/prd/budget-summary-expand-labor-expense-2026-02-15.md`
- `.agent/execplans/2026-02-15-budget-summary-expand-labor-expense.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001~003 | 통합 요약 탭 인건비/경비 단계 클릭 시 상세 행 펼침/접힘 확인 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-001~003 | 회귀/문법/디자인 토큰/유닛 테스트 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 통합 요약용 데이터 모델 생성 로직에서 인건비/경비도 단계별 상세 항목 리스트를 구성한다.
2. “통합 원가 상세” 테이블에서 인건비/경비 단계 행을 클릭 가능하게 하고, 펼침 시 상세 행을 렌더링한다.
3. Docker에서 `verify_fast` + 프론트 `build`를 실행한다.
4. 변경을 커밋하고 `git push` 한다.

## 6. Rollback Plan
- `frontend/src/pages/BudgetProjectBudget.jsx`에서 인건비/경비 단계 상세 렌더링/토글 로직을 제거하고 기존(합계만) UI로 되돌린다.

## 7. Evidence
- `verify_fast` 통과 로그
- `npm run build` 성공 로그

