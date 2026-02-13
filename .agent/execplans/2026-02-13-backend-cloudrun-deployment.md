# Execution Plan: Backend Cloud Run Deployment Alignment

## 1. Goal
Firebase Hosting + Cloud Run 조합으로 백엔드 배포 절차를 표준화하고, 재실행 가능한 스크립트/설정을 저장소에 반영한다.

## 2. Entry Points
- `scripts/deploy_backend_cloudrun.sh`
- `firebase.json`
- `Dockerfile`
- `docs/backend-deploy.md`

## 3. Files-to-Touch
- `Dockerfile`
- `scripts/deploy_backend_cloudrun.sh`
- `firebase.json`
- `docs/backend-deploy.md`
- `docs/prd/backend-cloudrun-deployment.md`
- `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| DEP-001 | Cloud Run 포트 호환 | `Dockerfile` CMD가 `${PORT:-8000}` 사용 |
| DEP-002 | Billing 미연결 사전 차단 | `bash scripts/deploy_backend_cloudrun.sh` -> billing 에러 메시지 |
| DEP-003 | Firebase API 프록시 | `firebase.json`에 API 경로별 `run` rewrite 존재 |
| DEP-004 | 기본 품질 검증 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 |

## 5. Implementation Steps
1. Cloud Run 배포 스크립트 작성 및 billing/API 사전 체크 추가.
2. Dockerfile의 런타임 포트 처리 방식 보강.
3. Firebase Hosting rewrite를 API 경로별 Cloud Run 프록시로 확장.
4. 운영 문서/PRD/repo-map 동기화 및 Docker 기반 검증 수행.

## 6. Rollback Plan
1. 배포 관련 변경 파일을 `git revert <commit>`으로 원복한다.
2. Firebase rewrite 충돌 시 `firebase.json`을 이전 SPA 단일 rewrite로 되돌린다.
3. Cloud Run 배포 실패 시 기존 서비스 revision으로 트래픽을 롤백한다.

## 7. Evidence
- Billing 비활성 확인 로그 (`billingEnabled: false`, billing account closed)
- Docker 기반 `verify:fast` 실행 로그
- 배포 스크립트/설정/문서 diff
