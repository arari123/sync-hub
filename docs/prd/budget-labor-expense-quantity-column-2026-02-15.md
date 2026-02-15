# PRD: 예산 메인 인건비/경비 탭 수량 열 추가 (2026-02-15)

## 목적
- 예산 메인(`프로젝트 > 예산`)에서 인건비/경비 항목별 수량을 한 눈에 확인할 수 있도록 `수량` 열을 추가한다.

## 범위
- 프론트엔드: `frontend/src/pages/BudgetProjectBudget.jsx`
- 예산 메인 탭 중 `인건비`, `경비`

## 요구사항
- REQ-001: 인건비 탭 테이블에 `수량` 열을 추가한다.
  - 위치: `예산` 열 바로 앞
- REQ-002: 경비 탭 테이블에 `수량` 열을 추가한다.
  - 위치: `예산` 열 바로 앞
- REQ-003: 수량은 각 항목(행) 기준으로 표시한다.

## 수용 기준
- AC-001: 인건비 탭에서 각 항목 행에 `수량` 값이 표시된다.
- AC-002: 경비 탭에서 각 항목 행에 `수량` 값이 표시된다.

## 검증
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend npm run build`

