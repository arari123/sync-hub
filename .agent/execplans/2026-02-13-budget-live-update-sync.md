# Execution Plan: Budget Live Update Sync

## 1. Goal
예산 입력 모드와 조회/집계 화면 간 데이터 반영 지연을 제거해 새로고침 없이 최신 집계를 표시한다.

## 2. Entry Points
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/lib/budgetSync.js`

## 3. Files-to-Touch
- `frontend/src/lib/budgetSync.js` (신규)
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `docs/prd/budget-live-update-sync.md`
- `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| LIVE-001 | 입력 모드 상세 변경 즉시 집계 반영 | `BudgetProjectEditor onLiveDetailsChange` -> `BudgetProjectBudget setDetails` |
| LIVE-002 | 저장 후 조회 페이지 자동 갱신 | `emitBudgetDataUpdated` + `subscribeBudgetDataUpdated` 연결 |
| LIVE-003 | 기본 품질 검증 | `docker exec synchub_frontend ... npm run build`, `docker exec synchub_web ... verify_fast.sh` 통과 |

## 5. Implementation Steps
1. 예산 갱신 브로드캐스트 유틸(`budgetSync`)을 추가한다.
2. 입력 화면에서 상세 저장/버전 상태 변경 시 이벤트를 발행한다.
3. 예산 메인 페이지에서 입력 모드 실시간 상세 변경 콜백을 받아 집계에 즉시 반영한다.
4. 예산 메인/프로젝트 메인 페이지에서 동일 프로젝트 이벤트 수신 시 백그라운드 재조회한다.

## 6. Rollback Plan
1. `budgetSync` 사용 코드를 제거하고 기존 수동 새로고침 모델로 복귀한다.
2. 실시간 콜백에 의한 성능 이슈 발생 시 `onLiveDetailsChange` 연결만 비활성화한다.

## 7. Evidence
- 프론트 빌드 로그
- `verify:fast` 로그
- 변경 파일 diff
