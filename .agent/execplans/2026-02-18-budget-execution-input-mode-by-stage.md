# 1. Goal
프로젝트 단계 정책에 맞춰 입력 모드를 집행금액 전용으로 강제하고 프론트/백엔드 동작을 일치시킨다.

# 2. Entry Points
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `app/api/budget.py`
- `tests/test_budget_stage_policy.py`

# 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `app/api/budget.py`
- `tests/test_budget_stage_policy.py`
- `docs/prd/budget-execution-input-mode-by-stage-2026-02-18.md`
- `.agent/execplans/2026-02-18-budget-execution-input-mode-by-stage.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 단계별 입력 모드 라벨 계산 로직 확인 | `git diff frontend/src/pages/BudgetProjectEditor.jsx` |
| REQ-002 | 재료비/인건비/경비 편집 가능 조건이 execution stage 기준으로 계산 | `git diff frontend/src/pages/BudgetProjectEditor.jsx` |
| REQ-003 | 서버 실행 전용 단계 집합에 설계 단계 포함 + 단위 테스트 | `python3 -m unittest tests.test_budget_stage_policy -v` |
| REQ-004 | 빠른 회귀 검증 통과 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

# 5. Implementation Steps
1. 프론트 입력 화면 실행 단계 집합에 설계 단계를 반영한다.
2. 재료비 조회 탭의 기본 보기 모드를 동일 단계 집합 기반으로 맞춘다.
3. 백엔드 실행 전용 단계 집합과 메시지를 업데이트한다.
4. 단계 정책 단위 테스트를 추가한다.
5. Docker `verify:fast`로 회귀를 확인한다.

# 6. Rollback Plan
1. 본 커밋을 `git revert`한다.
2. 실행 전용 단계 정책 변경으로 운영 이슈가 발생하면 `_EXECUTION_ONLY_STAGES`를 기존값으로 복구한다.

# 7. Evidence
- 코드 diff
- `docker exec ... bash scripts/verify_fast.sh` 통과 로그
