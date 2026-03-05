# 2026-02-08 Budget Management Dashboard Redesign

## 1. Goal
예산관리 페이지를 프로젝트 관점의 모니터링 대시보드로 전면 개편하고, 상단 로고 우측에 `프로젝트 관리 - 예산 관리` 맥락 표시를 추가한다. 재료비/인건비/경비를 설비 및 제작/설치 기준으로 시각화하며, 집행 단계에서는 예산-집행-잔액을 함께 노출한다.

## 2. Entry Points
- `frontend/src/components/Layout.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- 라우팅: `/project-management/projects/:projectId/budget`
- 입력 화면 라우팅: `/project-management/projects/:projectId/edit/:section`

## 3. Files-to-Touch
- `.agent/execplans/2026-02-08-budget-management-dashboard-redesign.md` (new)
- `frontend/src/components/Layout.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 예산관리/입력 경로에서 로고 우측에 `프로젝트 관리 - 예산 관리` 노출 및 프로젝트 관리 링크 이동 가능 | 수동 확인 (브라우저) |
| REQ-002 | 예산관리 페이지에서 재료비/인건비/경비를 설비/제작/설치 기준으로 모니터링 가능 | 수동 확인 (브라우저) |
| REQ-003 | 집행 단계에서 집행비/잔액이 항목별로 표시됨 | 수동 확인 (브라우저) |
| REQ-004 | 재료비는 설비>유닛 구조와 유닛 금액 정보가 표시됨 | 수동 확인 (브라우저) |
| REQ-005 | 코드 무결성 확인 | `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` |
| REQ-006 | 빠른 검증 통과 | `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

## 5. Implementation Steps
1. Layout 헤더에 경로 기반 컨텍스트 라벨 추가 (`프로젝트 관리 - 예산 관리`).
2. Budget 페이지 데이터 로딩을 `versions + equipments + details`로 확장한다.
3. 재료비/인건비/경비 집계 함수를 구현하여 설비/제작/설치/구분(자체/외주) 기준으로 정규화한다.
4. 총괄 카드, 설비별 합계, 항목별 상세(재료비 유닛, 인건비 항목, 경비 항목), 그래프 UI를 배치한다.
5. 빌드/검증 실행 후 커밋 및 푸시한다.

## 6. Rollback Plan
- 변경 파일을 커밋 단위로 되돌린다.
- 필요 시 `git revert <commit>`으로 안전하게 롤백한다.

## 7. Evidence
- 빌드 로그: `npm run build` 성공 로그
- 검증 로그: `bash scripts/verify_fast.sh` 성공 로그
- Git 증적: commit hash, push 결과
