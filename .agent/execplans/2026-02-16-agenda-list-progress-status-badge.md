# Execution Plan: Agenda List Progress Status Badge (2026-02-16)

## 1. Goal
- 안건 리스트 항목에 `진행중/종료` 상태를 노출한다.

## 2. Entry Points
- `frontend/src/components/agenda/AgendaSplitView.jsx`

## 3. Files-to-Touch
- `frontend/src/components/agenda/AgendaSplitView.jsx`
- `docs/prd/agenda-list-progress-status-badge-2026-02-16.md`
- `.agent/execplans/2026-02-16-agenda-list-progress-status-badge.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 리스트 항목에 상태 배지 노출 | 수동 확인 |
| REQ-003 | completed=종료, 그 외=진행중 표기 | 수동 확인 |
| - | 프론트 빌드/회귀 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. 리스트 아이템에 상태 라벨/톤 헬퍼 함수 추가.
2. 항목 상단 메타 영역에 상태 배지 렌더링.
3. Docker 빌드/검증 후 커밋 및 푸시.

## 6. Rollback Plan
- 상태 라벨/배지 렌더링 코드 제거.

## 7. Evidence
- `docker exec synchub_frontend npm run build`
- `docker exec synchub_web bash scripts/verify_fast.sh`
