# 2026-02-07 Auth Login Domain Verification

## 1. Goal
- 로그인 페이지와 메일 인증 가입 기능을 구현하고, 지정 도메인 이메일만 가입 가능하도록 제한한다.

## 2. Entry Points
- `app/api/auth.py`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Signup.jsx`
- `frontend/src/pages/VerifyEmail.jsx`

## 3. Files-to-Touch
- backend: `app/models.py`, `app/main.py`, `app/api/auth.py`, `app/core/auth_utils.py`, `app/core/auth_mailer.py`
- frontend: `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Signup.jsx`, `frontend/src/pages/VerifyEmail.jsx`, `frontend/src/lib/session.js`, `frontend/src/lib/api.js`
- docs: `docs/prd/auth-login-domain-verification.md`, `.env.example`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| AUTH-REQ-001 | 로그인 페이지 및 보호 라우트 동작 | `npm run build` 성공 |
| AUTH-REQ-002 | 가입 -> 인증 -> 로그인 시나리오 | `curl /auth/signup`, `curl /auth/verify-email`, `curl /auth/login` 응답 확인 |
| AUTH-REQ-003 | 비허용 도메인 가입 차단 | `curl /auth/signup` -> HTTP 403 |
| AUTH-REQ-004 | 코드 회귀 없음 | `./scripts/verify_fast.sh` 통과 |

## 5. Implementation Steps
1. 인증 데이터 모델/유틸 구현
2. auth API 라우터 구현 및 앱 라우터 연결
3. 프론트 로그인/가입/인증 페이지 구현
4. 보호 라우트 및 세션 저장 구현
5. Docker 기반 검증 수행

## 6. Rollback Plan
- auth 라우터/모델/프론트 인증 페이지를 revert 하여 기존 무인증 라우팅으로 복구한다.

## 7. Evidence
- `docker exec synchub_web bash -lc 'cd /app && ./scripts/verify_fast.sh'`
- `docker exec synchub_frontend sh -lc 'cd /app && npm run build'`
