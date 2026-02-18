# 1. Goal
일정 작성 화면에서 명칭 입력 중 스페이스가 사라지는 문제를 해결한다.

# 2. Entry Points
- `frontend/src/pages/BudgetProjectSchedule.jsx`
- `frontend/src/lib/scheduleUtils.js`

# 3. Files-to-Touch
- `frontend/src/lib/scheduleUtils.js`
- `docs/prd/schedule-name-space-input-fix-2026-02-18.md`
- `.agent/execplans/2026-02-18-schedule-name-space-input-fix.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 명칭 정규화 시 실시간 trim 미적용 | `git diff frontend/src/lib/scheduleUtils.js` |
| REQ-002 | 공백-only 그룹명 기본값 보정 유지 | `git diff frontend/src/lib/scheduleUtils.js` |
| REQ-003 | 빠른 회귀 검증 통과 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

# 5. Implementation Steps
1. 일정 정규화 유틸에서 그룹/행 명칭의 `trim()`을 제거한다.
2. 그룹명 fallback 로직은 공백-only 입력도 기본값으로 보정되게 유지한다.
3. Docker 컨테이너 내부에서 `verify:fast`를 실행해 회귀를 확인한다.

# 6. Rollback Plan
1. 변경 커밋을 `git revert`한다.
2. 일정 명칭 입력 관련 회귀가 있으면 `scheduleUtils`의 이전 정규화 로직으로 복구한다.

# 7. Evidence
- 코드 diff
- `docker exec ... bash scripts/verify_fast.sh` 통과 로그
