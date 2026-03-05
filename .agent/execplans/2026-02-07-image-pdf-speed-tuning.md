# 1. Goal
이미지 PDF 품질을 유지하면서 OCR 처리 시간을 단축하기 위해, 이미지 PDF 감지 시 안전한 속도 튜닝(해상도 캡/렌더 강제)을 자동 적용한다.

## 2. Entry Points
- `app/ocr_worker.py`
- `tests/test_ocr_worker_image_pdf_policy.py`
- `docs/session-handover-2026-02-07.md`
- `docs/ocr-test-rules.md`

## 3. Files-to-Touch
- `app/ocr_worker.py`
- `tests/test_ocr_worker_image_pdf_policy.py`
- `docs/ocr-test-rules.md`
- `docs/dev-setup.md`
- `docs/session-handover-2026-02-07.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 이미지 PDF 감지 시 속도 튜닝 파라미터 적용 | `test_resolve_options_applies_speed_tuning_for_detected_image_pdf ... ok` |
| REQ-002 | 튜닝 비활성 시 기존 요청 파라미터 유지 | `test_resolve_options_skips_speed_tuning_when_disabled ... ok` |
| REQ-003 | 품질 유지 전제의 처리 시간 단축 | baseline `66.718s/15742 chars` -> tuned `49.825s/15861 chars` |

## 5. Implementation Steps
1. 이미지 PDF 자동 감지 결과를 옵션 해석 단계에서 재사용한다.
2. 이미지 PDF + paddle 경로에서 속도 튜닝 env를 적용한다.
3. fast mode 강제는 기본 비활성(`false`)로 두어 품질 저하를 방지한다.
4. 테스트/실측 결과를 핸드오버에 반영한다.

## 6. Rollback Plan
1. `git checkout -- app/ocr_worker.py tests/test_ocr_worker_image_pdf_policy.py docs/session-handover-2026-02-07.md`
2. `docker restart synchub_ocr`
3. 이전 기준으로 `/ocr` 실측 재검증

## 7. Evidence
- `docker exec synchub_web_noreload bash -lc 'cd /app && bash scripts/verify_fast.sh'`
- `/ocr` 실측 결과(JSON): baseline vs tuned
