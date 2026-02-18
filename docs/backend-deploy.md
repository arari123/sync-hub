# 백엔드 배포 가이드 (Cloud Run + Firebase Hosting)

## 1) 배포 대상
- 백엔드: Cloud Run (`sync-hub-backend`)
- 프론트 정적 호스팅: Firebase Hosting
- API 프록시: Firebase Hosting rewrite -> Cloud Run

## 2) 사전 조건
1. `gcloud`, `firebase` CLI 로그인 완료
2. GCP 프로젝트 선택 완료
   - 예: `gcloud config set project sync-hub-yonghol-20260214`
3. **프로젝트 결제(Billing) 활성화 필수**
   - `gcloud beta billing projects describe <project-id>`
   - `billingEnabled: true`여야 Cloud Run/Cloud Build API 활성화 가능

## 3) 백엔드 배포
저장소 루트에서 실행:

```bash
bash scripts/deploy_backend_cloudrun.sh
```

기본값:
- `CLOUD_RUN_SERVICE=sync-hub-backend`
- `GCP_REGION=asia-northeast3`
- `DEPLOY_MODE=image` (로컬 Docker build/push 후 Cloud Run 배포)
- `DATABASE_URL_SECRET_NAME`: 현재 Cloud Run 서비스의 `DATABASE_URL` secret 참조를 우선 재사용
- `DATABASE_URL`: secret 참조가 없을 때만 현재 Cloud Run 서비스 값을 재사용
- `AUTH_ALLOWED_EMAIL_DOMAINS`: 현재 Cloud Run 서비스 값을 우선 재사용, 없을 때만 `gmail.com` 사용
- `CLOUD_SQL_INSTANCE_CONNECTION`: 현재 Cloud Run의 Cloud SQL 바인딩을 우선 재사용
- `CORS_ALLOW_ORIGINS=https://<site>.web.app,https://<site>.firebaseapp.com`

안전장치:
- 기본적으로 `/tmp` 기반 SQLite(`sqlite:////tmp/...`)는 배포 시 차단된다.
- 반드시 임시 모드가 필요하면 `ALLOW_EPHEMERAL_DATABASE=true`를 명시해야 한다(운영 비권장).
- `DATABASE_URL_SECRET_NAME`이 설정되면 Cloud Run `--set-secrets`로 배포하며, `DATABASE_URL` 평문 전달보다 우선한다.

Secret Manager 준비 예시:

```bash
gcloud services enable secretmanager.googleapis.com
gcloud secrets create sync-hub-database-url --replication-policy=automatic
printf '%s' 'postgresql+psycopg2://<user>:<pass>@/<db>?host=/cloudsql/<project>:<region>:<instance>' \
  | gcloud secrets versions add sync-hub-database-url --data-file=-
gcloud secrets add-iam-policy-binding sync-hub-database-url \
  --member='serviceAccount:<cloud-run-service-account>' \
  --role='roles/secretmanager.secretAccessor'
```

옵션 예시:

```bash
CLOUD_SQL_INSTANCE_CONNECTION='<project>:<region>:<instance>' \
DATABASE_URL_SECRET_NAME='sync-hub-database-url' \
AUTH_ALLOWED_EMAIL_DOMAINS='gmail.com,company.com' \
bash scripts/deploy_backend_cloudrun.sh
```

이미지 태그를 이미 보유한 경우(build/push 생략):

```bash
DEPLOY_MODE=image \
IMAGE_OVERRIDE='asia-northeast3-docker.pkg.dev/<project>/<repo>/sync-hub-backend:<tag>' \
bash scripts/deploy_backend_cloudrun.sh
```

소스 기반 배포(권한 충족 시에만 권장):

```bash
DEPLOY_MODE=source bash scripts/deploy_backend_cloudrun.sh
```

## 4) Firebase Hosting 배포
API rewrite 설정은 `firebase.json`에 반영되어 있다.
프론트 빌드 후 배포:

```bash
docker exec synchub_frontend sh -lc 'cd /app && npm run build'
firebase deploy --only hosting
```

## 5) 배포 후 점검
1. Cloud Run URL 헬스
   - `curl -s https://<cloud-run-url>/health`
   - `curl -s https://<cloud-run-url>/health/detail`
2. Hosting 도메인 경유 API
   - `curl -s https://<firebase-site>.web.app/health`

## 6) 현재 확인된 이슈
- 2026-02-13 기준, `gcloud run deploy --source`는 Cloud Build 기본 서비스계정 권한 정책에 따라 실패할 수 있다.
- 조치: 기본 모드(`DEPLOY_MODE=image`)를 사용하거나, Cloud Build 서비스계정 IAM을 별도 보강한다.
