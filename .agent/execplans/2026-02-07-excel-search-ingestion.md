# 1. Goal
Excel 문서를 검색 대상에 포함하고, 테스트용 Excel 보고서 10종을 생성해 실제 업로드/검색 검증까지 완료한다.

## 2. Entry Points
- `app/api/documents.py`
- `app/core/pipeline.py`
- `app/core/parsing/spreadsheet.py` (new)
- `frontend/src/components/UploadWidget.jsx`
- `scripts/generate_excel_test_reports.py` (new)
- `docs/ocr-test-rules.md`

## 3. Files-to-Touch
- `docs/prd/excel-search.md` (new)
- `.agent/execplans/2026-02-07-excel-search-ingestion.md` (new)
- `requirements.txt`
- `app/api/documents.py`
- `app/core/pipeline.py`
- `app/core/parsing/spreadsheet.py` (new)
- `frontend/src/components/UploadWidget.jsx`
- `scripts/generate_excel_test_reports.py` (new)
- `docs/ocr-test-rules.md`
- `docs/repo-map.md`
- `tests/test_spreadsheet_parsing.py` (new)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| EX-REQ-001 | Excel 업로드 허용 | `curl -F file=@...xlsx /documents/upload` -> `{"status":"pending"}` |
| EX-REQ-002 | Excel 파싱/인덱싱 | 업로드 후 `GET /documents/{id}` -> `status=completed`, `content_text` 존재 |
| EX-REQ-003 | Excel 검색/프론트 업로드 허용 | `/documents/search?q=...` 결과 + `frontend build` |
| EX-REQ-004 | 테스트 문서 10종 생성/검증 | 생성 스크립트 출력 + 검색 결과 로그 기록 |

## 5. Implementation Steps
1. Excel 요구사항 PRD/실행계획 문서를 추가한다.
2. 백엔드 파이프라인에 Excel 추출 경로를 추가하고 업로드 확장자를 정리한다.
3. 프론트 업로드 위젯을 PDF+Excel 업로드로 확장한다.
4. 테스트용 Excel 보고서 10종 생성 스크립트를 추가하고 샘플 파일을 생성한다.
5. Docker 환경에서 업로드/검색 실측 테스트를 수행하고 문서에 결과를 기록한다.
6. `verify:fast` 통과 후 커밋/푸시한다.

## 6. Rollback Plan
1. `app/core/parsing/spreadsheet.py` 및 스크립트/테스트 신규 파일 제거.
2. `app/core/pipeline.py`, `app/api/documents.py`, `frontend/src/components/UploadWidget.jsx`를 이전 커밋으로 복원.
3. 생성된 샘플 xlsx 파일 삭제.

## 7. Evidence
- `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
- `docker exec synchub_frontend sh -lc 'cd /app && npm run build'`
- `curl /documents/upload`, `curl /documents/search` 실측 결과
