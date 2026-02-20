# 2026-02-20 예산/이미지/일정/작업보고서/안건 상태 개선 실행계획

## 1. Goal
사용자 요청 6개 항목(예산 입력 상태 유지, 대표 이미지 표시/수정, IME 입력 오류, 마일스톤 라벨 개선, 작업보고서 위저드/리치텍스트, 안건 완료 전환)을 단일 릴리스로 반영하고 Docker 검증까지 완료한다.

## 2. Entry Points
- 예산 입력/탭: `frontend/src/pages/BudgetProjectBudget.jsx`, `frontend/src/pages/BudgetProjectEditor.jsx`
- 대표 이미지: `frontend/src/pages/BudgetProjectInfoEdit.jsx`, `frontend/src/lib/api.js`, `app/api/budget.py`
- 일정 마일스톤: `frontend/src/pages/BudgetProjectScheduleManagement.jsx`
- 작업보고서 작성/조회: `frontend/src/pages/AgendaCreate.jsx`, `frontend/src/pages/AgendaDetail.jsx`, `frontend/src/components/agenda/AgendaSplitView.jsx`, `app/api/agenda.py`
- 상태 전환 API: `PATCH /agenda/threads/{thread_id}/status`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/pages/BudgetProjectInfoEdit.jsx`
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx`
- `frontend/src/pages/AgendaCreate.jsx`
- `frontend/src/pages/AgendaDetail.jsx`
- `frontend/src/components/agenda/AgendaSplitView.jsx`
- `app/api/budget.py`
- `app/api/agenda.py`
- `tests/test_budget_cover_upload.py`
- `docs/project-input-spec.md`
- (필요 시) `docs/repo-map.md` 점검 후 변경 반영

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001, REQ-002 | 예산 입력 모드 탭 전환/한글 IME 수동 확인 | `verify:fast` + 수동 확인 메모 |
| REQ-003, REQ-004 | 커버 URL 정규화 + 설정 업로드 저장 검증 | `python -m pytest tests/test_budget_cover_upload.py` |
| REQ-005, REQ-006 | 마일스톤 라벨 폭/겹침 수동 확인 | `verify:fast` + 수동 확인 메모 |
| REQ-007, REQ-008, REQ-009 | 작업보고서 작성/조회 동작 수동 확인 | `verify:fast` + 수동 확인 메모 |
| REQ-010 | Split View 상태 전환 동작 수동 확인 | `verify:fast` + 수동 확인 메모 |

## 5. Implementation Steps
1. 예산 입력 상태 유지 구조를 단일 에디터 인스턴스로 정리하고 IME 입력 오류를 보정한다.
2. 커버 이미지 레거시 경로 정규화(백엔드+프론트)와 프로젝트 설정 재업로드 UI를 구현한다.
3. 마일스톤 라벨 폭 계산/레이아웃 로직을 개선해 근접 이벤트 겹침을 완화한다.
4. 작업보고서 작성 UI를 단계형 위저드 + 4개 리치텍스트 섹션으로 개편하고 본문 입력을 제거한다.
5. 작업보고서 조회(상세/Split View)에서 4개 섹션을 본문 위치에 시각화한다.
6. 안건 관리 Split View에 작성자 전용 상태 전환 액션을 추가한다.
7. 테스트/검증 실행 후 입력 스펙 문서를 업데이트한다.

## 6. Rollback Plan
- 프론트: 각 페이지/컴포넌트 변경 커밋 단위로 되돌린다.
- 백엔드: `app/api/budget.py`, `app/api/agenda.py`, 테스트 변경을 함께 되돌린다.
- 문서: 변경된 PRD/execplan/spec 문서를 동일 커밋에서 롤백한다.

## 7. Evidence
- Docker 컨테이너 내 `npm run verify:fast` 실행 로그
- 커버 정규화 테스트(`tests/test_budget_cover_upload.py`) 결과
- 예산 탭 전환/작업보고서 위저드/상태 전환 수동 점검 결과 요약
