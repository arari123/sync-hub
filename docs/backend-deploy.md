# 백엔드 배포 가이드 (Cloud Run + Firebase Hosting)

## 1) 배포 대상
- 백엔드: Cloud Run (`sync-hub-backend`)
- 프론트 정적 호스팅: Firebase Hosting
- API 프록시: Firebase Hosting rewrite -> Cloud Run

## 2) 사전 조건
1. `gcloud`, `firebase` CLI 로그인 완료
2. GCP 프로젝트 선택 완료
   - `gcloud config set project sync-hub-arari-20260213011439`
3. **프로젝트 결제(Billing) 활성화 필수**
   - `gcloud beta billing projects describe sync-hub-arari-20260213011439`
   - `billingEnabled: true`여야 Cloud Run/Cloud Build API 활성화 가능

## 3) 백엔드 배포
저장소 루트에서 실행:

```bash
bash scripts/deploy_backend_cloudrun.sh
```

기본값:
- `CLOUD_RUN_SERVICE=sync-hub-backend`
- `GCP_REGION=asia-northeast3`
- `DATABASE_URL=sqlite:////tmp/sync-hub.db` (간편 배포 기본값)
- `CORS_ALLOW_ORIGINS=https://<site>.web.app,https://<site>.firebaseapp.com`

옵션 예시:

```bash
DATABASE_URL='postgresql://<user>:<pass>@<host>:5432/<db>' \
AUTH_ALLOWED_EMAIL_DOMAINS='gmail.com,company.com' \
bash scripts/deploy_backend_cloudrun.sh
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
   - `curl -s https://sync-hub-arari-20260213011439.web.app/health`

## 6) 현재 확인된 이슈
- 2026-02-13 기준, 프로젝트 `sync-hub-arari-20260213011439`는 billing 계정이 비활성(`open: false`) 상태면 배포가 차단된다.
- 조치: 결제 계정 재개 후 `scripts/deploy_backend_cloudrun.sh` 재실행.
