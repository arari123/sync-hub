# 1. Goal
Cloud Run의 DATABASE_URL 평문 노출을 제거하고 Secret Manager 기반 배포로 전환한다.

# 2. Entry Points
- `scripts/deploy_backend_cloudrun.sh`
- `docs/backend-deploy.md`
- Cloud Run: `sync-hub-backend`
- Secret Manager: `sync-hub-database-url`

# 3. Files-to-Touch
- `scripts/deploy_backend_cloudrun.sh`
- `docs/backend-deploy.md`
- `docs/prd/cloudrun-database-url-secret-manager-2026-02-18.md`
- `.agent/execplans/2026-02-18-cloudrun-database-url-secret-manager.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | Cloud Run env에서 DATABASE_URL secret 참조 확인 | `gcloud run services describe ... --format=json` |
| REQ-002 | 배포 스크립트 `DATABASE_URL_SECRET_NAME` 분기 확인 | `git diff scripts/deploy_backend_cloudrun.sh` |
| REQ-003 | Secret 미존재 시 에러 처리 로직 존재 | `git diff scripts/deploy_backend_cloudrun.sh` |
| REQ-004 | 재배포 후 기존 계정 로그인 성공 | `POST /auth/login` before/after |

# 5. Implementation Steps
1. Secret Manager에 DATABASE_URL을 저장하고 접근 권한을 부여한다.
2. 배포 스크립트에 Secret Manager 기반 분기를 추가한다.
3. 스크립트로 재배포해 Cloud Run이 secretKeyRef를 사용하도록 전환한다.
4. 로그인 검증으로 데이터 유지/정상 동작을 확인한다.
5. 문서를 최신 정책으로 갱신한다.

# 6. Rollback Plan
1. Cloud Run 배포 시 `DATABASE_URL` 평문 값을 다시 전달해 임시 복구한다.
2. 스크립트 문제 발생 시 해당 커밋을 `git revert`한다.

# 7. Evidence
- Cloud Run 설정 확인 결과
- 로그인 검증 결과
- 스크립트/문서 diff
