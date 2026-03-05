# Execution Plan: 데모 데이터 재구성 + 설계 단계 추가 (2026-02-15)

## 1. Goal
- 메인(`/home`) 단계 필터에 `설계`를 추가한다.
- 프로젝트 단계(`current_stage`)에 `design`을 도입한다.
- 기존 데이터를 초기화하고, 프로젝트/안건/예산/일정을 포함한 데모 데이터 약 30개를 자동 시드한다.

## 2. Entry Points
- 단계 정규화/라벨: `app/core/budget_logic.py`
- 프로젝트 API/정렬: `app/api/budget.py`
- 메인(`/home`) 필터 UI: `frontend/src/pages/SearchResults.jsx`
- 데모 시드: `scripts/reset_and_seed_demo_data.py` (신규)

## 3. Files-to-Touch
- `app/core/budget_logic.py`
- `app/api/budget.py`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/BudgetProjectInfoEdit.jsx` (단계 선택 옵션 갱신)
- `frontend/src/pages/BudgetManagement.jsx` (레거시 화면 단계 옵션 갱신)
- `frontend/src/pages/BudgetProjectOverview.jsx` (단계 라벨 fallback 갱신)
- `scripts/reset_and_seed_demo_data.py` (신규)
- `docs/prd/demo-seed-and-stage-design-2026-02-15.md`
- `.agent/execplans/2026-02-15-demo-seed-and-stage-design.md`

## 4. Implementation Steps
1. 백엔드 단계 로직에 `design` 추가.
2. 프론트 단계 옵션/필터 UI에 `설계` 추가.
3. 데모 데이터 리셋/시드 스크립트 작성(프로젝트 30개 + 프로젝트당 안건 20개 + 예산/일정 포함).
4. Docker에서 검증 실행:
   - `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
   - `docker exec -w /app synchub_frontend npm run build`
5. 커밋/푸시.
6. 시드 스크립트를 Docker에서 실행해 실제 데이터를 재구성한다.

## 5. Evidence
- 검증/빌드 커맨드 출력
- 시드 완료 후 DB 카운트 출력(프로젝트/안건 등)

