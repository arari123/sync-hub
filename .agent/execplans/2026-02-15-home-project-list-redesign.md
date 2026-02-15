# Execution Plan: 메인 프로젝트 리스트 개편 (2026-02-15)

## 1. Goal
- 메인(`/home`) 프로젝트 리스트의 업데이트 표시를 책갈피 링크 형태로 전면 개편한다.
- 일정 프로그레스바 가독성(라벨 오버레이/날짜/간격)을 개선한다.
- 예산/일정 패널 클릭 시 해당 페이지로 이동하도록 한다.
- 프로젝트 유형 뱃지를 강화한다.

## 2. Entry Points
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `docs/prd/home-project-list-redesign-2026-02-15.md`
- `.agent/execplans/2026-02-15-home-project-list-redesign.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001~007 | 메인 프로젝트 카드 UI/링크/딥링크/상태 표기 동작 확인 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-001~007 | 회귀/문법/디자인 토큰/유닛 테스트 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `/home` 프로젝트 카드에서 기존 `NEW UPDATE` 뱃지 블록을 제거한다.
2. localStorage 기반 “업데이트 스냅샷” 저장소를 추가하고, 스냅샷 대비 변경 항목만 책갈피 링크로 렌더링한다.
3. 안건 책갈피는 최신 안건 상세로, 예산 책갈피는 탭 딥링크(`?tab=material|labor|expense`)로 이동하도록 구현한다.
4. 예산/일정 패널 전체를 클릭 가능한 링크로 변경한다.
5. 일정 프로그레스바 라벨 오버레이, 날짜 폰트/색상, 간격을 조정한다.
6. 프로젝트 유형 뱃지를 추가/강화한다.
7. 파츠/AS 프로젝트가 `시작(start)` 단계일 때 상태 텍스트를 `진행 중`으로 표기하도록 로직을 보정한다.
8. Docker에서 `verify_fast` + 프론트 `build`를 실행한다.
9. 변경을 커밋하고 `git push` 한다.

## 6. Rollback Plan
- `frontend/src/pages/SearchResults.jsx`에서 업데이트 UI를 이전 `NEW UPDATE` 뱃지 블록으로 되돌린다.
- `frontend/src/pages/BudgetProjectBudget.jsx`의 탭 파라미터 처리 로직을 제거한다.

## 7. Evidence
- `verify_fast` 통과 로그
- `npm run build` 성공 로그
