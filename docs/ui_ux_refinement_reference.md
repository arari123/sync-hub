# UI/UX 개선사항 운영 참조 (Budget Frontend)

본 문서는 `docs/ui_ux_refinement_report.md`의 변경 내역을 실무 적용 관점으로 재정리한 참조 문서다.

## 1. 화면별 핵심 변경 요약
- `BudgetManagement.jsx`
  - 프로젝트 카드 밀도 최적화(최대 5열, 컴팩트 카드)
  - 제작/설치 상태 인디케이터 노출
  - 필터 영역 압축 및 Switch 기반 "내 프로젝트" 토글
- `BudgetProjectOverview.jsx`
  - 히어로 KPI(현재 단계/집행율/잔액/총 집행)
  - 타임라인/설비 분석 중심의 분석형 대시보드
- `BudgetProjectBudget.jsx`
  - 모니터링 중심 레이아웃(요약/설비별 비교)
- `BudgetProjectEditor.jsx`
  - 엑셀형 입력, 버퍼 기반 무한 행 확장, 붙여넣기 입력
  - 단계별 입력 모드(예산/집행) 및 예산 변경 전환 버튼 반영

## 2. 단계별 입력 정책 (운영 기준)
- `review(검토)`
  - 예산값(수량/단가/예산금액)만 입력
  - 집행금액 입력 비활성
- `fabrication / installation / warranty(AS)`
  - 기본 모드는 집행금액 입력
  - 예산 변경은 "예산 변경" 버튼으로 명시적 전환 후 수행
  - 확정 버전에서 예산 변경 시 리비전 생성 후 변경
  - 집행 입력은 예산 항목(`material_items/labor_items/expense_items`)과 분리된 독립 행(`execution_*_items`)으로 관리
  - 집행 화면에서는 설비 축만 유지하고 유닛/파츠/작업명은 집행 기준으로 별도 입력 가능

## 3. 데이터 저장 규칙
- 예산 데이터: `material_items / labor_items / expense_items`
- 집행 데이터: `execution_material_items / execution_labor_items / execution_expense_items`
- 모니터링 `actual_spent_*`는 입력된 `executed_amount`를 우선 반영
- 확정 버전(`confirmed`)에서는 예산 필드 변경 차단, 집행 배열 업데이트만 허용

## 4. 테스트/검증 포인트
- 셀 클릭/포커스/입력 가능 여부
  - 단계별로 편집 가능 컬럼이 정확히 전환되는지 확인
- 저장 후 DB 반영
  - 예산값 + 집행금액이 `budget_detail_json`에 저장되는지 확인
- 모니터링 반영
  - 집행금액 입력 후 `actual_spent_total`이 변경되는지 확인

## 5. 관련 파일 빠른 링크
- `frontend/src/pages/BudgetProjectEditor.jsx`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `frontend/src/components/BudgetSidebar.jsx`
- `app/api/budget.py`
- `app/core/budget_logic.py`

---
최종 업데이트: 2026-02-07
