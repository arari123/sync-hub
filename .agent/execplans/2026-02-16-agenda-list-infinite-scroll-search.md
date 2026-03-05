# Execution Plan: Agenda List Infinite Scroll + Search-Only Simplification (2026-02-16)

## 1. Goal
- 메인/프로젝트 안건 리스트 공통으로 페이지네이션을 제거하고 인피니티 스크롤(10개 단위 추가 로드)로 전환한다.
- 리스트 상단 필터 버튼을 제거하고 검색창만 남긴다.
- 리스트 항목 정보는 최초/답변, 제목, 작성자, 등록일만 노출하도록 단순화한다.

## 2. Entry Points
- `frontend/src/components/agenda/AgendaSplitView.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/AgendaList.jsx`
- `app/api/agenda.py`

## 3. Files-to-Touch
- `frontend/src/components/agenda/AgendaSplitView.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/AgendaList.jsx`
- `app/api/agenda.py`
- `docs/prd/agenda-list-infinite-scroll-search-2026-02-16.md`
- `.agent/execplans/2026-02-16-agenda-list-infinite-scroll-search.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 스크롤 하단에서 10개씩 추가 로드 | 수동 확인(브라우저) |
| REQ-003 | 필터 버튼 제거, 검색창만 노출 | 수동 확인(브라우저) |
| REQ-004 | 리스트 본문 미노출 + 메타 정보만 노출 | 수동 확인(브라우저) |
| REQ-005 | 작성자/등록일 가독성 스타일 반영 | 수동 확인(브라우저) |
| - | 프론트 빌드 회귀 확인 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `AgendaSplitView`에서 필터 영역 제거 후 검색창만 유지.
2. 리스트 항목 UI를 메타데이터 중심으로 단순화(본문 요약 제거).
3. IntersectionObserver 기반 인피니티 스크롤을 안정화(초기 로딩/중복 트리거 방지).
4. 엔트리 목록 API에 `q` 파라미터를 추가하고 메인/프로젝트 공통 검색 필터 적용.
5. `SearchResults`, `AgendaList`에서 공용 컴포넌트 props 정리.
6. Docker 기반 빌드/검증 실행 후 커밋 및 푸시.

## 6. Rollback Plan
- `AgendaSplitView`를 기존 페이지네이션 상태로 복구하고 필터 버튼 UI를 되돌린다.
- `app/api/agenda.py`에서 `entries` API의 `q` 필터를 제거한다.
- 관련 페이지의 props 변경을 원복한다.

## 7. Evidence
- `docker exec synchub_frontend npm run build` 결과
- `docker exec synchub_web bash scripts/verify_fast.sh` 결과
- UI 수동 확인(메인/프로젝트 리스트)
