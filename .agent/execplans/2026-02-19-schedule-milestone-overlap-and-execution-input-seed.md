# 1. Goal
일정 마일스톤 라벨 겹침을 해소하고, 집행 입력 모드에서 인건비/경비를 즉시 입력 가능한 상태로 보강한다.

# 2. Entry Points
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx`
- `frontend/src/pages/BudgetProjectEditor.jsx`

# 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx`
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `docs/prd/schedule-milestone-overlap-and-execution-input-seed-2026-02-19.md`
- `.agent/execplans/2026-02-19-schedule-milestone-overlap-and-execution-input-seed.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 이벤트 라벨 충돌 회피 lane 배치 로직 확인 | `git diff frontend/src/pages/BudgetProjectScheduleManagement.jsx` |
| REQ-002 | lane 수에 따른 행 높이 확장 확인 | `git diff frontend/src/pages/BudgetProjectScheduleManagement.jsx` |
| REQ-003 | 집행 모드 인건비 부서 버튼으로 execution 행 추가 확인 | `git diff frontend/src/pages/BudgetProjectEditor.jsx` |
| REQ-004 | 집행 모드 경비 기본 항목 자동 시드 로직 확인 | `git diff frontend/src/pages/BudgetProjectEditor.jsx` |
| REQ-005 | 빠른 회귀 검증 통과 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

# 5. Implementation Steps
1. 일정 마일스톤 이벤트 라벨 배치 알고리즘을 충돌 회피 방식으로 교체한다.
2. lane 개수 기반으로 마일스톤 단계 행 높이를 동적으로 계산하도록 반영한다.
3. 집행 모드에서도 인건비 부서 버튼을 노출하고 execution 행에 항목을 추가하도록 수정한다.
4. 집행 모드 진입 시 경비 execution 행에 기본 항목을 자동 시드한다.
5. Docker 컨테이너에서 `verify:fast`를 실행해 회귀를 확인한다.

# 6. Rollback Plan
1. 본 작업 커밋을 `git revert`한다.
2. 문제가 지속되면 `BudgetProjectScheduleManagement`의 이벤트 라벨 렌더링을 이전 단순 lane 방식으로 복구한다.
3. `BudgetProjectEditor`의 execution 행 자동 시드 useEffect를 제거해 기존 동작으로 되돌린다.

# 7. Evidence
- 변경 코드 diff
- Docker `verify:fast` 실행 로그
