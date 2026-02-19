# 실행 계획: 프로젝트 데이터 관리(자료실) 및 검색 확장

## 1. Goal
- 프로젝트 자료실 페이지를 실제 기능으로 구현하고, 글로벌 검색/프로젝트 검색에서 자료 식별성을 강화한다.

## 2. Entry Points
- 프론트: `frontend/src/pages/BudgetProjectData.jsx`
- 라우팅: `frontend/src/App.jsx`
- 글로벌 검색 결과 UI: `frontend/src/components/ResultList.jsx`
- 백엔드 API: `app/api/project_data.py`, `app/api/documents.py`, `app/main.py`
- 스키마: `app/models.py`, `app/database.py`

## 3. Files-to-Touch
- `app/main.py`
- `app/api/project_data.py`
- `app/api/documents.py`
- `app/api/data_hub.py`
- `app/models.py`
- `app/database.py`
- `app/core/vector_store.py`
- `app/core/pipeline.py`
- `frontend/src/App.jsx`
- `frontend/src/pages/BudgetProjectData.jsx`
- `frontend/src/components/ResultList.jsx`
- `docs/prd/project-data-room-and-search-2026-02-19.md`
- `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 자료실 API 라우트가 서버에 연결되어 동작 | `docker exec synchub_web bash -lc 'cd /app && python -m compileall app'` |
| REQ-002 | 폴더 트리/우클릭 UI가 빌드 가능 | `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` |
| REQ-003 | 코멘트 필수 업로드 UI/엔드포인트 반영 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |
| REQ-004 | 파일 우클릭 메뉴(이름변경/삭제/이동) UI 반영 | `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` |
| REQ-005 | 글로벌 검색 결과에 프로젝트 코드/이름 표시 | `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` |

## 5. Implementation Steps
1. 문서/모델/스키마에 폴더 및 업로드 메타(`folder_id`, `uploaded_by_user_id`, `upload_comment`)를 반영한다.
2. `project_data` API에서 폴더/파일 CRUD, 프로젝트 전용 단어 매칭 검색, 코멘트 필수 업로드를 구현한다.
3. `documents/search` 응답에 `project_code`, `project_name`을 포함해 글로벌 검색 식별성을 보강한다.
4. `BudgetProjectData` 페이지를 구현하고 `/project-management/projects/:projectId/data`에 연결한다.
5. 자료실 UI에 폴더 트리, 우클릭 메뉴, 업로드 패널(코멘트 필수), 파일 리스트/우클릭 메뉴를 구현한다.
6. Docker 컨테이너 내부에서 `verify:fast`/프론트 빌드를 수행하고 결과를 확인한다.
7. `docs/repo-map.md`를 갱신해 신규 페이지/API를 기록한다.

## 6. Rollback Plan
- 문제 발생 시 아래 범위만 롤백한다.
  - 프론트: `BudgetProjectData.jsx`, `App.jsx`, `ResultList.jsx`
  - 백엔드: `project_data.py`, `documents.py`, `main.py`, 모델/스키마 변경
- DB 스키마는 런타임 보정 방식이므로 코드 롤백 후 신규 컬럼/테이블은 남아도 서비스 동작에는 영향이 없도록 호환성을 유지한다.

## 7. Evidence
- 검증 명령 결과(verify/build) 로그.
- `/project-management/projects/:projectId/data` 화면에서 폴더/파일 컨텍스트 메뉴 동작 확인.
- 글로벌 검색 결과 문서 카드에서 프로젝트 코드/이름 표시 확인.

