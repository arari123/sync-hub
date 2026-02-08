# 프로젝트 헤더/메뉴 일관화 실행 계획

## 1. Goal
- 프로젝트 상세 하위 페이지의 상단 구조를 통일하고, 우측 메뉴 UX를 개선한다.

## 2. Entry Points
- `frontend/src/components/Layout.jsx`
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/pages/BudgetProjectInfoEdit.jsx`
- `frontend/src/App.jsx`

## 3. Files-to-Touch
- `frontend/src/components/ProjectPageHeader.jsx` (신규)
- `frontend/src/pages/ProjectPlaceholderPage.jsx` (신규)
- `frontend/src/components/ProjectContextNav.jsx` (수정)
- `frontend/src/components/Layout.jsx` (수정)
- `frontend/src/pages/BudgetProjectOverview.jsx` (수정)
- `frontend/src/pages/BudgetProjectBudget.jsx` (수정)
- `frontend/src/pages/BudgetProjectEditor.jsx` (수정)
- `frontend/src/pages/BudgetProjectInfoEdit.jsx` (수정)
- `frontend/src/App.jsx` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 메뉴를 제목/브레드크럼 우측 배치 | `npm run build` 성공 |
| REQ-002 | 예산관리 hover 시 하위 입력메뉴 노출, 클릭 시 메인 이동 | `npm run build` 성공 |
| REQ-003 | 예산 입력 페이지 저장/확정 버튼 위치 조정 후 회귀 없음 | `bash scripts/verify_fast.sh` 통과 |
| REQ-004 | 프로젝트 하위 플레이스홀더 페이지 헤더 일관성 유지 | `npm run build` 성공 |

## 5. Implementation Steps
1. 공통 헤더(`ProjectPageHeader`)를 추가해 브레드크럼/제목/우측 메뉴를 일관화한다.
2. 프로젝트 컨텍스트 메뉴를 hover 드롭다운 기반으로 개편한다.
3. 상세/예산/입력/정보수정/플레이스홀더 페이지를 공통 헤더로 전환한다.
4. 입력 페이지의 저장/확정 액션 버튼을 헤더 우측으로 이동한다.
5. Docker 환경에서 빌드 및 빠른 검증을 수행한다.

## 6. Rollback Plan
- `git revert`로 본 변경 커밋을 되돌린다.

## 7. Evidence
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
