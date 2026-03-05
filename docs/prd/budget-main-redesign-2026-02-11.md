# 예산 메인 페이지 개편 PRD

## 배경
- 기존 `/project-management/projects/:projectId/budget` 페이지는 프로젝트 메인과 상단 UX가 일치하지 않고,
  `docs/ex_page/ex_budget_detail_page.html` 기준의 본문 레이아웃과도 차이가 크다.
- 용어를 `예산 관리`에서 `예산 메인`으로 통일해야 한다.

## 목표
1. 예산 페이지의 상단바/브레드크럼/상단 메뉴를 프로젝트 메인 페이지 스타일과 동일하게 유지한다.
2. 예산 페이지 본문은 `docs/ex_page/ex_budget_detail_page.html` 클론 스타일로 개편한다.
3. 기존 백엔드 연동 데이터(프로젝트/버전/예산 상세)를 새 레이아웃에 그대로 연결한다.
4. 사용자 노출 텍스트를 `예산 메인`으로 통일한다.

## 범위
- 대상 라우트: `/project-management/projects/:projectId/budget`
- 주요 파일:
  - `frontend/src/pages/BudgetProjectBudget.jsx`
  - `frontend/src/components/Layout.jsx`
  - `frontend/src/components/ProjectContextNav.jsx`
  - `frontend/src/pages/BudgetProjectOverview.jsx`
  - `frontend/src/pages/BudgetProjectEditor.jsx`

## 요구사항
1. 상단바
- 예산 페이지는 프로젝트 메인과 동일한 상단 구조를 사용한다.
- `ex_budget_detail_page.html`의 상단바/헤더는 사용하지 않는다.

2. 본문 레이아웃
- 좌측: 필터 패널(검색, 단계, 설비, 비용 유형, 자체/외주)
- 우측: 요약 카드, 단계별 요약 카드, 상세 브레이크다운 패널
- 반응형에서 레이아웃이 깨지지 않아야 한다.

3. 데이터 동작
- 기존 API 데이터 로딩/집계 결과를 새 UI에 반영한다.
- 필터 변경 시 본문 데이터가 반영되어야 한다.

4. 명칭 통일
- 사용자에게 보이는 `예산 관리` 텍스트를 `예산 메인`으로 변경한다.

## 완료 기준
- 예산 페이지 상단이 프로젝트 메인 상단과 동일한 UX로 표시된다.
- 본문이 `ex_budget_detail_page.html` 스타일로 동작한다.
- 필터가 실제 데이터 표시에 반영된다.
- `예산 메인` 명칭 통일이 반영된다.
- Docker 환경에서 검증 통과:
  - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
  - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
