# 2026-02-16 Data Hub Agenda Code Summary

## 1. Goal
- 데이터 허브(`/data-hub`)에서 안건 코드 검색 시, AI 버튼 클릭으로 Gemini(`gemini-2.5-flash-lite`) 기반 안건 요약을 생성한다.

## 2. Entry Points
- Backend: `app/api/data_hub.py` (`POST /data-hub/ask`)
- Backend(Core): `app/core/data_hub_ai.py` (프롬프트/정규화 유틸)
- Frontend: `frontend/src/pages/DataHub.jsx` (AI 답변 생성 버튼/결과 패널)

## 3. Files-to-Touch
- Modify: `app/api/data_hub.py`
- Modify: `app/core/data_hub_ai.py`
- Modify: `frontend/src/pages/DataHub.jsx`
- Modify/Add: `tests/test_data_hub_ai.py`
- Add: `docs/prd/data-hub-agenda-code-summary-2026-02-16.md`
- Add: `.agent/execplans/2026-02-16-data-hub-agenda-code-summary.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 안건 코드 형식 판별/프롬프트 생성 | `python3 -m unittest tests/test_data_hub_ai.py -v` |
| REQ-002 | 안건 코드 미존재/권한 없음 메시지 | 수동: `/data-hub`에서 코드 입력 후 “AI 답변 생성” |
| REQ-003 | 자연어 질의 기존 RAG 유지 | 수동: `/data-hub` 자연어 질의 후 “AI 답변 생성” |
| REQ-004 | 프론트에서 안건 링크 표시 | 수동: `/data-hub`에서 안건 코드 입력 후 결과 패널 확인 |

## 5. Implementation Steps
1. `app/core/data_hub_ai.py`에 안건 코드 판별(`is_agenda_code`) 및 요약 프롬프트 생성(`build_agenda_summary_prompt`) 추가.
2. `app/api/data_hub.py`의 `/data-hub/ask`에:
   - 안건 코드 형식이면 DB에서 `agenda_code` 정확 매칭 조회
   - 권한 체크 후 Gemini 요약 생성 + 응답 `mode/agenda` 메타 포함
   - 미존재/권한 없음이면 친화 메시지 반환
3. `frontend/src/pages/DataHub.jsx`에서 `mode/agenda` 응답을 처리하고 “안건 요약” 표시 및 상세 링크 제공.
4. Docker 환경에서 `scripts/verify_fast.sh` 실행 및 통과 확인.
5. 커밋 후 `git push` 수행.

## 6. Rollback Plan
- `/data-hub/ask`의 안건 요약 분기를 제거하고 기존 문서 RAG 로직만 유지한다.
- 프론트의 `mode/agenda` 표시 로직을 제거한다.

## 7. Evidence
- `verify_fast` 통과 로그
- 데이터 허브 화면에서 안건 코드 입력 후 “AI 답변 생성” 시 요약 및 링크가 표시되는 스크린샷(선택)

