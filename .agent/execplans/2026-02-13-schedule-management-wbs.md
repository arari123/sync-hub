# Execution Plan: Schedule Management WBS

## 1. Goal
프로젝트별 일정 관리 페이지를 WBS 편집/간트 시각화/프로젝트 간 일정 불러오기까지 포함한 실사용 기능으로 전환한다.

## 2. Entry Points
- `app/models.py`
- `app/database.py`
- `app/api/budget.py`
- `tests/test_budget_schedule.py`
- `frontend/src/App.jsx`
- `frontend/src/lib/scheduleUtils.js`
- `frontend/src/pages/BudgetProjectSchedule.jsx`

## 3. Files-to-Touch
- `app/models.py`
- `app/database.py`
- `app/api/budget.py`
- `tests/test_budget_schedule.py`
- `frontend/src/App.jsx`
- `frontend/src/lib/scheduleUtils.js` (신규)
- `frontend/src/pages/BudgetProjectSchedule.jsx` (신규)
- `docs/prd/schedule-management-wbs.md` (신규)
- `docs/project-input-spec.md`
- `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SCH-REQ-001 | schedule 기본 템플릿/정규화/저장 API 확인 | `python3 -m unittest tests/test_budget_schedule.py -v` |
| SCH-REQ-002~003 | 그룹/행 편집, 전역 연쇄, 날짜/작업일 계산 확인 | 일정 관리 화면 수동 시나리오 |
| SCH-REQ-004 | 간트 일/주/월 자동 전환 + 주말 음영 확인 | 일정 관리 화면 수동 시나리오 |
| SCH-REQ-005 | 다른 프로젝트 일정 불러오기 후 저장 확인 | 일정 관리 화면 수동 시나리오 |
| 품질 게이트 | 프론트 빌드 + 빠른 검증 통과 | `docker exec synchub_frontend sh -lc "cd /app && npm run build"`, `docker exec synchub_web bash -lc "cd /app && bash scripts/verify_fast.sh"` |

## 5. Implementation Steps
1. 프로젝트 모델/런타임 스키마에 `schedule_wbs_json` 컬럼을 추가한다.
2. `GET/PUT /budget/projects/{project_id}/schedule` API와 일정 정규화 로직을 구현한다.
3. 일정 정규화 단위 테스트를 추가한다.
4. 프론트 라우트를 일정 전용 페이지로 교체한다.
5. WBS 편집/전역 연쇄/간트/불러오기 모달을 구현한다.
6. 문서(PRD/입력스펙/REPO-MAP)를 갱신한다.
7. Docker 빌드/검증을 실행한다.

## 6. Rollback Plan
1. 라우트를 `ProjectPlaceholderPage`로 되돌린다.
2. `schedule_wbs_json` 미사용 상태로 API 엔드포인트를 비활성화한다.
3. 관련 프론트 페이지/유틸을 제거하고 기존 임시 화면으로 복귀한다.

## 7. Evidence
- `npm run build` 성공 로그
- `verify_fast.sh` 성공 로그
- 신규 API/페이지 동작 확인 스크린 기반 점검 결과
