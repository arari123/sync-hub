# PRD: Cloud Run DATABASE_URL Secret Manager 이관 (2026-02-18)

## 배경
- Cloud Run 서비스 환경변수에 `DATABASE_URL`이 평문으로 저장되어 DB 비밀번호가 노출될 수 있다.
- 운영 보안 강화를 위해 DB 연결 문자열을 Secret Manager로 이관해야 한다.

## 목표
- Cloud Run의 `DATABASE_URL`을 Secret Manager 참조로 전환한다.
- 배포 스크립트가 Secret Manager 기반 배포를 기본 지원하도록 개선한다.

## 범위
- 인프라
  - Secret Manager 비밀(`sync-hub-database-url`) 생성 및 버전 등록
  - Cloud Run 런타임 서비스계정에 `roles/secretmanager.secretAccessor` 부여
  - Cloud Run 재배포로 `DATABASE_URL` secretKeyRef 적용
- 코드/문서
  - `scripts/deploy_backend_cloudrun.sh`에 `DATABASE_URL_SECRET_NAME` 지원 추가
  - 배포 문서(`docs/backend-deploy.md`)에 Secret Manager 사용법 반영

## 비범위
- Secret rotation 자동화(스케줄/파이프라인)
- DB 계정 다중화 또는 Vault 도입

## 요구사항
- REQ-001: Cloud Run 서비스에서 `DATABASE_URL`이 Secret Manager 참조로 설정된다.
- REQ-002: 배포 스크립트는 `DATABASE_URL_SECRET_NAME`을 받으면 `--set-secrets`로 배포한다.
- REQ-003: Secret 미존재 시 스크립트가 실패하며 명확한 오류를 출력한다.
- REQ-004: 재배포 후 로그인 계정 데이터가 유지된다.

## 완료 기준
- Cloud Run 설정 조회 시 `DATABASE_URL`이 secretKeyRef 기반으로 확인된다.
- `verify:fast` 통과
- 커밋/푸시 완료
