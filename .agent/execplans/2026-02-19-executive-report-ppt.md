# 실행 계획: 경영진 보고용 기획서(PPTX) 생성

## 1. Goal
- 현재 구현된 웹페이지 기능설명, 유형별 프로젝트 시나리오, 실제 화면 캡처를 포함한 경영진 보고용 PPTX를 생성한다.

## 2. Entry Points
- 컨텍스트 추출: `scripts/export_exec_report_context.py`
- 화면 캡처: `scripts/capture_frontend_screenshots.mjs`
- PPT 생성: `scripts/generate_executive_report_ppt.py`
- 라우팅 기준: `frontend/src/App.jsx`
- 출력 경로: `reports/executive/2026-02-19/`

## 3. Files-to-Touch
- `docs/prd/executive-report-ppt-2026-02-19.md`
- `.agent/execplans/2026-02-19-executive-report-ppt.md`
- `scripts/export_exec_report_context.py`
- `scripts/capture_frontend_screenshots.mjs`
- `scripts/generate_executive_report_ppt.py`
- `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| DOC-REQ-001 | 기획의도/AS-IS vs TO-BE 반영 PPT 생성 | `docker exec -w /app synchub_web python3 scripts/generate_executive_report_ppt.py ...` |
| DOC-REQ-002 | 웹페이지 기능 인벤토리 포함 | 생성된 PPT의 인벤토리 슬라이드 확인 |
| DOC-REQ-003 | 유형별 시나리오 포함 | 생성된 PPT의 설비/파츠/AS 시나리오 슬라이드 확인 |
| IMG-REQ-001 | 실제 웹화면 스크린샷 생성 | `docker run ... node scripts/capture_frontend_screenshots.mjs` |
| AUTO-REQ-001 | DB 컨텍스트 JSON 생성 | `docker exec -w /app synchub_web python3 scripts/export_exec_report_context.py` |
| AUTO-REQ-002 | 캡처 매니페스트 생성 | `reports/executive/2026-02-19/screenshots/manifest.json` |
| AUTO-REQ-003 | 최종 PPTX 생성 | `reports/executive/2026-02-19/SyncHub_경영진_기획보고서_2026-02-19.pptx` |
| AC-005 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. PRD/실행계획 문서를 작성한다.
2. DB에서 유형별 대표 프로젝트/지표/페이지 인벤토리를 JSON으로 추출한다.
3. Docker 기반 Playwright로 주요 화면을 자동 캡처한다.
4. 사용자 제공 기획내용 + 컨텍스트 + 캡처 이미지를 조합해 PPTX를 생성한다.
5. 산출물 경로를 정리하고 `verify:fast`를 실행한다.
6. 신규 스크립트/산출 경로를 `docs/repo-map.md`에 반영한다.

## 6. Rollback Plan
- 신규 스크립트와 문서 파일을 제거하면 이전 상태로 복귀된다.
- 산출물(`reports/executive/2026-02-19/*`)은 생성 파일이므로 필요 시 삭제 가능하다.

## 7. Evidence
- `reports/executive/2026-02-19/context.json`
- `reports/executive/2026-02-19/screenshots/*.png`
- `reports/executive/2026-02-19/screenshots/manifest.json`
- `reports/executive/2026-02-19/SyncHub_경영진_기획보고서_2026-02-19.pptx`
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh` 실행 결과
