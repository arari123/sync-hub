# PRD: 로그인/메일인증 가입(도메인 제한)

## 1. 목적
- Sync-Hub 접속 전 인증을 도입하고, 지정된 회사 도메인 이메일만 가입하도록 제한한다.

## 2. 요구사항
- AUTH-REQ-001: 로그인 페이지 제공
  - 이메일/비밀번호 로그인
  - 로그인 성공 시 보호 페이지 접근 가능
- AUTH-REQ-002: 메일 인증 가입
  - 가입 요청 시 인증 토큰 발급
  - 인증 완료 전 로그인 불가
- AUTH-REQ-003: 허용 도메인 제한
  - `AUTH_ALLOWED_EMAIL_DOMAINS`에 포함된 도메인만 가입 허용
- AUTH-REQ-004: 세션 토큰
  - 로그인 시 액세스 토큰 발급
  - `Authorization: Bearer <token>` 기반으로 `/auth/me` 조회

## 3. API
- `POST /auth/signup`
- `POST /auth/verify-email`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

## 4. 설정
- `AUTH_ALLOWED_EMAIL_DOMAINS`
- `AUTH_VERIFY_TOKEN_TTL_MINUTES`
- `AUTH_SESSION_TTL_HOURS`
- `AUTH_FRONTEND_BASE_URL`
- SMTP 설정(`AUTH_SMTP_*`)

## 5. 수용 기준
- 비허용 도메인 가입 요청 시 `403`
- 인증 전 로그인 시 `403`
- 인증 후 로그인 성공 및 보호 라우트 접근 가능
