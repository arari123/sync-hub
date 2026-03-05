# 2026-02-07 Budget Management Phase1

## 1. Goal
- `docs/prd/budget-management.md` 기준 Phase 1(프로젝트/버전/확정/리비전/요약 집계) 기능을 실제 API + UI로 구현한다.

## 2. Entry Points
- Backend: `app/api/budget.py`, `app/models.py`
- Frontend: `frontend/src/pages/BudgetManagement.jsx`
- Route: `frontend/src/App.jsx`

## 3. Files-to-Touch
- `app/models.py`
- `app/core/budget_logic.py`
- `app/api/budget.py`
- `app/main.py`
- `tests/test_budget_logic.py`
- `frontend/src/pages/BudgetManagement.jsx`
- `docs/프로젝트 예산관리.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BM-REQ-001 | 버전 생성/확정/리비전 API 동작 | `curl /budget/.../versions`, `/confirm`, `/revision` |
| BM-REQ-002 | 비용 입력/합계 집계 | `PUT /budget/versions/{id}/equipments` + summary 확인 |
| BM-REQ-003 | 페이지에서 프로젝트/버전/설비 편집 가능 | `npm run build` 성공 |
| BM-QA-001 | 회귀 없음 | `./scripts/verify_fast.sh` 통과 |

## 5. Implementation Steps
1. 예산 도메인 모델 추가
2. 버전/집계 로직 유틸 구현
3. 예산 API 라우터 구현 및 앱 연결
4. 예산관리 페이지를 데이터 연동형으로 전환
5. Docker 기반 검증 및 문서 갱신

## 6. Rollback Plan
- `budget` 라우터/모델/페이지를 revert 하여 기존 정적 페이지 상태로 복구한다.

## 7. Evidence
- `docker exec synchub_web bash -lc 'cd /app && ./scripts/verify_fast.sh'`
- `docker exec synchub_frontend sh -lc 'cd /app && npm run build'`
