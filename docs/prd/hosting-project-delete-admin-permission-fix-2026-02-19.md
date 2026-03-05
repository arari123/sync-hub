# PRD: 호스팅 프로젝트 삭제 불가(관리자 편집 권한 누락) 수정

## 배경
호스팅 환경에서 관리자 식별자(`BUDGET_ADMIN_IDENTIFIERS`)가 설정되어 있어도 프로젝트 목록에서 `can_edit=false`가 반환되고, 프로젝트 삭제 API가 403(`No edit permission for this project.`)로 실패하는 문제가 확인됨.

## 문제 원인
- `app/api/budget.py`
  - `_project_can_edit`가 관리자 여부를 고려하지 않음.
  - `_require_project_edit_permission`도 관리자 우회가 없어 매니저 ID 일치만 강제함.

## 요구사항
1. 관리자 계정은 프로젝트 매니저 여부와 무관하게 `can_edit=true`로 판단한다.
2. 관리자 계정은 `_require_project_edit_permission` 검사를 우회할 수 있어야 한다.
3. 기존 비관리자 권한 제약은 유지한다.

## 완료 기준
- 관리자 계정으로 호스팅에서 프로젝트 삭제가 성공한다.
- 비관리자 계정은 기존처럼 권한 없으면 삭제/수정이 거부된다.
