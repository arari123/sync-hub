# 1. Goal
`ocr_worker.py` 리팩토링과 OCR 캐시 회귀 이슈 2건을 수정하고, compose 네트워크를 단일화해 `web -> ocr-worker` DNS 실패 재발을 방지한다.

## 2. Entry Points
- `app/ocr_worker.py`
- `docker-compose.yml`
- `docs/session-handover-2026-02-07.md`

## 3. Files-to-Touch
- `app/ocr_worker.py`
- `tests/test_ocr_worker_cache.py`
- `docker-compose.yml`
- `docs/dev-setup.md`
- `.env.example`
- `docs/session-handover-2026-02-07.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 캐시 비활성 시 캐시 키 생성(해시 계산) 미호출 | `docker exec synchub_web_noreload bash -lc 'cd /app && bash scripts/verify_fast.sh'` 내 `test_build_cache_key_skips_builder_when_cache_disabled ... ok` |
| REQ-002 | GLM 프롬프트/디코딩 설정 변경 시 캐시 키 변경 | 동일 검증 로그 내 `test_glm_cache_key_changes_when_prompt_or_decoding_changes ... ok` |
| REQ-003 | web/ocr/paddle 서비스가 동일 네트워크 기준으로 동작 | `docker compose -f docker-compose.yml -f docker-compose.gpu.yml config`에서 `synchub_default` 확인 |

## 5. Implementation Steps
1. `ocr_worker.py`에서 요청 해석/캐시 처리/프로바이더 호출을 함수로 분리해 가독성을 개선한다.
2. 캐시 비활성 경로에서 캐시 키 생성 자체를 건너뛰도록 수정한다.
3. GLM 캐시 키에 `GLM_OCR_PROMPT`, `GLM_OCR_TEMPERATURE`, `GLM_OCR_TOP_P`를 포함한다.
4. 회귀 테스트를 추가하고 Docker 컨테이너에서 `verify:fast`를 실행한다.
5. compose 기본 네트워크 이름을 고정하고 운영 문서/핸드오버를 갱신한다.

## 6. Rollback Plan
1. `git checkout -- app/ocr_worker.py tests/test_ocr_worker_cache.py docker-compose.yml docs/dev-setup.md .env.example docs/session-handover-2026-02-07.md`
2. 이전 compose 설정으로 `docker-compose -f docker-compose.yml -f docker-compose.gpu.yml up -d` 재기동

## 7. Evidence
- `verify_fast.sh` 통과 로그
- compose config 출력 내 `synchub_default`
- 핸드오버 문서 체크리스트/진행 로그 업데이트
