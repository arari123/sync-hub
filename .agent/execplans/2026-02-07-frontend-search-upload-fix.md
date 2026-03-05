# 1. Goal
프론트엔드 검색 불능 이슈(API 대상 포트 불일치)를 수정하고, 메인 페이지에서 PDF 업로드 기능을 더 명확하게 제공하되 기존 디자인 톤을 유지한다.

## 2. Entry Points
- `frontend/src/lib/api.js`
- `frontend/src/pages/Home.jsx`
- `docs/dev-setup.md`
- `docker-compose.yml`

## 3. Files-to-Touch
- `docs/dev-setup.md`
- `frontend/src/lib/api.js`
- `frontend/src/pages/Home.jsx`
- `docker-compose.yml`
- `docs/session-handover-2026-02-07.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 프론트 기본 API URL이 현재 API 포트와 일치 | `frontend/src/lib/api.js` 기본값 `http://localhost:8001` |
| REQ-002 | 메인 페이지에서 PDF 업로드 기능 제공 | `frontend/src/pages/Home.jsx`에 `UploadWidget` 전면 배치 |
| REQ-003 | 프론트 변경 후 빌드 가능 | `docker run ... node:20-bullseye ... npm run build` 성공 |

## 5. Implementation Steps
1. `dev-setup` 문서에 프론트 API 포트 점검 규칙을 명확히 추가한다.
2. 프론트 API 기본 URL을 `8001` 기준으로 수정한다.
3. 메인 페이지 레이아웃에서 업로드 위젯을 검색창 바로 아래로 전면 배치한다.
4. Docker 컨테이너에서 프론트 빌드와 `verify:fast`를 실행한다.

## 6. Rollback Plan
1. `git checkout -- docs/dev-setup.md frontend/src/lib/api.js frontend/src/pages/Home.jsx docker-compose.yml docs/session-handover-2026-02-07.md`
2. 프론트 빌드 재검증

## 7. Evidence
- `docker run --rm -v /home/arari123/sync-hub:/repo node:20-bullseye ... npm run build` 출력
- `docker exec synchub_web_noreload bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 로그
