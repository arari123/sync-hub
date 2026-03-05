# 1. Goal
예산 종합 내역을 엑셀 템플릿으로 다운로드하고, 수정한 엑셀을 업로드해 집행 데이터를 반영할 수 있게 한다.

# 2. Entry Points
- `app/api/budget.py`
- `app/core/budget_excel.py`
- `frontend/src/pages/BudgetProjectBudget.jsx`

# 3. Files-to-Touch
- `app/core/budget_excel.py`
- `app/api/budget.py`
- `frontend/src/pages/BudgetProjectBudget.jsx`
- `tests/test_budget_excel.py`
- `docs/prd/budget-excel-upload-download-2026-02-18.md`
- `.agent/execplans/2026-02-18-budget-excel-upload-download.md`
- `docs/repo-map.md`
- `docs/project-input-spec.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 시트 구성(`요약/재료비/인건비/경비`) 확인 | `python -m unittest tests.test_budget_excel.BudgetExcelTests.test_build_excel_contains_required_sheets` |
| REQ-002 | 디자인 적용(헤더/행 스타일) 코드 반영 확인 | `git diff app/core/budget_excel.py` |
| REQ-003 | 합계 수식 포함 확인 | `python -m unittest tests.test_budget_excel.BudgetExcelTests.test_parse_fails_when_formula_removed` |
| REQ-004 | 수식 셀 보호 검증 확인 | `python -m unittest tests.test_budget_excel.BudgetExcelTests.test_parse_fails_when_sheet_protection_disabled` |
| REQ-005 | 업로드 집행 반영 확인 | `python -m unittest tests.test_budget_excel.BudgetExcelTests.test_parse_execution_import_success` |
| REQ-006 | 템플릿 변경 엄격 검증 확인 | `python -m unittest tests.test_budget_excel.BudgetExcelTests.test_parse_fails_when_header_changed` |
| REQ-007 | 셀 위치 포함 오류 메시지 확인 | `python -m unittest tests/test_budget_excel.py` |

# 5. Implementation Steps
1. 엑셀 템플릿 생성/검증/파싱 코어(`budget_excel.py`)를 구현한다.
2. 예산 API에 `export-excel`/`import-excel` 엔드포인트를 추가한다.
3. 업로드 시 집행 데이터만 반영하고 단계 정책(검토 단계 제한)을 적용한다.
4. 프론트 예산 메인에 엑셀 다운로드/업로드 버튼 및 결과 메시지를 연동한다.
5. 단위 테스트를 추가하고 Docker `verify:fast`를 수행한다.
6. 문서(`PRD`, `repo-map`, `project-input-spec`)를 동기화한다.

# 6. Rollback Plan
1. 해당 커밋을 `git revert` 한다.
2. 문제 시 `app/core/budget_excel.py`와 API 라우트를 제거하고 기존 입력 플로우(`PUT /details`)만 유지한다.

# 7. Evidence
- 코드 diff
- `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 로그
