# 메인 검색 페이지 필터/패널 UX 정리 실행 계획

## 1. Goal
- 메인 검색 페이지에서 사이드바 메뉴 제거, 프로젝트/필터 패널 조건부 노출, 필터 UI 재구성(토글 이동/단계 다중선택)을 적용한다.

## 2. Entry Points
- `frontend/src/pages/SearchResults.jsx`
- `docs/prd/main-search-filter-ux-refinement.md`

## 3. Files-to-Touch
- `docs/prd/main-search-filter-ux-refinement.md` (신규)
- `.agent/execplans/2026-02-11-main-search-filter-ux-refinement.md` (신규)
- `frontend/src/pages/SearchResults.jsx` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| MSFR-REQ-001 | 메인 사이드바 메뉴 제거 | `rg -n "프로젝트 리스트|자료 검색|설정" frontend/src/pages/SearchResults.jsx` 결과 없음 |
| MSFR-REQ-002 | 프로젝트 미매칭/미보유 시 프로젝트 패널 숨김 조건 존재 | `rg -n "hasProjectPanel" frontend/src/pages/SearchResults.jsx` |
| MSFR-REQ-003 | 필터 패널 기본 펼침/명칭/입력 제거/토글 이동/다중선택 | `rg -n "details open|프로젝트 필터|내 프로젝트|전체 프로젝트|전체 단계|toggleStageFilter" frontend/src/pages/SearchResults.jsx` |
| MSFR-REQ-004 | 검색 시에만 문서 패널 노출 | `rg -n "hasSearchQuery &&" frontend/src/pages/SearchResults.jsx` |
| MSFR-REQ-001~004 | 회귀 검증 | `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

## 5. Implementation Steps
1. 메인 페이지 사이드바 메뉴 UI를 제거한다.
2. 프로젝트/필터 패널 조건부 렌더링을 추가한다.
3. 필터 패널을 기본 open + 단계 다중선택 버튼 방식으로 전환한다.
4. 문서 패널 조건(`hasSearchQuery`)은 유지한다.
5. Docker 환경에서 빌드/검증을 수행한다.

## 6. Rollback Plan
- `git revert <commit>`으로 본 변경을 롤백한다.

## 7. Evidence
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
