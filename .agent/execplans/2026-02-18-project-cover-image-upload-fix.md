# 1. Goal
프로젝트 생성 화면에서 선택한 커버 이미지가 실제 저장되지 않는 문제를 해결한다.

# 2. Entry Points
- `frontend/src/pages/BudgetProjectCreate.jsx`
- `app/api/budget.py`
- `docs/project-input-spec.md`
- `docs/repo-map.md`

# 3. Files-to-Touch
- `app/api/budget.py`
- `frontend/src/pages/BudgetProjectCreate.jsx`
- `docs/project-input-spec.md`
- `docs/repo-map.md`
- `docs/prd/project-cover-image-upload-fix-2026-02-18.md`
- `.agent/execplans/2026-02-18-project-cover-image-upload-fix.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 허용 포맷 외 파일 업로드 차단 로직 존재 | `python3 -m unittest ...test_budget_cover_upload.py` |
| REQ-002 | 용량 제한 초과 시 413 반환 로직 존재 | `python3 -m unittest ...test_budget_cover_upload.py` |
| REQ-003 | 업로드 API가 `cover_image_url` 반환 | `curl -F file=@... /budget/project-covers/upload` |
| REQ-004 | 프로젝트 생성 payload에 `cover_image_url` 반영 가능 | `python3 -m unittest ...test_budget_cover_upload.py` |
| REQ-005 | 생성 화면 submit 시 업로드 후 생성 요청 | `npm run verify:fast` |
| REQ-006 | 입력/맵 문서 최신화 | `git diff docs/project-input-spec.md docs/repo-map.md` |

# 5. Implementation Steps
1. 백엔드에 커버 업로드/조회 API와 파일 검증 로직을 추가한다.
2. 프로젝트 생성 모델에 `cover_image_url` 필드를 추가한다.
3. 생성 화면에서 파일 업로드 후 생성 payload에 URL을 포함하도록 연결한다.
4. 입력 스펙/저장소 맵 문서를 동기화한다.
5. Docker 내부에서 `verify:fast`를 실행해 회귀를 확인한다.

# 6. Rollback Plan
1. `git revert`로 본 커밋을 되돌린다.
2. 업로드 API 추가로 생성된 파일은 `uploads/project-covers/`에서 수동 정리한다.

# 7. Evidence
- 코드 변경 diff
- `docker exec ... bash scripts/verify_fast.sh` 통과 로그
