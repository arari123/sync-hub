# 2026-02-07 Budget Management Entry

## 1. Goal
- 프로젝트 예산관리 요구사항을 PRD 형태로 정리하고, 검색 페이지에서 예산관리 페이지로 진입할 수 있는 버튼/라우트를 추가한다.

## 2. Entry Points
- `docs/프로젝트 예산관리.md`
- `docs/prd/budget-management.md`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/App.jsx`

## 3. Files-to-Touch
- `docs/프로젝트 예산관리.md`
- `docs/prd/budget-management.md` (new)
- `frontend/src/pages/BudgetManagement.jsx` (new)
- `frontend/src/App.jsx`
- `frontend/src/pages/SearchResults.jsx`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BM-FE-001 | 검색 페이지에서 예산관리 페이지 이동 버튼 노출/라우팅 연결 | `npm run build` 성공 |
| BM-DOC-001 | 예산관리 요구사항 PRD 보완 | `docs/prd/budget-management.md` 생성 확인 |
| BM-QA-001 | 기존 백엔드 검증 회귀 없음 | `./scripts/verify_fast.sh` 통과 |

## 5. Implementation Steps
1. 기존 예산관리 문서의 누락 항목(스택/범위/요구사항/AC)을 보강한다.
2. 상세 PRD(`docs/prd/budget-management.md`)를 추가한다.
3. 프론트엔드에 `/budget-management` 페이지를 추가한다.
4. 검색 페이지 상단에 진입 버튼을 추가한다.
5. Docker 기반 빌드/검증을 실행한다.

## 6. Rollback Plan
- 프론트 라우팅/페이지 파일 삭제 후 `SearchResults` 버튼 제거.
- 문서 변경은 `git revert <commit>`으로 원복.

## 7. Evidence
- `docker exec synchub_frontend sh -lc 'cd /app && npm run build'`
- `docker exec synchub_web bash -lc 'cd /app && ./scripts/verify_fast.sh'`
