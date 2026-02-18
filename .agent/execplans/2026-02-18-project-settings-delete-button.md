# 1. Goal
프로젝트 설정 페이지에서 프로젝트 삭제를 수행할 수 있게 하고, 테스트 목적에 맞춰 연관 데이터를 완전 삭제한다.

# 2. Entry Points
- `frontend/src/pages/BudgetProjectInfoEdit.jsx`
- `app/api/budget.py`
- `docs/project-input-spec.md`
- `docs/repo-map.md`

# 3. Files-to-Touch
- `frontend/src/pages/BudgetProjectInfoEdit.jsx`
- `app/api/budget.py`
- `docs/prd/project-settings-delete-button-2026-02-18.md`
- `.agent/execplans/2026-02-18-project-settings-delete-button.md`
- `docs/project-input-spec.md`
- `docs/repo-map.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 설정 페이지 삭제 버튼 렌더링 | 코드 diff (`BudgetProjectInfoEdit.jsx`) |
| REQ-002 | 삭제 확인 절차 동작 | 코드 diff (`window.confirm`) |
| REQ-003 | 삭제 API 존재 | 코드 diff (`DELETE /budget/projects/{project_id}`) |
| REQ-004 | 권한 정책 유지 | 코드 diff (`_require_project_edit_permission`) |
| REQ-005 | 예산/안건/문서 데이터 정리 | 코드 diff (`budget_versions`, `agenda_*`, `documents` delete) |
| REQ-006 | 하위 프로젝트 포함 삭제 | 코드 diff (`_collect_project_ids_for_deletion`) |
| REQ-007 | 커버 이미지 파일 정리 | 코드 diff (`_delete_project_cover_file_if_unreferenced`) |

# 5. Implementation Steps
1. 삭제 API를 구현하고 완전 삭제 정리 로직을 반영한다.
2. 설정 페이지에 삭제 버튼, 확인 절차, 실패 메시지를 추가한다.
3. 프로젝트 입력 스펙/저장소 맵 문서를 최신화한다.
4. Docker에서 `verify:fast`를 실행해 회귀를 확인한다.

# 6. Rollback Plan
1. 해당 커밋을 `git revert`한다.
2. 배포된 경우 동일 브랜치로 롤백 커밋을 push 한다.

# 7. Evidence
- `docker exec ... bash scripts/verify_fast.sh` 통과 로그
- 변경 파일 diff
