# 프로젝트 브라우저에서 로컬웹 접속 허용 (Vite Host 403 해결)

## 배경/문제
- Sync-Hub 프론트는 Docker Compose로 Vite dev server를 띄워 `http://localhost:8000`에서 접속한다.
- 일부 환경(IDE 포트 프리뷰/프로젝트 브라우저)은 `localhost`가 아닌 프리뷰 도메인으로 접속하며, 이때 요청의 `Host` 헤더가 `localhost`가 아니다.
- 현재 설정에서는 Vite가 허용되지 않은 `Host`에 대해 `403 Forbidden`을 반환하여 프로젝트 브라우저에서 프론트가 열리지 않는다.

## 목표
- 프로젝트 브라우저(포트 프리뷰)에서 노출되는 비-`localhost` 도메인으로 접속해도 프론트가 정상 로드되도록 한다.

## 비목표
- 프로덕션 배포(정적 빌드/서버 배포) 방식 변경은 하지 않는다.
- 보안 정책(개발 환경 외부 공개)에 대한 추가 강화는 범위 밖이다.

## 요구사항
- REQ-001: `Host`가 `localhost`가 아닌 요청에서도 프론트가 `403`이 아닌 정상 응답을 반환해야 한다.
- REQ-002: 기존 `http://localhost:8000` / `http://localhost:9000` 접속은 그대로 동작해야 한다.

## 수용 기준(AC)
- AC-001: `curl -H 'Host: example.com' http://localhost:8000` 결과가 `200`(또는 정상 HTML 응답)이어야 한다.
- AC-002: `curl http://localhost:8000` 결과가 `200`이어야 한다.

## 구현 메모
- Vite dev server의 호스트 검증을 완화하기 위해 `frontend/vite.config.js`에 `server.allowedHosts: true`를 설정한다.

