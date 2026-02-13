# localhost 시작/복구 가이드

## 목적
- 매 세션 시작 시 웹 접속 지연을 줄이고, 자주 발생하는 Docker Compose 충돌을 자동 복구한다.
- 기본 진입 URL을 고정해 로그인/세션 확인을 빠르게 한다.

## 권장 시작 명령
1. 기본 웹 실행(일반 작업):
   - `bash scripts/start_localhost.sh`
2. GPU OCR 포함 실행(고부하 OCR 작업):
   - `bash scripts/start_localhost.sh gpu`

## 기본 접속 주소
- 웹(기본): `http://localhost:8000`
- 웹(대체): `http://localhost:9000`
- API: `http://localhost:8001`

## 스크립트가 자동으로 처리하는 항목
- `COMPOSE_PROJECT_NAME`을 기본 `synchub`로 고정
- `db`, `elasticsearch`, `ollama`, `web`, `frontend` 기동
- GPU 모드에서는 `paddle-vlm-server`, `ocr-worker` 추가 기동
- 아래 오류가 발생하면 충돌 컨테이너를 정리하고 최대 6회 자동 재시도
  - `Conflict. The container name "/synchub_web" is already in use`
  - `Conflict. The container name "/synchub_frontend" is already in use`
  - `KeyError: 'ContainerConfig'` (docker-compose v1 재생성 오류)
- `port is already allocated` 오류가 발생하면 `*_synchub_db|es|ollama|web|frontend` 형태의 레거시 컨테이너를 정리하고 재시도
- 기동 후 `8001/health`, `8000`, `9000` HTTP 응답 확인

## 세션/로그인 주의사항
- `localhost:8000`과 `localhost:9000`은 브라우저 기준 서로 다른 Origin이다.
- 따라서 로그인 세션(localStorage)은 포트별로 분리된다.
- 운영 확인 기준 URL은 `http://localhost:8000`으로 통일한다.

## 수동 복구(자동 복구로 해결되지 않을 때)
1. 웹 관련 컨테이너 중지:
   - `docker-compose stop web frontend`
2. 충돌 컨테이너 제거:
   - `docker rm synchub_web synchub_frontend 2>/dev/null || true`
3. 다시 시작:
   - `bash scripts/start_localhost.sh`

## 종료 명령
- 웹/API만 중지:
  - `docker-compose stop frontend web`
- GPU 포함 전체 중지:
  - `docker-compose -f docker-compose.yml -f docker-compose.gpu.yml stop`
