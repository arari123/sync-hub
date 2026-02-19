# 실행 계획: 호스팅 프로젝트 대표 썸네일 경로/표시 복구

## 1. Goal
- 호스팅 환경에서 깨지는 프로젝트 대표 썸네일 이미지를 경로 정규화와 fallback 처리로 복구한다.

## 2. Entry Points
- 백엔드: `app/api/budget.py`
- 프론트: `frontend/src/lib/api.js`, `frontend/src/pages/SearchResults.jsx`, `frontend/src/pages/BudgetProjectOverview.jsx`
- 테스트: `tests/test_budget_cover_upload.py`

## 3. Files-to-Touch
- `app/api/budget.py`
- `frontend/src/lib/api.js`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/pages/BudgetProjectOverview.jsx`
- `tests/test_budget_cover_upload.py`
- `docs/prd/hosting-project-cover-image-path-fix-2026-02-19.md`
- `.agent/execplans/2026-02-19-hosting-project-cover-image-path-fix.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof |
| :--- | :--- | :--- |
| REQ-001 | 커버 URL 입력 정규화 | `tests/test_budget_cover_upload.py` |
| REQ-002 | localhost 절대 URL 정규화 | `test_normalize_project_cover_input_url_from_absolute_localhost_url` |
| REQ-003 | 파일 미존재 fallback 표시 | `test_resolve_project_cover_urls_falls_back_when_file_missing` |
| REQ-004 | 프론트 커버 URL API base 해석 | `npm run build` |
| REQ-005 | 전체 빠른 검증 | `bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 백엔드 커버 URL 정규화 헬퍼를 추가한다.
2. 프로젝트 직렬화 시 커버 파일 존재 여부를 확인해 display URL을 fallback으로 보정한다.
3. 생성/수정 API에서 커버 URL 입력값을 정규화한다.
4. 프론트 `resolveApiAssetUrl` 유틸을 추가해 커버 이미지 URL을 절대화한다.
5. 관련 단위 테스트를 추가하고 Docker 검증을 실행한다.

## 6. Rollback Plan
- 위 변경 파일만 되돌리면 기존 로직으로 복구 가능하다.

## 7. Evidence
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend sh -lc 'npm run build'`
