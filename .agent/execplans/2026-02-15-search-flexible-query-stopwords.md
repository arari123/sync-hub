# Execution Plan: 검색어 라벨 토큰 처리 및 후보 선정 유연화 (2026-02-15)

## 1. Goal
`담당자 이용호`, `작성자 이용호`처럼 라벨+값 형태의 검색어가 0건으로 떨어지지 않도록, 백엔드 토크나이저와 후보(프리필터) 선정 로직을 보강한다.

## 2. Entry Points
- 백엔드(프로젝트 검색): `app/api/budget.py` (`GET /budget/projects/search`)
- 백엔드(안건 검색): `app/api/agenda.py` (`GET /agenda/threads/search`)
- 테스트: `tests/test_budget_search.py`, `tests/test_agenda_search.py`

## 3. Files-to-Touch
- `app/api/budget.py`
- `app/api/agenda.py`
- `tests/test_budget_search.py`
- `tests/test_agenda_search.py`
- `docs/prd/search-flexible-query-stopwords-2026-02-15.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BE-REQ-001 | `담당자` 토큰이 제거되어도 점수가 계산됨 | `test_manager_label_query_is_scored` |
| BE-REQ-003 | `작성자` 토큰이 제거되어도 점수가 계산됨 | `test_global_search_score_supports_author_label_query` |
| AC-003 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `app/api/budget.py` 토크나이저에 라벨성 stopword 필터 추가.
2. `GET /budget/projects/search` 프리필터를 `manager_user_id`, `equipment_name(현재 버전)`까지 확장.
3. `app/api/agenda.py` 토크나이저에 라벨성 stopword 필터 추가.
4. `GET /agenda/threads/search` 프리필터를 `created_by_user_id`, `AgendaEntry(title/content_plain)` 기반 후보까지 확장.
5. 단위 테스트 추가 후 `verify:fast` 실행.

## 6. Rollback Plan
- stopword 필터/프리필터 확장 코드를 제거하고 기존 토크나이저/후보 선정 로직으로 되돌린다.

## 7. Evidence
- `verify:fast` 통과 로그
- 로컬 재현: `search_projects(q='담당자 이용호')`, `search_agenda_threads(q='작성자 이용호')` 결과 1개 이상

