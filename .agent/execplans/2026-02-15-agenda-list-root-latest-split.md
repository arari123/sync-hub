# 실행 계획: 안건 리스트 최초/최신 답변 2분할 카드 (2026-02-15)

## 1. Goal
- 답변이 등록된 일반 안건을 리스트 카드에서 좌/우 50:50으로 분할해 “최초 등록”과 “최신 답변”을 동시에 표시한다.

## 2. Entry Points
- 백엔드 목록 직렬화: `app/api/agenda.py`
- 프론트 안건 리스트 UI: `frontend/src/pages/AgendaList.jsx`

## 3. Files-to-Touch
- `app/api/agenda.py`
- `frontend/src/pages/AgendaList.jsx`
- `docs/prd/agenda-list-root-latest-split-2026-02-15.md`
- `.agent/execplans/2026-02-15-agenda-list-root-latest-split.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 답변(`reply_count > 0`)이 있는 일반 안건이 카드 2분할로 표시되는지 확인 | 수동 확인 + `docker exec -w /app synchub_frontend npm run build` |
| REQ-002 | 좌 패널에 작성자/요청자/답변자(최초) 표시 확인 | 수동 확인 |
| REQ-003 | 우 패널에 작성자(최신)/답변자(최신) 표시 확인 | 수동 확인 |
| REQ-004 | 라벨/배경/구분선으로 패널 구분이 명확한지 확인 | 수동 확인 |
| - | 리그레션(린트/빌드/기본 테스트) | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `GET /agenda/projects/{project_id}/threads`의 아이템에 `root_summary_plain`, `latest_summary_plain`, `root_responder_*` 필드를 추가한다.
2. `frontend/src/pages/AgendaList.jsx`의 카드 컴포넌트를 수정해, 답변이 있는 일반 안건은 2패널(50:50) 레이아웃으로 렌더링한다.
3. 라벨/배경/구분선을 적용해 좌/우 패널이 명확히 구분되도록 디자인을 정리한다.
4. Docker 환경에서 `verify_fast` 및 프론트 빌드를 실행해 검증한다.

## 6. Rollback Plan
- 해당 커밋을 `git revert <commit>`로 되돌린다.

## 7. Evidence
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh` 통과 로그
- `docker exec -w /app synchub_frontend npm run build` 성공 로그

