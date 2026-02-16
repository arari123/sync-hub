# Execution Plan: Agenda Infinite Scroll Loading-Stuck Fix (2026-02-16)

## 1. Goal
- 검색 후 인피니티 스크롤에서 `더 불러오는 중...` 고정 상태가 발생하는 버그를 해결한다.

## 2. Entry Points
- `frontend/src/components/agenda/AgendaSplitView.jsx`

## 3. Files-to-Touch
- `frontend/src/components/agenda/AgendaSplitView.jsx`
- `docs/prd/agenda-list-infinite-scroll-loading-stuck-fix-2026-02-16.md`
- `.agent/execplans/2026-02-16-agenda-infinite-scroll-loading-stuck-fix.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 취소된 page>1 요청에서도 로딩 상태 해제 | 코드 확인 + 수동 확인 |
| REQ-002 | 취소된 page>1 요청에서도 락 해제 | 코드 확인 + 수동 확인 |
| REQ-003 | 검색 후 하단 스크롤 추가 로드 정상 동작 | 수동 확인 |
| - | 프론트 빌드/회귀 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. fetch finally 블록에서 page>1 로딩/락 해제를 `active`와 무관하게 보장.
2. page=1 로딩 해제는 기존 active 가드 유지.
3. Docker 검증 후 커밋 및 푸시.

## 6. Rollback Plan
- `AgendaSplitView`의 finally 처리 로직을 이전 상태로 되돌린다.

## 7. Evidence
- `docker exec synchub_frontend npm run build`
- `docker exec synchub_web bash scripts/verify_fast.sh`
