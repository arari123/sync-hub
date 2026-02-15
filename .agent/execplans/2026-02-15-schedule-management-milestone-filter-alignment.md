# Execution Plan: Schedule Management Milestone Alignment + Filter Panel Redesign

## 1. Goal
- Align the milestone panel timeline with the gantt timeline by reserving the same left label column width.
- Replace the schedule view filter UI with the same chip-based filter styling used on the home project list.

## 2. Entry Points
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx` (`/project-management/projects/:projectId/schedule`)

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectScheduleManagement.jsx`
- `docs/prd/schedule-management-milestone-filter-alignment-2026-02-15.md`
- `.agent/execplans/2026-02-15-schedule-management-milestone-filter-alignment.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SCH-UX-010 | 마일스톤 패널 좌측 460px 컬럼 확보 및 타임라인 정렬 확인 | 브라우저 수동 확인 |
| SCH-UX-010 | 마일스톤/간트 가로 스크롤 동기화 확인 | 브라우저 수동 확인 |
| SCH-UX-012 | 단계(설계/제작/설치) 요약 바 3줄 표시 및 단계 색상 일치 확인 | 브라우저 수동 확인 |
| SCH-UX-012 | 이벤트가 마일스톤 단계 바 위에 오버레이되고 간트에는 이벤트 행이 없음을 확인 | 브라우저 수동 확인 |
| SCH-UX-012 | 마일스톤 좌측 단계명/시작/종료 표기 및 헤더 높이 축소 확인 | 브라우저 수동 확인 |
| SCH-UX-011 | 필터 UI 칩/토글/입력 스타일 변경 및 기존 필터 동작 확인 | 브라우저 수동 확인 |
| SCH-UX-010/011/012 | 프론트 빌드 및 기본 검증 통과 | `docker exec -w /app synchub_frontend npm run build` |
| SCH-UX-010/011/012 | 빠른 검증 스크립트 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. Update `BudgetProjectScheduleManagement.jsx`:
   - Replace select-based filters with chip buttons styled like `SearchResults.jsx`.
   - Add a mobile filter toggle.
2. Rebuild milestone panel layout:
   - Render milestone area as `grid` with the same `460px` left column as the gantt table.
   - Match min-width and enable horizontal scrolling.
   - Sync horizontal scroll between milestone panel and gantt container.
3. Extend milestone panel content:
   - Add 3-line stage summary bars (design/fabrication/installation) using the same colors as gantt.
   - Overlay event markers on the corresponding stage summary bar.
   - Hide event rows from gantt table body (events are shown in milestone only).
4. Verify in Docker:
   - Run `scripts/verify_fast.sh` in `synchub_web`.
   - Run `npm run build` in `synchub_frontend`.
5. Commit and push.

## 6. Rollback Plan
- Revert the commit(s) affecting `frontend/src/pages/BudgetProjectScheduleManagement.jsx`.

## 7. Evidence
- Command outputs for `verify_fast` and `npm run build`.
- Manual UI check notes (milestone alignment + filter behavior).
