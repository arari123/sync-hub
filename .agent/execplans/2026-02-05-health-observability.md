# Execution Plan: Health Observability Upgrade

## 1. Goal
운영 시 장애 지점을 빠르게 파악할 수 있도록 API health를 의존성(DB/ES/OCR) 단위로 확장하고 verify 체크를 강화한다.

## 2. Entry Points
- Health API: `GET /health`, `GET /health/detail`
- Verify script: `scripts/verify.sh`
- Core adapters: `app/core/vector_store.py`, `app/core/ocr.py`

## 3. Files-to-Touch
- `app/main.py`: 상세 health 엔드포인트 추가.
- `app/core/vector_store.py`: ES 상태 스냅샷 함수 추가.
- `app/core/ocr.py`: OCR 워커 health 조회 함수 추가.
- `scripts/verify.sh`: 상세 health/Nori analyzer 검증 추가.
- `docs/repo-map.md`: 신규 엔드포인트 반영.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| OBS-001 | 상세 health에서 DB/ES/OCR 상태 노출 | `GET /health/detail` |
| OBS-002 | verify에서 Nori analyzer 동작 확인 | `POST /_analyze` |
| OBS-003 | verify 전체 통과 | `npm run verify` |

## 5. Implementation Steps
1. DB ping + ES/OCR 상태 조회 로직을 health endpoint에 연결.
2. verify.sh에 상세 health 체크와 Nori 분석기 테스트 추가.
3. 실행 검증 후 증적을 계획 문서에 기록.

## 6. Rollback Plan
1. `app/main.py`에서 `GET /health/detail` 제거.
2. `scripts/verify.sh`를 기존 단순 health 체크 버전으로 복원.

## 7. Evidence
- `npm run verify:fast` -> `Syntax check passed for 12 files.`
- `npm run verify` 통과:
  - `GET /health` -> `{"status":"healthy"}`
  - `GET /health/detail` -> `db/elasticsearch/ocr_worker` 상태 JSON 반환, required dependency healthy
  - `POST /_analyze` (`nori_tokenizer`) -> `tokens` 반환 (`Nori tokens: 6`)
