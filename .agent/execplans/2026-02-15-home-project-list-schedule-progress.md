# Execution Plan: 메인 프로젝트 리스트 단계 일정 프로그레스바 (2026-02-15)

## 1. Goal
`/home` 프로젝트 리스트에서 단계(설계/제작/설치/AS) 기반 프로그레스바와 일정관리 연동 날짜 표시를 제공한다. 검토/종료 단계는 오버레이로 생성일자/종료일자와 함께 표시하며, 오버레이는 크게/반투명(글래스) 스타일로 가독성을 강화한다.

## 2. Entry Points
- 메인 프로젝트 리스트: `frontend/src/pages/SearchResults.jsx`
- 일정 유틸: `frontend/src/lib/scheduleUtils.js`
- 일정 API: `GET /budget/projects/{project_id}/schedule`

## 3. Files-to-Touch
- `frontend/src/pages/SearchResults.jsx`
- `docs/prd/home-project-list-schedule-progress-2026-02-15.md`
- `.agent/execplans/2026-02-15-home-project-list-schedule-progress.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| FE-REQ-001~004 | `/home`에서 단계 바/날짜/검토·종료 오버레이 확인 | 브라우저에서 확인 |
| AC-006 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `SearchResults.jsx`에서 보이는 프로젝트 ID 기준으로 일정 API를 조회해 stage 요약(first/last)을 캐싱한다.
2. 설치 종료일을 AS 시작일로 사용하고, 종료일은 AS 시작 + 1년으로 계산한다.
3. 단계별 바(4단계) + 날짜 그리드를 렌더링하고, 검토/종료 단계는 오버레이를 표시한다.
4. 오버레이가 커져도 카드 상/하단 정보와 겹치지 않도록 프로그레스바 컨테이너 높이/배치를 조정한다(오버레이는 반투명 글래스 스타일).
5. Docker에서 `verify:fast` 및 프론트 `npm run build` 실행.
6. 커밋/푸시.

## 6. Rollback Plan
- `SearchResults.jsx`의 단계 바/일정 조회 로직을 제거하고 기존 단일 진행률 바로 복원한다.
