# Execution Plan: Agenda Outlook-Style Split View (Home + Project Issue Management) (2026-02-16)

## 1. Goal
- 메인 `/home`의 `전체안건` 탭과 프로젝트 `/project-management/projects/:projectId/agenda`의 이슈관리 목록을 아웃룩형 Split View로 개편한다.
- 왼쪽 리스트는 엔트리(루트/답변) 단위로 표시하고, 오른쪽에 선택 엔트리 상세를 표시한다.
- 엔트리 조회(읽음) 상태를 localStorage로 관리하고, 리스트에서 강조한다.
- 리스트는 접기/펼치기를 지원한다.

## 2. Entry Points
- Home tab: `frontend/src/pages/SearchResults.jsx`
- Project issue management: `frontend/src/pages/AgendaList.jsx`
- Backend agenda APIs: `app/api/agenda.py`

## 3. Files-to-Touch
- `app/api/agenda.py` (new endpoints: entry-based lists)
- `frontend/src/components/agenda/AgendaSplitView.jsx` (new shared split view)
- `frontend/src/components/agenda/AgendaEntryListItem.jsx` (new list row)
- `frontend/src/components/agenda/AgendaDetailPane.jsx` (new right-pane detail renderer)
- `frontend/src/lib/agendaSeen.js` (extend or add entry-level seen helpers)
- `frontend/src/pages/SearchResults.jsx` (home agenda tab uses split view)
- `frontend/src/pages/AgendaList.jsx` (project agenda page uses split view)
- `docs/repo-map.md` (update map/entry points if needed)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 홈/프로젝트 안건 페이지가 좌/우 분할로 보임 | 수동 확인(브라우저) |
| REQ-002 | 리스트 접기/펼치기 동작 | 수동 확인 |
| REQ-004 | 답변 엔트리가 리스트에 개별 항목으로 노출 | 수동 확인 |
| REQ-005 | 답변 선택 시 우측에 답변 + 루트가 표시 | 수동 확인 |
| - | 정적/회귀 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |
| - | 프론트 빌드 | `docker exec synchub_frontend npm run build` |

## 5. Implementation Steps
1. 백엔드: 엔트리 기반 목록 API 2종 추가
   - 프로젝트: `GET /agenda/projects/{project_id}/entries`
   - 내 범위: `GET /agenda/entries/my`
2. 프론트: 엔트리 단위 조회(읽음) localStorage 유틸 추가/확장.
3. 프론트: 공용 Split View 컴포넌트 구현(좌 리스트/우 상세/접기).
4. 홈 `/home` `전체안건` 탭을 Split View로 교체.
5. 프로젝트 이슈관리(`/agenda`) 페이지를 Split View로 교체.
6. Docker 기반 `verify_fast` + 프론트 `build` 확인 후 커밋/푸시.
7. `docs/repo-map.md` 점검/갱신.

## 6. Rollback Plan
- 프론트: `AgendaSplitView` 사용 부분을 이전 카드 리스트로 되돌리고, 새 컴포넌트 파일 제거.
- 백엔드: 신규 엔드포인트 제거 후 기존 thread 기반 목록만 유지.
- localStorage 키는 남아도 무방(향후 제거 가능).

## 7. Evidence
- `verify_fast` 통과 로그
- 홈/프로젝트 Split View 스크린샷

