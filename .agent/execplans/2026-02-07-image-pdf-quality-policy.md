# 1. Goal
이미지/스캔 PDF에서 `pypdf preflight` 조기 통과로 저품질 색인이 발생하지 않도록, OCR worker에서 이미지 PDF 감지 시 preflight를 자동 비활성화한다.

## 2. Entry Points
- `app/ocr_worker.py`
- `docs/session-handover-2026-02-07.md`

## 3. Files-to-Touch
- `app/ocr_worker.py`
- `tests/test_ocr_worker_image_pdf_policy.py`
- `docs/session-handover-2026-02-07.md`
- `AGENTS.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 이미지 PDF 감지 시 preflight 자동 비활성화 | `test_resolve_options_disables_preflight_for_detected_image_pdf ... ok` |
| REQ-002 | 감지 비활성 시 기존 동작 유지 | `test_resolve_options_respects_preflight_when_auto_detection_disabled ... ok` |
| REQ-003 | 실제 OCR 응답에서 preflight 경로 회피 확인 | `/ocr` 호출 결과 `engine=paddleocr-vl` 및 `content_chars` 증가 근거 |

## 5. Implementation Steps
1. OCR worker에 이미지 PDF 감지 유틸과 설정값(env) 추가.
2. 옵션 해석 단계에서 이미지 PDF 감지 시 `use_pypdf_preflight=False` 강제.
3. 단위 테스트 추가로 정책 분기 회귀 방지.
4. Docker 환경에서 검증(`verify:fast`, 실제 OCR 호출 지표) 및 핸드오버 문서 갱신.

## 6. Rollback Plan
1. `git checkout -- app/ocr_worker.py tests/test_ocr_worker_image_pdf_policy.py docs/session-handover-2026-02-07.md AGENTS.md`
2. `docker restart synchub_ocr`로 이전 코드 기준 런타임 복구

## 7. Evidence
- `verify_fast.sh` 통과 로그
- OCR worker `/ocr` 측정 결과(`elapsed_s`, `engine`, `content_chars`, `pages`)
