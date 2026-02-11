# 검색 페이지 홈 전환 및 문서 패널 제거 실행 계획

## 1. Goal
- `/`를 검색 대시보드 홈으로 전환하고, 검색 페이지 문서 결과 패널을 제거한다.

## 2. Entry Points
- `frontend/src/App.jsx`
- `frontend/src/components/Layout.jsx`
- `frontend/src/pages/SearchResults.jsx`

## 3. Files-to-Touch
- `docs/prd/search-home-and-remove-document-panel.md` (신규)
- `.agent/execplans/2026-02-11-search-home-and-remove-document-panel.md` (신규)
- `frontend/src/App.jsx` (수정)
- `frontend/src/components/Layout.jsx` (수정)
- `frontend/src/pages/SearchResults.jsx` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SHDP-REQ-001 | `/` 직접 렌더링 + `/search` 리다이렉트 | `rg -n "path=\"/\"|path=\"/search\"|LegacySearchRedirect" frontend/src/App.jsx` |
| SHDP-REQ-001 | 검색 전용 레이아웃이 `/`에 적용 | `rg -n "isSearchRoute" frontend/src/components/Layout.jsx` |
| SHDP-REQ-002 | 문서 패널 UI 제거 | `rg -n "문서 검색 결과|ResultList|DocumentDetail" frontend/src/pages/SearchResults.jsx` (미검출) |
| SHDP-REQ-001~002 | 회귀 검증 | `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

## 5. Implementation Steps
1. 라우팅을 홈 중심으로 전환한다.
2. 레이아웃 조건을 홈에도 적용되도록 확장한다.
3. 검색 페이지 문서 패널 UI를 제거한다.
4. Docker 기반 검증을 실행한다.

## 6. Rollback Plan
- `git revert <commit>`으로 본 변경을 롤백한다.

## 7. Evidence
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
