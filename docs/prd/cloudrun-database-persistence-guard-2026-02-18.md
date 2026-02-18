# PRD: Cloud Run DB 영속성 강제 및 배포 안전장치 (2026-02-18)

## 배경
- Cloud Run 배포 시 `DATABASE_URL`이 없으면 `/tmp` 기반 SQLite로 동작해 재배포/재시작마다 계정/프로젝트 데이터가 유실될 수 있다.
- 실제 운영에서 호스팅 업데이트마다 로그인 계정/프로젝트가 사라지는 현상이 발생했다.

## 목표
- 백엔드를 영속 DB(Cloud SQL PostgreSQL)로 고정해 데이터 유실을 방지한다.
- 배포 스크립트에서 동일 실수가 재발하지 않도록 안전장치를 추가한다.

## 범위
- 인프라/운영
  - Cloud SQL PostgreSQL 인스턴스 생성
  - Cloud Run 서비스에 Cloud SQL 바인딩 + 영속 `DATABASE_URL` 적용
  - 재배포 후 계정 데이터 유지 검증
- 코드/문서
  - `deploy_backend_cloudrun.sh`에 임시 SQLite 배포 차단 로직 추가
  - 배포 문서(`docs/backend-deploy.md`) 업데이트

## 비범위
- Secret Manager 연동으로 DB 비밀번호 분리
- DB 마이그레이션 도구(Alembic) 도입

## 요구사항
- REQ-001: Cloud Run `DATABASE_URL`은 영속 DB(PostgreSQL)여야 한다.
- REQ-002: Cloud Run에 `run.googleapis.com/cloudsql-instances` 바인딩이 설정되어야 한다.
- REQ-003: 배포 스크립트는 `sqlite:////tmp/...`를 기본 차단해야 한다.
- REQ-004: 재배포 전/후 동일 테스트 계정 로그인 성공으로 데이터 유지가 확인되어야 한다.

## 완료 기준
- Cloud Run 서비스 환경값/어노테이션이 Cloud SQL 기준으로 설정됨
- 재배포 후 테스트 계정 로그인 성공
- 배포 스크립트 안전장치 반영 및 문서 동기화 완료
