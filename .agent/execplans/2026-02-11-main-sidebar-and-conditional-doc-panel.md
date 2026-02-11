# 메인 사이드바 라벨 및 조건부 문서 패널 노출 실행 계획

## 1. Goal
- 홈 검색 대시보드의 사이드바 라벨을 `메인`으로 변경하고, 문서 검색 패널을 검색 시에만 표시한다.

## 2. Entry Points
- `frontend/src/pages/SearchResults.jsx`

## 3. Files-to-Touch
- `docs/prd/main-sidebar-and-conditional-doc-panel.md` (신규)
- `.agent/execplans/2026-02-11-main-sidebar-and-conditional-doc-panel.md` (신규)
- `frontend/src/pages/SearchResults.jsx` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| MSDP-REQ-001 | 사이드바 활성 라벨 `메인` 반영 | `rg -n "메인" frontend/src/pages/SearchResults.jsx` |
| MSDP-REQ-002 | 검색 시에만 문서 패널 노출 | `rg -n "hasSearchQuery &&|문서 검색 결과|/documents/search" frontend/src/pages/SearchResults.jsx` |
| MSDP-REQ-001~002 | 회귀 검증 | `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

## 5. Implementation Steps
1. 사이드바 활성 항목 라벨을 `메인`으로 변경한다.
2. 문서 검색 API 상태/렌더링을 복원하고 `hasSearchQuery` 조건으로 감싼다.
3. Docker 검증을 실행한다.

## 6. Rollback Plan
- `git revert <commit>`으로 롤백한다.

## 7. Evidence
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
