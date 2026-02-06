# Execution Plan: Frontend Health Observability Panel

## 1. Goal
프론트엔드에서 백엔드 의존성 상태(DB/ES/OCR)를 실시간으로 확인할 수 있도록 `/health/detail` 기반 운영 상태 패널을 추가한다.

## 2. Entry Points
- Frontend app: `frontend/src/App.jsx`
- Frontend styles: `frontend/src/App.css`
- Backend detail health: `GET /health/detail`

## 3. Files-to-Touch
- `frontend/src/App.jsx`: health polling state + panel UI.
- `frontend/src/App.css`: health panel 전용 스타일.
- `.agent/execplans/2026-02-05-frontend-observability.md`: 실행 계획/증적.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| FE-OBS-001 | health detail API 결과를 화면에 표시 | `frontend` build 결과 + UI 렌더링 |
| FE-OBS-002 | 의존성 상태를 healthy/unhealthy/degraded로 구분 | `npm run lint` |
| FE-OBS-003 | 전체 검증 스크립트 통과 | `npm run verify:fast`, `npm run verify` |

## 5. Implementation Steps
1. `/health/detail` 호출 함수와 주기 polling state를 추가.
2. 전체 상태 + 의존성별 상태 카드 패널을 사이드 컬럼에 배치.
3. 상태별 색상/배지 스타일을 추가하고 모바일 반응형 확인.
4. lint/build/verify 실행 후 증적 기록.

## 6. Rollback Plan
1. `frontend/src/App.jsx`에서 health panel 관련 state/UI 제거.
2. `frontend/src/App.css`의 health panel 스타일 제거.

## 7. Evidence
- `cd frontend && npm run lint` 통과 (eslint 에러 없음).
- `cd frontend && npm run build` 통과:
  - `dist/index.html`
  - `dist/assets/index-CbaBus70.css`
  - `dist/assets/index-BOYVM2QB.js`
- `npm run verify:fast` -> `Syntax check passed for 12 files.`
- `npm run verify` 통과:
  - `GET /health` -> `{"status":"healthy"}`
  - `GET /health/detail` -> `status:"healthy"` + 의존성 상태 반환
  - `POST /_analyze` (`nori_tokenizer`) -> 토큰 6개 반환
