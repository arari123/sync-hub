# Execution Plan: 글로벌 검색에 안건 포함 (2026-02-15)

## 1. Goal
글로벌 검색(`/home?q=...`) 상단 패널에서 프로젝트뿐 아니라 안건도 함께 검색/표시되도록 하고, 제목을 `검색 결과`로 변경한다. 결과 정렬은 `score` 우선, 동점 시 `프로젝트 > 안건`을 보장한다.

## 2. Entry Points
- 프론트: `frontend/src/pages/SearchResults.jsx` (글로벌 검색 페이지)
- 프론트(신규): `frontend/src/components/GlobalSearchResultList.jsx` (프로젝트/안건 혼합 리스트)
- 백엔드: `app/api/agenda.py` (`GET /agenda/threads/search`)

## 3. Files-to-Touch
- `app/api/agenda.py`
- `tests/test_agenda_search.py`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/components/GlobalSearchResultList.jsx` (신규)
- `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BE-REQ-001 | 안건 검색 API가 `score` 포함 결과를 반환 | `curl 'http://localhost:8001/agenda/threads/search?q=...&limit=5'` |
| FE-REQ-001 | 상단 패널 제목이 `검색 결과`로 표시 | 브라우저 `/home?q=...` 확인 |
| FE-REQ-002~004 | 프로젝트/안건 혼합 표출 + 아이콘 + 정렬 규칙 | 브라우저 `/home?q=...`에서 결과 순서 확인 |
| AC-003 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 백엔드에 `GET /agenda/threads/search` 추가 (점수/스니펫/매칭 근거 포함).
2. 프론트 `SearchResults`에서 안건 검색 API 호출 추가 후 프로젝트 결과와 병합 정렬.
3. 상단 패널 UI를 `검색 결과`로 변경하고 혼합 리스트 컴포넌트로 렌더링.
4. 단위 테스트 추가/보강 후 `verify:fast` 실행.
5. `docs/repo-map.md`에 신규 엔드포인트 반영 및 업데이트 기준 날짜 갱신.

## 6. Rollback Plan
- 프론트: 혼합 리스트/안건 호출을 제거하고 기존 `ProjectResultList` 렌더링으로 복구한다.
- 백엔드: `/agenda/threads/search` 라우트 및 관련 헬퍼 함수를 제거한다.

## 7. Evidence
- API 응답 예시(안건 포함): `GET /agenda/threads/search`
- 화면: `/home?q=...`에서 `검색 결과` 패널에 프로젝트/안건 아이콘 구분 및 정렬 확인
- 검증: `verify:fast` 통과 로그

