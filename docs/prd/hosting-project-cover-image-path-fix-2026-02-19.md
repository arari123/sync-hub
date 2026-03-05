# PRD: 호스팅 환경 프로젝트 대표 썸네일 경로/표시 복구 (2026-02-19)

## 배경
- 호스팅 웹에서 프로젝트 대표 썸네일 이미지가 깨져 보이는 현상이 발생한다.
- 로컬에서는 정상 표시되어, 경로 처리 또는 서버 파일 존재성 차이 가능성이 높다.

## 목표
1. 커버 이미지 URL이 로컬 URL(`localhost`) 또는 잘못된 경로로 저장되어도 표시가 깨지지 않게 한다.
2. 프론트에서 상대경로 커버 URL을 API 기준 절대 URL로 안전하게 변환한다.
3. 서버에 커버 파일이 없을 때 자동 생성 fallback 이미지로 대체한다.

## 요구사항
- REQ-001: 커버 URL 입력/저장 시 `http(s)`, `data:image/*`, `/budget/project-covers/*` 형식만 허용/정규화한다.
- REQ-002: `http://localhost:*/budget/project-covers/...` 형태는 `/budget/project-covers/...`로 정규화한다.
- REQ-003: 프로젝트 직렬화 응답에서 local cover 파일이 없으면 `cover_image_display_url`은 fallback으로 반환한다.
- REQ-004: 프론트에서 커버 이미지 `src`는 API base URL 기준으로 해석한다.
- REQ-005: Docker 환경에서 `verify_fast` 및 프론트 `build`가 통과한다.

## 수용 기준
1. 호스팅에서 깨지던 프로젝트 대표 썸네일이 fallback 또는 정상 이미지로 표시된다.
2. 상대경로 커버 URL이 API 도메인 기준으로 로딩된다.
3. 로컬/호스팅 모두 동일한 표시 동작을 보장한다.
