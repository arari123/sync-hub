# 실행 계획: 안건 페이지 DB 연동

## 1. Goal
- `agenda` 화면을 목업에서 실제 DB 연동 기능으로 전환한다.

## 2. Entry Points
- 백엔드: `app/models.py`, `app/api/agenda.py`, `app/main.py`
- 프론트: `frontend/src/pages/AgendaList.jsx`, `frontend/src/pages/AgendaCreate.jsx`, `frontend/src/pages/AgendaDetail.jsx`

## 3. Files-to-Touch
- `docs/prd/agenda-db-integration.md` (신규)
- `.agent/execplans/2026-02-12-agenda-db-integration.md` (신규)
- `app/models.py`
- `app/api/agenda.py` (신규)
- `app/main.py`
- `frontend/src/components/ProjectContextNav.jsx`
- `frontend/src/pages/AgendaList.jsx`
- `frontend/src/pages/AgendaCreate.jsx`
- `frontend/src/pages/AgendaDetail.jsx`
- `frontend/src/components/agenda/RichTextEditor.jsx` (신규)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| AGD-REQ-001 | 임시저장/정식등록 API 동작 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |
| AGD-REQ-003 | 검색/필터 helper 단위 테스트 통과 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |
| AGD-REQ-005 | 프론트 빌드 성공 | `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` |

## 5. Implementation Steps
1. 안건 데이터 모델(스레드/엔트리/첨부/코멘트)과 API 라우터를 구현한다.
2. 목록/상세/작성 페이지를 API 연동 구조로 교체한다.
3. 리치 텍스트 에디터 및 이미지 붙여넣기/첨부 업로드를 연결한다.
4. Docker 기반 검증을 수행한다.

## 6. Rollback Plan
- 신규 파일 삭제 및 수정 파일 git revert로 원복한다.
- DB 신규 테이블은 운영 반영 전 검증 환경에서만 생성되도록 유지한다.

## 7. Evidence
- 검증 커맨드 결과 로그
- 페이지 동작 확인(목록 조회, 작성/등록, 상세/코멘트)
