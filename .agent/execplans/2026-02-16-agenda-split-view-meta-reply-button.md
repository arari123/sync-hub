# Execution Plan: Agenda Split View Main Meta + Reply CTA (2026-02-16)

## 1. Goal
- 메인 안건 리스트에서만 프로젝트 코드/이름을 노출한다.
- Split View 우측 상세에서 `답변 작성` 버튼으로 답변 작성 상태의 상세 화면으로 이동한다.

## 2. Entry Points
- `frontend/src/components/agenda/AgendaSplitView.jsx`
- `frontend/src/pages/AgendaDetail.jsx`

## 3. Files-to-Touch
- `frontend/src/components/agenda/AgendaSplitView.jsx`
- `frontend/src/pages/AgendaDetail.jsx`
- `docs/prd/agenda-split-view-meta-reply-button-2026-02-16.md`
- `.agent/execplans/2026-02-16-agenda-split-view-meta-reply-button.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 메인 리스트에 프로젝트 코드/이름 노출 | 수동 확인 |
| REQ-002 | 프로젝트 리스트에 프로젝트 메타 미노출 | 수동 확인 |
| REQ-003 | 우측 상세에 답변 작성 버튼 노출 | 수동 확인 |
| REQ-004 | 버튼 클릭 시 답변폼 열린 상세로 이동 | 수동 확인 |
| - | 프론트 빌드/회귀 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `AgendaSplitView` 리스트 아이템에 `showProjectMeta` prop 추가.
2. `mode=my`에서만 프로젝트 코드/이름 표시.
3. 우측 상세 헤더에 `답변 작성` 버튼 추가.
4. 상세 페이지로 `?reply=1` 이동 처리.
5. `AgendaDetail`에서 `reply=1` 쿼리 감지 시 답변 폼 자동 오픈.
6. Docker 검증 후 커밋/푸시.

## 6. Rollback Plan
- `AgendaSplitView`의 프로젝트 메타 라인과 답변 작성 버튼 제거.
- `AgendaDetail`의 `reply` 쿼리 자동 오픈 로직 제거.

## 7. Evidence
- `docker exec synchub_frontend npm run build`
- `docker exec synchub_web bash scripts/verify_fast.sh`
