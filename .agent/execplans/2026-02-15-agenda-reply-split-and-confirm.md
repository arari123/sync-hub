# Execution Plan: Agenda List Reply Split + Register Confirmation

## 1. Goal
- In the agenda(=issue) list, show a two-column card for threads that have replies: left(root) vs right(latest reply).
- Add confirmation dialogs before publishing an agenda and before registering a reply.

## 2. Entry Points
- `frontend/src/pages/AgendaList.jsx` (`/project-management/projects/:projectId/agenda`)
- `frontend/src/pages/AgendaCreate.jsx` (`/project-management/projects/:projectId/agenda/new`)
- `frontend/src/pages/AgendaDetail.jsx` (`/project-management/projects/:projectId/agenda/:agendaId`)
- `app/api/agenda.py` (`GET /agenda/projects/{project_id}/threads`)

## 3. Files-to-Touch
- `frontend/src/pages/AgendaList.jsx`
- `frontend/src/pages/AgendaCreate.jsx`
- `frontend/src/pages/AgendaDetail.jsx`
- `app/api/agenda.py`
- `docs/prd/agenda-list-reply-split-and-confirm-2026-02-15.md`
- `.agent/execplans/2026-02-15-agenda-reply-split-and-confirm.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| AGD-LIST-001 | reply_count>0 카드가 좌/우 2분할로 표시되는지 확인 | 브라우저 수동 확인 |
| AGD-REG-001 | 안건 등록 시 확인창 표시 및 취소 시 API 미호출 확인 | 브라우저 수동 확인 |
| AGD-REG-002 | 답변 등록 시 확인창 표시 및 취소 시 API 미호출 확인 | 브라우저 수동 확인 |
| AGD-* | 빠른 검증 스크립트 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |
| AGD-* | 프론트 빌드 통과 | `docker exec -w /app synchub_frontend npm run build` |

## 5. Implementation Steps
1. Backend: extend thread serializer to include `root_summary_plain` / `latest_summary_plain` for list rendering.
2. Frontend:
   - Update `AgendaList.jsx` card layout to render a split panel when replies exist.
   - Add `window.confirm(...)` guards before publishing an agenda (`AgendaCreate.jsx`) and before submitting a reply (`AgendaDetail.jsx`).
3. Verify in Docker (`verify_fast` + frontend `build`).
4. Commit and push.

## 6. Rollback Plan
- Revert the commit(s) touching agenda list UI / confirm dialogs / serializer fields.

## 7. Evidence
- `verify_fast` output
- `npm run build` output
- Manual UI checks for split card + confirm dialogs

