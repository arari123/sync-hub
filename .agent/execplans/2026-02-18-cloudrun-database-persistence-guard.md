# 1. Goal
Cloud Run 배포 시 데이터 유실이 발생하지 않도록 영속 DB를 연결하고 배포 안전장치를 추가한다.

# 2. Entry Points
- `scripts/deploy_backend_cloudrun.sh`
- `docs/backend-deploy.md`
- Cloud Run service: `sync-hub-backend`
- Cloud SQL instance: `sync-hub-db`

# 3. Files-to-Touch
- `scripts/deploy_backend_cloudrun.sh`
- `docs/backend-deploy.md`
- `docs/prd/cloudrun-database-persistence-guard-2026-02-18.md`
- `.agent/execplans/2026-02-18-cloudrun-database-persistence-guard.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | Cloud Run `DATABASE_URL`이 PostgreSQL인지 확인 | `gcloud run services describe ...` |
| REQ-002 | Cloud SQL 바인딩 annotation 확인 | `gcloud run services describe ...` |
| REQ-003 | 배포 스크립트가 `/tmp` SQLite 차단 | `git diff scripts/deploy_backend_cloudrun.sh` |
| REQ-004 | 재배포 후 동일 계정 로그인 성공 | `POST /auth/login` before/after deploy |

# 5. Implementation Steps
1. Cloud SQL API/인스턴스/DB 계정을 준비한다.
2. Cloud Run에 Cloud SQL 바인딩과 PostgreSQL `DATABASE_URL`을 적용한다.
3. 테스트 계정 생성/로그인 후 재배포하고 다시 로그인해 유지 여부를 확인한다.
4. 배포 스크립트에 임시 SQLite 차단 가드를 추가한다.
5. 배포 문서를 현재 정책으로 업데이트한다.

# 6. Rollback Plan
1. Cloud Run 환경값을 이전 `DATABASE_URL`로 되돌리고 재배포한다.
2. 스크립트 가드가 문제면 해당 커밋을 `git revert`한다.

# 7. Evidence
- Cloud Run 설정 조회 결과
- 재배포 전/후 로그인 검증 결과
- 스크립트/문서 diff
