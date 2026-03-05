# 2026-02-16 Project Browser Localweb Access

## 1. Goal
- 프로젝트 브라우저(포트 프리뷰)에서 프론트 접속 시 Vite host 검증으로 발생하는 `403 Forbidden`을 제거한다.

## 2. Entry Points
- `scripts/start_localhost.sh`
- `docker-compose.yml` (`frontend` 서비스 포트: `8000`, `9000`)
- `frontend/vite.config.js`

## 3. Files-to-Touch
- Modify: `frontend/vite.config.js`
- Add: `docs/prd/project-browser-localweb-access-2026-02-16.md`
- Add: `.agent/execplans/2026-02-16-project-browser-localweb-access.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 비-`localhost` Host 헤더로 프론트 요청 시 403이 아닌 정상 응답 | `curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: example.com' http://localhost:8000` -> `200` |
| REQ-002 | 기존 `localhost` 접속 정상 | `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8000` -> `200` |

## 5. Implementation Steps
1. `frontend/vite.config.js`에 `server.allowedHosts: true` 추가.
2. `frontend` 컨테이너 재시작으로 설정 반영.
3. `curl`로 `Host` 헤더 테스트 및 기본 접속 테스트 수행.
4. Docker 환경에서 `verify:fast` 실행 후 커밋/푸시.

## 6. Rollback Plan
- `frontend/vite.config.js`에서 `server.allowedHosts` 설정을 제거(또는 제한 리스트로 변경)하고 `frontend` 컨테이너를 재시작한다.

## 7. Evidence
- 위 `curl` 테스트 결과(HTTP 200)와 `verify:fast` 통과 로그를 작업 기록으로 남긴다.

