# 프로젝트 상세 공통 상단 메뉴 개편 실행 계획

## 1. Goal
- 프로젝트 상세 하위의 모든 페이지에서 동일한 상단 메뉴를 유지해 페이지 이동 경로를 통합한다.

## 2. Entry Points
- `frontend/src/components/Layout.jsx`
- `frontend/src/App.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/BudgetProjectEditor.jsx`

## 3. Files-to-Touch
- `frontend/src/components/ProjectContextNav.jsx` (신규)
- `frontend/src/components/Layout.jsx` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 프로젝트 하위 경로에서 공통 상단 메뉴 노출 | `npm run build` 성공 |
| REQ-002 | 메뉴에서 상세/예산/입력/이슈/일정/사양/데이터/정보수정 이동 가능 | `npm run build` 성공 |
| REQ-003 | 기존 기능 회귀 없음 | `bash scripts/verify_fast.sh` 통과 |

## 5. Implementation Steps
1. 프로젝트 경로(`:projectId`) 감지 가능한 공통 메뉴 컴포넌트 추가
2. 1차 메뉴와 예산 하위(재료비/인건비/경비) 2차 메뉴 구현
3. `Layout`에 메뉴를 연결해 프로젝트 하위 모든 페이지에서 공통 노출
4. Docker 기반 빌드/빠른 검증 수행

## 6. Rollback Plan
- `git revert`로 `ProjectContextNav` 추가 및 `Layout` 변경 커밋을 되돌린다.

## 7. Evidence
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
