# Execution Plan: 이슈(안건) 관리 필터/페이지네이션 UI 개편 (2026-02-15)

## 1. Goal
- 이슈(안건) 관리 페이지의 필터 패널/페이지네이션 UI를 메인 페이지 프로젝트 리스트와 동일한 톤으로 통일한다.

## 2. Entry Points
- 이슈(안건) 관리: `프로젝트 > 안건 관리`
- 파일: `frontend/src/pages/AgendaList.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/AgendaList.jsx`
- `docs/prd/agenda-list-filter-pagination-redesign-2026-02-15.md`
- `.agent/execplans/2026-02-15-agenda-list-filter-pagination-redesign.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 필터 패널 디자인 톤 통일 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-002 | 검색 조건 드롭다운 + 좁은 검색 입력창 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-003 | 입력창 옆 필터 칩 배치 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-004 | 표시 개수 UI 제거 | `docker exec -w /app synchub_frontend npm run build` |
| REQ-005 | 메인과 동일한 페이지네이션 UI | `docker exec -w /app synchub_frontend npm run build` |

## 5. Implementation Steps
1. `표시 개수(per-page)` 필터 UI를 제거하고, API 요청은 고정 `per_page`를 사용한다.
2. 필터 패널을 `app-surface-soft` + 칩 기반 레이아웃으로 재구성한다.
3. 페이지네이션을 10개 그룹(맨앞/이전/숫자/다음/맨뒤) UI로 교체한다.
4. Docker 기반 `verify_fast` 및 프론트 `build`를 실행한다.

## 6. Rollback Plan
- 해당 커밋을 revert 한다.

## 7. Evidence
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend npm run build`

