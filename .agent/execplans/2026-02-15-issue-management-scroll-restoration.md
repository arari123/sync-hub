# Execution Plan: 이슈 관리 페이지 스크롤 위치 복원 (2026-02-15)

## 1. Goal
이슈 관리(안건 목록) 페이지에서 상세로 이동했다가 뒤로가기로 돌아올 때, 이전 스크롤 위치를 복원한다.

## 2. Entry Points
- 이슈 관리(안건 목록): `frontend/src/pages/AgendaList.jsx`
- 이슈 상세: `frontend/src/pages/AgendaDetail.jsx` (참고용)

## 3. Files-to-Touch
- `frontend/src/pages/AgendaList.jsx`
- `docs/prd/issue-management-scroll-restoration-2026-02-15.md`
- `.agent/execplans/2026-02-15-issue-management-scroll-restoration.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| FE-REQ-001~003 | 리스트→상세→브라우저 뒤로가기 시 스크롤 복원 | 브라우저에서 동작 확인 |
| AC-002 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `AgendaList.jsx`에서 페이지 언마운트 시 `sessionStorage`에 `scrollY` 저장.
2. `AgendaList.jsx` 재진입 시 Navigation type이 `POP`이고 목록 로딩이 끝났다면 저장값으로 스크롤 복원.
3. Docker에서 `verify:fast` 실행.
4. 커밋/푸시.

## 6. Rollback Plan
- `AgendaList.jsx`의 스크롤 저장/복원 로직을 제거한다.

