# 검색 페이지 레이아웃 실구현 교체 실행 계획

## 1. Goal
- `/search` 페이지를 시안 기반 UI로 교체하고, 기존 백엔드 검색/프로젝트 연동을 유지한다.

## 2. Entry Points
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/components/Layout.jsx`
- `docs/prd/search-page-layout-replacement.md`

## 3. Files-to-Touch
- `docs/prd/search-page-layout-replacement.md` (신규)
- `.agent/execplans/2026-02-11-search-page-layout-replacement.md` (신규)
- `frontend/src/pages/SearchResults.jsx` (수정)
- `frontend/src/components/Layout.jsx` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SPR-REQ-001 | 문서/프로젝트 검색 API 연동 유지 + 실제 프로젝트 표시 | `rg -n "/documents/search|/budget/projects/search|/budget/projects" frontend/src/pages/SearchResults.jsx` |
| SPR-REQ-002 | 요청된 문구/열/썸네일/버튼 반영 | `rg -n "마지막 안건|담당자|새 프로젝트 생성|프로젝트 요약 현황|글로벌 검색 정책|강력 필터링|공통 레이아웃" frontend/src/pages/SearchResults.jsx` |
| SPR-REQ-003 | 검색 페이지 상단 구성 적용 | `rg -n "sync-hub|Bell|User" frontend/src/pages/SearchResults.jsx` |
| SPR-REQ-001~003 | 회귀 검증 | `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

## 5. Implementation Steps
1. 요구사항 문서를 추가한다.
2. SearchResults를 시안 기반 구조(상단/사이드/테이블/문서결과)로 개편한다.
3. 검색 페이지에서는 Layout 기본 헤더 대신 검색 전용 상단 구성을 사용하도록 조정한다.
4. Docker 환경에서 빠른 검증을 수행한다.

## 6. Rollback Plan
- `git revert <commit>`으로 본 변경을 롤백한다.

## 7. Evidence
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
- `rg -n "마지막 안건|담당자|cover_image_display_url|/documents/search|/budget/projects/search" frontend/src/pages/SearchResults.jsx`
