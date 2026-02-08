# 2026-02-08 Budget Management UX Phase2

## 1. Goal
- 예산 입력 UX를 실사용 기준으로 고도화한다.
- 재료비/인건비/경비의 자동 계산/요약을 강화하고, 입력 즉시 모니터링 가능한 구조를 제공한다.

## 2. Entry Points
- PRD: `docs/prd/budget-management-ux-phase2.md`
- Frontend: `frontend/src/pages/BudgetProjectEditor.jsx`, `frontend/src/components/BudgetSidebar.jsx`
- Backend: `app/api/budget.py`, `app/core/budget_logic.py`
- Tests: `tests/test_budget_logic.py`

## 3. Files-to-Touch
- `docs/prd/budget-management-ux-phase2.md` (new)
- `.agent/execplans/2026-02-08-budget-management-ux-phase2.md` (new)
- `app/core/budget_logic.py`
- `app/api/budget.py`
- `tests/test_budget_logic.py`
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/components/BudgetSidebar.jsx`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BM-UX2-REQ-002 | 재료비 입력 정렬/자동완성 동작 및 합계 유지 | `docker-compose exec -T frontend ... npm run build` |
| BM-UX2-REQ-003 | 인건비 인원/단위 환산 반영 | `python3 -m unittest tests/test_budget_logic.py -v` |
| BM-UX2-REQ-004 | 경비 자동 산정 후 수동 수정 가능 | 수동 시나리오 + `verify:fast` |
| BM-UX2-REQ-005 | 사이드바에 재료/인건/경비 제작/설치 요약 표시 | UI 확인 + `npm run build` |
| BM-QA-001 | 회귀 없음 | `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` |

## 5. Implementation Steps
1. `budget_detail_json` 확장 필드(`budget_settings`, row 메타) 허용 및 집계 로직 호환 처리
2. 인건비 환산 로직에 인원/국내외 기준 반영
3. 편집기에서 인건비 기본항목/인원 입력 UX 반영
4. 경비 자동 산정 로직 및 "자동 산정" 액션 추가(사용자 수정 가능 유지)
5. 재료비 헤더 정렬/자동완성 추가
6. 우측 사이드바를 섹션별 제작/설치 요약 구조로 개편
7. Docker 기반 `verify:fast` 및 프론트 빌드 검증

## 6. Rollback Plan
- `git revert <commit>`으로 UX Phase2 커밋 단위 롤백
- 상세 스키마 변경 시 `budget_settings` 미사용 상태로 복귀 가능(기존 키 호환 유지)

## 7. Evidence
- `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'`
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- 변경 파일 diff 및 테스트 로그

