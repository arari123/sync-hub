# PRD: 프로젝트 생성 커버 이미지 업로드 누락 수정 (2026-02-18)

## 배경
- 현재 프로젝트 생성 화면에서 이미지를 선택해도 미리보기만 동작하고 서버 저장이 수행되지 않는다.
- 로컬/호스팅 모두 동일하게 프로젝트 생성 후 대표 이미지가 반영되지 않는다.

## 목표
- 프로젝트 생성 시 선택한 이미지를 실제로 서버에 업로드하고, 생성 payload의 `cover_image_url`로 저장되게 한다.

## 범위
- 백엔드
  - 프로젝트 커버 이미지 업로드 API 추가
  - 업로드된 커버 이미지 조회 API 추가
  - `POST /budget/projects`에 `cover_image_url` 입력 허용
- 프론트엔드
  - 생성 화면에서 이미지 선택 시 파일 상태 유지
  - 생성 제출 시 이미지 업로드 후 반환 URL을 생성 요청에 포함

## 비범위
- 기존 프로젝트 수정 화면의 UX 개편
- 외부 스토리지(S3/GCS) 연동

## 요구사항
- REQ-001: `POST /budget/project-covers/upload`는 PNG/JPG/WEBP/GIF 파일만 허용한다.
- REQ-002: 업로드 용량 제한은 기본 5MB이며 초과 시 명확한 오류를 반환한다.
- REQ-003: 업로드 성공 시 `cover_image_url`(상대 경로)를 반환한다.
- REQ-004: `POST /budget/projects`는 `cover_image_url`을 받아 DB에 저장한다.
- REQ-005: `BudgetProjectCreate`는 이미지 선택 시 생성 제출 흐름에서 업로드 API를 호출하고, 반환 URL을 생성 payload에 포함한다.
- REQ-006: 문서(`project-input-spec`, `repo-map`)를 실제 동작과 일치하도록 갱신한다.

## 완료 기준
- 로컬 Docker 환경에서 `verify:fast` 통과
- 프로젝트 생성 API/화면 기준 커버 이미지 URL 저장 확인
