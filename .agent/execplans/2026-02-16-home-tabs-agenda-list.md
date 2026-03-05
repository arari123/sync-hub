# Execution Plan: Home Tabs (Projects/Agendas) + My Scope Agenda List (2026-02-16)

## 1. Goal
- `/home` 메인 페이지에 `내프로젝트/전체프로젝트/전체안건` 전환 탭을 추가한다.
- `전체안건` 탭에서 “내 담당 프로젝트 + 내 작성” 안건을 최신 업데이트 순으로 보여주고, 미조회(또는 업데이트 미확인) 안건을 강조한다.

## 2. Entry Points
- Frontend main: `frontend/src/pages/SearchResults.jsx`
- Agenda detail (mark as seen): `frontend/src/pages/AgendaDetail.jsx`
- Backend agenda API: `app/api/agenda.py`

## 3. Files-to-Touch
- `app/api/agenda.py` (new endpoint: my-scope agenda list)
- `frontend/src/pages/SearchResults.jsx` (tabs + agenda tab panel)
- `frontend/src/pages/AgendaDetail.jsx` (mark thread as seen)
- `frontend/src/components/agenda/AgendaThreadCard.jsx` (shared card with unread highlight + project label)
- `frontend/src/pages/AgendaList.jsx` (reuse shared card)
- `frontend/src/lib/agendaSeen.js` (localStorage helpers)
- `docs/repo-map.md` (update map/date + new entry points)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | `/home`에서 탭 3개 노출 | 수동 확인(브라우저) |
| REQ-004 | `전체안건` 탭에서 안건 카드 리스트 노출 | 수동 확인(브라우저) |
| REQ-005 | 내 담당 프로젝트 + 내 작성(+내 draft) 포함 | 수동 확인(샘플 데이터) |
| REQ-006 | 최신 업데이트 순 정렬 | 수동 확인(정렬/업데이트 시간) |
| REQ-008 | 미조회 안건 강조 + 상세 열람 후 해제 | 수동 확인(localStorage 기반) |
| - | 회귀/정적 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 백엔드: `GET /agenda/threads/my` API 추가(필터/페이지네이션, 프로젝트명/코드 포함, 최신 업데이트 정렬).
2. 프론트: localStorage 기반 “안건 조회 기준” 유틸(`agendaSeen`) 구현.
3. 프론트: 안건 카드 공용 컴포넌트로 추출 + 프로젝트 라벨/미조회 강조 지원.
4. 프론트: `/home` 탭 UI 추가 및 `전체안건` 탭 패널 구현(API 연동/페이지네이션).
5. 프론트: 안건 상세 진입 시 해당 안건을 “조회 완료”로 기록.
6. `verify_fast` (Docker) 실행 후 커밋/푸시.
7. `docs/repo-map.md` 갱신(업데이트 기준 날짜 포함).

## 6. Rollback Plan
- 프론트: 탭 UI/agenda panel 렌더링 분기를 제거하고 기존 `/home` 프로젝트 리스트만 유지.
- 백엔드: `/agenda/threads/my` 라우트 제거.
- localStorage key는 부작용이 없으므로 남아도 무방(필요 시 키 이름 변경 또는 삭제 로직 추가).

## 7. Evidence
- `docker exec synchub_web bash scripts/verify_fast.sh` 출력 캡처
- `/home` 탭 3개 및 `전체안건` 목록/강조 동작 스크린샷

