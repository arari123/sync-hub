# 실행 계획: 데이터 허브 AI 재활성화 라우팅 수정

## 1. Goal
- 호스팅에서 데이터 허브 API 경로 충돌을 제거해 AI 기능 비활성화 문제를 복구한다.

## 2. Entry Points
- `app/main.py`
- `frontend/src/pages/DataHub.jsx`

## 3. Files-to-Touch
- `app/main.py`
- `frontend/src/pages/DataHub.jsx`
- `docs/prd/data-hub-ai-reactivation-routing-fix-2026-02-19.md`
- `.agent/execplans/2026-02-19-data-hub-ai-reactivation-routing-fix.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof |
| :--- | :--- | :--- |
| REQ-001 | 백엔드 `/api/data-hub/*` 노출 | `curl /api/data-hub/permissions` (인증 기반 JSON 응답) |
| REQ-002 | 프론트 API 호출 경로 수정 | `npm run build` |
| REQ-003 | 회귀 검증 | `bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `data_hub` 라우터를 `/api` prefix로도 노출한다.
2. 프론트 데이터 허브 API 경로를 `/api/data-hub/*`로 변경한다.
3. Docker 검증(`verify_fast`, frontend build) 후 배포한다.

## 6. Rollback Plan
- `app/main.py`, `frontend/src/pages/DataHub.jsx`의 변경만 되돌리면 즉시 복구 가능하다.

## 7. Evidence
- 검증 명령 통과 로그
- 배포 후 호스팅 URL에서 데이터 허브 기능 확인
