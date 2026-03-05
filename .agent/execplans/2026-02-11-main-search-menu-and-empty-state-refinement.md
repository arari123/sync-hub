# 메인 검색 상단 메뉴/무결과 상태/필터 UI 정리 실행 계획

## 1. Goal
- 상단 빠른 메뉴를 추가하고, 무결과 패널 노출 조건과 필터 버튼 레이아웃을 정리한다.

## 2. Entry Points
- `frontend/src/pages/SearchResults.jsx`

## 3. Files-to-Touch
- `docs/prd/main-search-menu-and-empty-state-refinement.md` (신규)
- `.agent/execplans/2026-02-11-main-search-menu-and-empty-state-refinement.md` (신규)
- `frontend/src/pages/SearchResults.jsx` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| MSME-REQ-001 | 상단 메뉴 아이콘 + 팝오버 메뉴 항목 반영 | `rg -n "Grid2x2|새 프로젝트 생성|데이터 허브\(미구현\)" frontend/src/pages/SearchResults.jsx` |
| MSME-REQ-002 | 프로젝트 무결과 패널 제거 | `rg -n "검색 조건과 일치하는 프로젝트가 없습니다" frontend/src/pages/SearchResults.jsx` 결과 없음 |
| MSME-REQ-003 | 완전 무결과에서만 공통 패널 노출 | `rg -n "검색 결과가 없습니다|totalVisibleCount === 0 && documentResults.length === 0" frontend/src/pages/SearchResults.jsx` |
| MSME-REQ-004 | 필터 버튼 1행 배치 + 생성 버튼 제거 | `rg -n "프로젝트 생성|flex flex-wrap items-center gap-2|내 프로젝트|전체 프로젝트|전체 단계" frontend/src/pages/SearchResults.jsx` |
| MSME-REQ-001~004 | 회귀 검증 | `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

## 5. Implementation Steps
1. 상단 우측에 메뉴 아이콘과 팝오버 런처를 추가한다.
2. 프로젝트 전용 무결과 패널을 제거한다.
3. 완전 무결과 조건부 패널을 추가한다.
4. 필터 버튼 레이아웃/스타일을 1행 기준으로 재정렬하고 생성 버튼을 제거한다.
5. Docker 기반 빌드/검증을 수행한다.

## 6. Rollback Plan
- `git revert <commit>`으로 본 변경을 롤백한다.

## 7. Evidence
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
