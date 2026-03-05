# PRD: 백엔드 Cloud Run 배포 정비 (2026-02-13)

## 배경
- 프론트는 Firebase Hosting으로 배포 가능한 상태지만, API 백엔드 배포 경로가 문서/스크립트로 표준화되어 있지 않다.
- 운영 재현성을 위해 백엔드 배포를 Cloud Run 기준으로 고정한다.

## 목표
- FastAPI 백엔드를 Cloud Run으로 재현 가능하게 배포한다.
- Firebase Hosting에서 API 경로를 Cloud Run으로 프록시하도록 설정한다.
- 배포 절차를 스크립트/문서로 고정한다.

## 범위
- 포함:
  - Cloud Run 배포 스크립트 추가
  - Firebase rewrite에 API 프록시 경로 추가
  - Cloud Run `PORT` 환경변수 호환
  - 운영 가이드 문서화
- 제외:
  - Cloud SQL/Elasticsearch 완전 관리형 인프라 구축
  - OCR Worker의 클라우드 운영 토폴로지 구축

## 요구사항
1. `scripts/deploy_backend_cloudrun.sh`로 배포가 가능해야 한다.
2. Billing 미연결/비활성 상태에서는 즉시 실패하고 조치 안내를 출력해야 한다.
3. Firebase Hosting은 `/auth`, `/documents`, `/budget`, `/agenda`, `/api`, `/health` 경로를 Cloud Run으로 라우팅해야 한다.
4. 컨테이너는 Cloud Run `PORT` 값을 사용해 기동 가능해야 한다.

## 완료 기준
- 배포 스크립트/설정/문서가 저장소에 반영되어 있다.
- Docker 기준 `verify:fast`가 통과한다.
