# 재료비 입력 페이지 반응형 UI 보강 실행 계획

## 1. Goal
- 재료비 입력 페이지에서 브라우저 폭 축소 시 브레드크럼/상단 메뉴/프로젝트 제목/입력 트리 레이아웃이 무너지지 않도록 보강한다.

## 2. Entry Points
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/components/ProjectPageHeader.jsx`
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/components/BudgetBreadcrumb.jsx`
- `frontend/src/components/BudgetSidebar.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/components/ProjectPageHeader.jsx`
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/components/BudgetBreadcrumb.jsx`
- `frontend/src/components/BudgetSidebar.jsx`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 폭 축소 시 브레드크럼/상단 메뉴 줄바꿈 붕괴 방지 | `npm run build` 성공 |
| REQ-002 | 재료비 입력 페이지에서 사이드바/메인 레이아웃 반응형 전환 | `npm run build` 성공 |
| REQ-003 | 회귀 없음 | `bash scripts/verify_fast.sh` 통과 |

## 5. Implementation Steps
1. 브레드크럼과 상단 메뉴에 가로 스크롤 기반 nowrap 처리 적용
2. 프로젝트 헤더를 작은 폭에서도 무너지지 않도록 breakpoint/폭 제약 재구성
3. 예산 입력 페이지를 `xl` 이하에서 세로 레이아웃으로 전환하고 사이드바 높이 제한 적용
4. 빌드/빠른 검증 실행

## 6. Rollback Plan
- 해당 커밋을 `git revert`로 되돌린다.

## 7. Evidence
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
