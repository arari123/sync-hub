# ExecPlan: 호스팅 프로젝트 삭제 관리자 권한 수정

## 목표
- 관리자 계정이 매니저가 아니어도 프로젝트 수정/삭제 가능하도록 권한 로직 정합화

## 작업 단계
1. `app/api/budget.py`
- `_project_can_edit`에 관리자 우선 허용 로직 추가
- `_require_project_edit_permission`에 관리자 우회 로직 추가

2. 테스트 보강
- `tests/test_budget_visibility.py`
- 관리자 편집 허용/권한 우회, 비관리자 권한 거부 테스트 추가

3. 검증
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`

4. 배포
- Cloud Run 백엔드 재배포
- 호스팅에서 삭제 API 동작 재검증
