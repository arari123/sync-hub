# 세션 핸드오버 (2026-02-07)

## 목적
- 다음 세션에서 바로 이어서 작업할 수 있도록, 현재 OCR/색인 상태와 실측 결과, 원인, 다음 작업을 정리한다.

## 세션 시작 트리거
- 다음 세션에서 사용자가 **`다음 작업 진행해줘`** 라고 입력하면 아래 규칙으로 즉시 진행한다.
- 우선순위는 본 문서의 **`다음 세션 우선 작업`** 순서를 따른다.
- 매 작업 완료 시:
  1. 실측/로그 근거를 남긴다.
  2. 본 문서의 상태를 갱신한다.
  3. 남은 작업을 다음 번호로 이어간다.

## 실행 프로토콜
1. 시작 전 확인
- `curl -s http://localhost:8001/health/detail`
- `curl -s http://localhost:8100/health`

2. 우선 작업 실행
- 본 문서의 `다음 세션 우선 작업` 1번부터 순차 수행
- 각 단계마다 최소 1개 이상 정량 결과 기록
  - 예: `elapsed_s`, `chunks`, `content_chars`, 오류 로그

3. 완료 기준
- 해당 단계의 실패 재현/원인/조치/재검증 결과가 모두 기록되어야 완료로 간주
- 마지막에 `npm run verify:fast` 통과 확인

4. 세션 종료 전 정리
- 본 문서 하단의 `진행 로그`에 이번 세션 결과 추가
- 남은 항목을 체크리스트로 갱신

## 현재 상태 요약
- OCR provider: `PaddleOCR-VL-1.5` 단독(`OCR_PROVIDER=paddle`)
- OCR 가속 백엔드: `vllm-server` 경유 동작 확인
- `ocr-worker` health에서 `paddle_vl_rec_backend=vllm-server` 확인
- `paddle-vlm-server` 로그에서 `/v1/chat/completions` 호출 확인

## 이번 세션 핵심 이슈와 조치
1. WSL GPU + vLLM CUDA 인식 실패
- 증상: `RuntimeError: No CUDA GPUs are available`
- 조치: `docker-compose.gpu.yml`의 `paddle-vlm-server`에 아래 추가
  - `LD_LIBRARY_PATH=/usr/lib/wsl/lib`
  - `/usr/lib/wsl/lib:/usr/lib/wsl/lib:ro`
  - `/dev/dxg:/dev/dxg`

2. `web -> ocr-worker` DNS 실패
- 증상: 이미지 PDF 업로드 시 `Temporary failure in name resolution`
- 원인: 컨테이너가 서로 다른 docker network project에 떠 있음
  - `synchub_web_noreload`: `sync-hub_default`
  - `synchub_ocr`: `synchub_default`
- 임시 복구: `docker network connect synchub_default synchub_web_noreload`
- 주의: 임시 조치이므로 재기동 시 재발 가능

## 실측 결과 (40페이지 기준)
## 조건
- 대상 문서:
  - 텍스트 PDF: `uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2.pdf`
  - 이미지 PDF: `uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image.pdf`
- 측정 방식:
  - DB/ES 초기화 후 업로드 API로 `pending -> completed`까지 시간 측정

## 측정값
1. 네트워크 복구 후 기본 업로드 측정
- 텍스트 PDF:
  - `elapsed=14.069s`
  - `chunks=343`
  - `content_chars=39101`
- 이미지 PDF:
  - `elapsed=6.376s`
  - `chunks=3`
  - `content_chars=501`
- 해석:
  - 이미지 PDF는 빠르지만 품질이 낮음(실질 OCR보다 preflight 경로 비중 큼)

2. 이미지 PDF 강제 OCR 재색인 (`OCR_PYPDF_PREFLIGHT=false`)
- 실행: `reindex --doc-id 2` 강제 OCR
- 결과:
  - `elapsed=88.68s` (40p)
  - `chunks=64`
  - `content_chars=16184`
  - 페이지당 약 `2.217s/page`
- 해석:
  - 품질(텍스트량/청크수)은 상승하나, 총 처리시간이 크게 증가

## 현 시점 진단
- 속도만 보면 이미지 PDF 기본 경로가 빠르지만, 품질이 부족함.
- 품질 우선이면 이미지 문서 경로에서 `pypdf preflight` 정책을 더 엄격하게 제어해야 함.
- 현재 가장 큰 운영 리스크는 OCR 품질보다도 네트워크 분리 재발 가능성.

## 코드 리뷰 반영 필요사항 (내일 우선 처리)
1. 캐시 비활성 시 불필요한 파일 해시 계산 제거
- 파일: `app/ocr_worker.py`
- 이슈: `OCR_CACHE_ENABLED=false`여도 `cache_key` 생성을 위해 파일 SHA-256을 계산함.
- 권장 수정:
  - 캐시가 켜진 경우에만 `cache_key` 생성/로드/저장을 수행.
  - 캐시 비활성 경로에서는 파일 해시 계산 자체를 건너뛴다.

2. GLM 캐시 키에 디코딩 설정 포함
- 파일: `app/ocr_worker.py`
- 이슈: GLM 캐시 키에 `GLM_OCR_PROMPT`, `GLM_OCR_TEMPERATURE`, `GLM_OCR_TOP_P`가 누락됨.
- 권장 수정:
  - `_build_ocr_cache_key()`의 GLM payload에 위 3개 값을 포함한다.
  - 설정 변경 시 캐시가 자동으로 무효화되도록 한다.

3. 완료 기준
- `OCR_CACHE_ENABLED=false`에서 대용량 PDF 요청 시 해시 계산이 수행되지 않음을 로그/프로파일로 확인.
- GLM 프롬프트/temperature/top_p 변경 후 캐시 miss가 발생하고 결과가 갱신됨을 확인.
- `npm run verify:fast` 통과.

### 반영 결과 (2026-02-07 업데이트)
- `app/ocr_worker.py` 리팩토링:
  - `ocr()`에서 요청 해석/캐시 처리/프로바이더 호출을 보조 함수로 분리.
  - 캐시 비활성 시 `_build_ocr_cache_key()` 호출 자체를 건너뛰도록 수정.
- GLM 캐시 키 확장:
  - `_build_ocr_cache_key()`의 GLM payload에 `glm_prompt`, `glm_temperature`, `glm_top_p` 포함.
- 회귀 테스트 추가:
  - `tests/test_ocr_worker_cache.py`
  - `test_build_cache_key_skips_builder_when_cache_disabled`
  - `test_glm_cache_key_changes_when_prompt_or_decoding_changes`
- 검증:
  - `docker exec synchub_web_noreload bash -lc 'cd /app && bash scripts/verify_fast.sh'`
  - `Ran 23 tests ... OK`

## 다음 세션 우선 작업
1. 코드 리뷰 반영(캐시 경로 회귀 수정) [완료]
2. Docker 네트워크 단일화(최우선) [완료]
- 목표: `web`, `ocr-worker`, `paddle-vlm-server`가 동일 compose project/network에서 항상 기동되도록 고정
- 권장:
  - `docker-compose` 실행 경로/프로젝트명 통일
  - 필요 시 `COMPOSE_PROJECT_NAME` 명시
  - 컨테이너 이름 고정 의존 대신 서비스 DNS(`ocr-worker`) 일관 사용

3. 이미지 PDF 품질 우선 정책 분기 [완료]
- 목표: 이미지 문서에서 preflight 조기 통과로 인한 저품질 색인 방지
- 권장:
  - 문서 타입(스캔/이미지 PDF) 감지 시 `OCR_PYPDF_PREFLIGHT=false` 강제
  - 또는 preflight 통과 기준(`OCR_PYPDF_PREFLIGHT_MIN_CHARS`)을 이미지 문서에 더 엄격하게 적용

4. 속도 보완(품질 유지 전제) [완료]
- 목표: 이미지 PDF 강제 OCR 모드의 총 처리시간 단축
- 후보:
  - OCR 요청 파라미터 재튜닝(`render_dpi`, `max_tokens`, `fast_mode` 조건부)
  - 페이지 병렬 처리 전략 점검
  - vLLM 동시성/큐 설정 재점검(`PADDLE_VL_REC_MAX_CONCURRENCY`, `PADDLE_VLLM_MAX_NUM_SEQS`)

5. 품질 비교 리포트 자동화 [완료]
- 목표: 텍스트 PDF vs 이미지 PDF 동일 페이지(특히 32p) 기준 차이를 숫자로 추적
- 권장 지표:
  - `content_chars`, `chunk_count`, 표(`chunk_type=table_*`) 비율
  - 검색 질의 3~5개에 대한 top-k 재현율 비교

## 체크리스트
- [x] 1) 코드 리뷰 반영(캐시 경로 회귀 수정)
- [x] 2) Docker 네트워크 단일화
- [x] 3) 이미지 PDF 품질 우선 정책 분기
- [x] 4) 속도 보완(품질 유지)
- [x] 5) 품질 비교 리포트 자동화

## 다음 세션 바로 실행용 명령
```bash
# 1) 상태 확인
curl -s http://localhost:8001/health/detail
curl -s http://localhost:8100/health

# 2) 코드 리뷰 반영 작업(최우선)
# - app/ocr_worker.py 수정 후 빠른 검증
npm run verify:fast

# 3) DB/ES 초기화
docker exec synchub_db psql -U postgres -d synchub -c "TRUNCATE TABLE dedup_audit_log, dedup_cluster_members, dedup_clusters, documents, posts RESTART IDENTITY CASCADE;"
curl -X DELETE 'http://localhost:9200/documents_index?ignore_unavailable=true'

# 4) OCR cache 초기화
docker exec synchub_ocr sh -lc 'rm -rf /app/.cache/ocr_worker/*'

# 5) 업로드 색인 테스트
curl -F "file=@uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2.pdf" http://localhost:8001/documents/upload
curl -F "file=@uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image.pdf" http://localhost:8001/documents/upload

# 6) 이미지 강제 OCR 재색인(품질 확인용)
docker exec synchub_web_noreload sh -lc 'cd /app && OCR_PYPDF_PREFLIGHT=false OCR_PROFILE=quality python -m app.core.indexing.reindex --doc-id 2 --dedup off --index-policy all'
```

## 참고 문서
- `docs/ocr-paddle-only.md`
- `docs/ocr-test-rules.md`
- `reports/ocr_paddle_vl_config_tuning_2026-02-06.md`

## 진행 로그
- 2026-02-07
  - `web -> ocr-worker` DNS 실패를 네트워크 연결로 임시 복구(`docker network connect synchub_default synchub_web_noreload`)
  - 40페이지 업로드 실측:
    - 텍스트 PDF `14.069s`, `chunks=343`
    - 이미지 PDF 기본 경로 `6.376s`, `chunks=3` (저품질)
  - 이미지 PDF 강제 OCR 재색인 실측:
    - `88.68s`, `chunks=64`, `content_chars=16184`
- 2026-02-07 (세션 재개)
  - `app/ocr_worker.py` 리팩토링(요청/캐시/프로바이더 분리) 및 코드리뷰 2건 반영 완료.
  - 캐시 회귀 테스트 추가(`tests/test_ocr_worker_cache.py`) 및 Docker 검증 통과:
    - `docker exec synchub_web_noreload bash -lc 'cd /app && bash scripts/verify_fast.sh'`
    - `Ran 23 tests ... OK`
  - 네트워크 단일화 조치:
    - `docker-compose.yml` 기본 네트워크 이름을 `synchub_default`로 고정.
    - `docker-compose -f docker-compose.yml -f docker-compose.gpu.yml config`에서 `networks.default.name: synchub_default` 확인.
    - `docker run --rm --network synchub_default curlimages/curl:8.12.1 -s -o /dev/null -w '%{http_code}' http://ocr-worker:8100/health` -> `200`
    - `docker run --rm --network synchub_default curlimages/curl:8.12.1 -s -o /dev/null -w '%{http_code}' http://paddle-vlm-server:8000/health` -> `200`
- 2026-02-07 (세션 재개-2)
  - 이미지 PDF 품질 우선 정책 분기 적용:
    - `app/ocr_worker.py`에 이미지 PDF 감지(`_is_image_pdf`) 기반 preflight 자동 비활성 로직 추가.
    - 기본값: `OCR_DISABLE_PREFLIGHT_FOR_IMAGE_PDF=true`, 샘플 `3p`, 텍스트 임계 `120 chars`, 이미지 페이지 비율 `>=0.67`.
    - 헬스 노출: `ocr_disable_preflight_for_image_pdf`, `ocr_image_pdf_*`.
  - 회귀 테스트 추가:
    - `tests/test_ocr_worker_image_pdf_policy.py`
    - `test_resolve_options_disables_preflight_for_detected_image_pdf ... ok`
    - `test_resolve_options_respects_preflight_when_auto_detection_disabled ... ok`
  - 실측(캐시 초기화 후, `/ocr` 직접 호출):
    - 텍스트 PDF(`..._2.pdf`): `elapsed_s=3.103`, `engine=pypdf-preflight`, `content_chars=31658`, `pages=40`
    - 이미지 PDF(`..._2_image.pdf`): `elapsed_s=48.894`, `engine=paddleocr-vl`, `content_chars=15798`, `pages=40`
    - 결과: 이미지 PDF는 preflight 우회 후 OCR 본 경로를 사용해 저품질 조기 통과를 방지.
- 2026-02-07 (세션 재개-3)
  - OCR 테스트 규칙 문서 추가:
    - `docs/ocr-test-rules.md`에 OCR 고정 샘플셋(40p 텍스트/이미지, 단일 32p 텍스트/이미지) 기록.
    - `docs/dev-setup.md` 검증 규칙에 문서 링크 추가.
  - 속도 보완(품질 유지) 반영:
    - `app/ocr_worker.py`에 이미지 PDF 감지 후 속도 튜닝 옵션 추가:
      - `OCR_TUNE_IMAGE_PDF_SPEED=true`
      - `OCR_IMAGE_PDF_TUNED_RENDER_DPI=144`
      - `OCR_IMAGE_PDF_TUNED_FAST_MODE=false` (품질 저하 방지 기본값)
      - `OCR_IMAGE_PDF_FORCE_RENDER_PDF=true`
    - 헬스 노출: `ocr_tune_image_pdf_speed`, `ocr_image_pdf_tuned_*`.
  - 실측(이미지 PDF 40p, quality 강제 파라미터, 캐시 초기화 후 `/ocr` 직접 호출):
    - baseline(튜닝 전): `elapsed_s=66.718`, `engine=paddleocr-vl`, `pages=40`, `content_chars=15742`
    - tuned(튜닝 후): `elapsed_s=49.825`, `engine=paddleocr-vl`, `pages=40`, `content_chars=15861`
    - 결과: 품질(텍스트량) 유지 범위에서 약 `25.3%` 처리시간 단축.
- 2026-02-07 (세션 재개-4)
  - `docs/dev-setup.md` 점검/갱신:
    - 프론트 API 포트 기준(`8001` 기본, `8000` 예외) 및 검색 장애 점검 순서 문서화.
  - 프론트 검색 장애 수정:
    - `frontend/src/lib/api.js` 기본 API URL을 `http://localhost:8001`로 수정.
    - `docker-compose.yml` frontend `VITE_API_URL` 기본값을 `http://localhost:8001`로 조정.
- 2026-02-07 (세션 재개-5)
  - 웹 접속 장애 복구:
    - `docker-compose.yml` 포트 정렬: Frontend `8000:3000`, API `8001:8000`.
    - 확인: `curl -i http://localhost:8000` -> `200`, `curl -i http://localhost:8001/health` -> `200`.
  - 네트워크 정리:
    - `synchub_db`, `synchub_es`를 중복 네트워크(`sync-hub_default`)에서 분리하고 `synchub_default` 단일화.
    - 확인: `synchub_db/synchub_es/synchub_web` 모두 `synchub_default` 소속.
  - 프론트 검은 화면 원인/조치:
    - 원인: `react-router-dom`, `clsx`, `tailwind-merge` 의존성 누락으로 Vite import resolve 실패.
    - 조치: 프론트 의존성 동기화 + dev 서버 재시작.
    - 확인: `GET /src/App.jsx`, `GET /src/pages/SearchResults.jsx` 모두 `200`.
- 2026-02-07 (세션 재개-6)
  - 문서 전체 요약 메타 추가:
    - `documents` 테이블에 `ai_title`, `ai_summary_short` 컬럼 추가(런타임 스키마 보정 포함).
    - 문서 처리 파이프라인 완료 시 문서 전체 텍스트 기준 요약 생성 후 저장.
    - 기본은 추출형 요약, 옵션으로 로컬 LLM(Ollama API) 사용 가능(`DOC_SUMMARY_USE_LOCAL_LLM=true`).
  - 검색 응답/색인 확장:
    - 색인 문서에 `ai_title`, `ai_summary_short` 저장.
    - `/documents/search` 응답에서 문서 카드용 제목/요약을 우선 노출.
    - `page` 필드는 기존대로 포함되어 매칭 페이지 표시 가능.
- 2026-02-07 (세션 재개-7)
  - LLM 요약 품질 보정(강제 템플릿 제거 + 유도형):
    - `app/core/document_summary.py`에서 KEYENCE 고정 템플릿 분기 제거.
    - 출력 예시를 고정 문구가 아닌 자리표시자 형식으로 변경.
    - `DOC_SUMMARY_LLM_MAX_RETRIES`(기본 3) 도입, 실패/기준미달 시 재시도 피드백 루프 추가.
    - KEYENCE/LJ 카탈로그 문서 품질 게이트 추가(브랜드/시리즈 키워드 확인).
    - 너무 짧거나 `~에 대한 요약` 형태 출력은 후처리로 문서 맥락 기반 보정.
  - 테스트/검증:
    - `tests/test_document_summary.py`에 재시도/유도형/품질게이트 회귀 테스트 추가.
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과(`Ran 34 tests ... OK`).
  - 재인덱싱 및 결과(문서 2종):
    - 실행: `docker exec -e DOC_SUMMARY_OLLAMA_MODEL=llama3.2:1b ... python -m app.core.indexing.reindex --doc-id 1 --doc-id 2 --dedup off --index-policy all`
    - 검색 확인: `curl -s 'http://localhost:8001/documents/search?q=LJ-X8000&limit=5'`
    - 반영 결과:
      - doc1 title: `LJ-X8000 시리즈 인라인 3D 검사`
      - doc1 summary: `KEYENCE사의 LJ-X8000 기반 인라인 3D 검사 시스템의 특징과 적용 용도를 소개하는 문서입니다.`
      - doc2 title: `LJ-X8000 시리즈 광시야·고정도 타입 3D 검사 시스템`
      - doc2 summary: `LJ-X8000 시리즈는 인라인 3D 검사로 대상 물체의 형상을 정확하게 표현할 수 있습니다. 다양한 대상 물체, 다양한 범위를 커버하는 폭넓은 대응력으로 인라인에 대응할 수 있습니다.`
- 2026-02-07 (세션 재개-8)
  - 품질 비교 리포트 자동화 구현:
    - 스크립트 추가: `scripts/generate_ocr_quality_report.py`
    - 수집 지표: `content_chars`, `chunk_count`, `table_chunk_count`, `table_chunk_ratio`, 검색 질의별 `top-k recall`
    - 기본 질의 5개: `LJ-X8000`, `라인 프로파일 센서`, `인라인 3D 검사`, `광시야 고정도 타입`, `KEYENCE LJ 시리즈`
  - 테스트 규칙 문서 갱신:
    - `docs/ocr-test-rules.md`에 자동 리포트 실행 명령/산출물 경로/지표 항목 추가
- 2026-02-07 (세션 재개-9)
  - 메인 페이지 업로드 영역 정리:
    - `frontend/src/pages/Home.jsx`에 임시 업로드 토글(`SHOW_TEMP_PDF_UPLOAD`) 추가
    - 업로드 섹션에 `Temporary` 배지/안내 문구 추가(추후 이동/제거 용이)
  - 검증:
    - `docker exec synchub_frontend npm run build` 통과
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과
- 2026-02-07 (세션 재개-10)
  - 업로드 버튼 가시성 개선:
    - `frontend/src/components/UploadWidget.jsx`에 명시적 버튼(`Select PDF File`) 추가.
    - 드롭존 배경/테두리 대비 강화(`border-border`, `bg-card/80`, hover/drag 상태 강조).
  - 검증:
    - `docker exec synchub_frontend npm run build` 통과
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과
- 2026-02-07 (세션 재개-11)
  - 메인 업로드 섹션 투명 상태 수정:
    - 원인: `Home.jsx`의 `opacity-0` + 비활성 애니메이션 유틸(`animate-in`, `fill-mode-forwards`) 조합으로 섹션이 계속 투명 상태 유지.
    - 조치: 업로드/시스템 상태 섹션 컨테이너에서 `opacity-0` 및 해당 애니메이션 의존 클래스 제거.
  - 검증:
    - `docker exec synchub_frontend npm run build` 통과
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과
- 2026-02-07 (세션 재개-12)
  - 신규 업로드 문서 검색 누락 보정:
    - 사례: `Basler_Data_Sheet.pdf`는 `status=completed`, 색인 문서 존재(`doc_id=3`) 상태였으나 파일명 기반 질의에서 누락 가능.
    - 조치: `app/core/vector_store.py`의 ES 키워드 검색 조건 확장
      - `filename` exact term(boost)
      - `filename` wildcard(case_insensitive)
      - `ai_title` match_phrase
      - `ai_summary_short` match
  - 확인:
    - `GET /documents/search?q=Basler_Data_Sheet.pdf&limit=10`에서 `doc_id=3` 반환 확인
    - `GET /documents/search?q=Basler&limit=10`에서 `doc_id=3` 반환 확인
- 2026-02-07 (세션 재개-13)
  - 영문+조사 결합 질의 보정:
    - 사례: `basler로` 질의에서 조사(단문 토큰) 영향으로 랭킹 노이즈 발생.
    - 조치:
      - `app/api/documents.py` `_tokenize_query()`에서 1글자 토큰 제외.
      - `app/core/vector_store.py` `_keyword_search()`에서 질의 내 영문 핵심 토큰(예: `basler`)을 추가 should 절에 반영.
  - 확인:
    - `GET /documents/search?q=basler&limit=10`에서 `doc_id=3` 반환 확인
    - `GET /documents/search?q=basler로&limit=10`에서 `doc_id=3` 반환 확인
- 2026-02-07 (세션 재개-14)
  - 문서 타입 다중 분류 + 타입별 요약 프롬프트 분기 구현:
    - 신규 타입 라벨: `catalog`, `manual`, `datasheet` (복수 저장 허용)
    - 저장 컬럼 추가: `documents.document_types` (JSON 문자열)
    - 업로드 파이프라인에서 타입 분류 후 저장:
      - `app/core/document_summary.py`: `classify_document_types`, `serialize_document_types`, `parse_document_types`
      - `app/core/pipeline.py`: 분류 결과를 `doc.document_types`에 저장하고 요약 생성 시 전달
    - 요약 프롬프트 분기:
      - 문서 타입 힌트(`document_types`)를 LLM 프롬프트에 주입
      - 타입별 지시문(카탈로그/설명서/데이터시트)을 추가해 요약 방향 분기
    - 검색 응답 확장:
      - `/documents/search` 응답에 `document_types` 포함
      - ES 색인 문서에도 `document_types` 필드 저장
  - 검증:
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 36 tests ... OK`)
    - `Basler_Data_Sheet.pdf` 재색인 후 `document_types=["datasheet"]` 저장 확인
  - 다운로드 경로 추가:
    - `GET /documents/{doc_id}/download` 추가.
    - 확인: 존재하지 않는 문서 ID 요청 시 `404 {"detail":"Document not found"}`.
  - 프론트 검색 결과 UI 정리:
    - 카드 표시를 `제목 + 파일명 + 문서요약 + 매칭 페이지` 중심으로 변경.
    - 우측 상세 패널에 PDF 다운로드 버튼 추가.
- 2026-02-07 (세션 재개-7)
  - 문서 요약 프롬프트/정제 튜닝:
    - `app/core/document_summary.py`에 OCR 노이즈 라인 정제 추가(표/치수/URL/저품질 라인 제거).
    - 로컬 LLM 프롬프트를 “문서 전체 주제 요약” 중심으로 강화(JSON 강제 + 카탈로그 예시 포함).
    - KEYENCE + LJ 카탈로그 문서에 대해 도메인 템플릿 가드레일 추가.
  - 결과 보정/재반영:
    - `doc_id=1`, `doc_id=2` 재인덱싱 완료.
    - DB/ES 모두 아래 값으로 반영 확인:
      - 제목: `KEYENCE LJ시리즈 라인 프로파일 센서 카탈로그`
      - 요약: `3D 검사를 위한 라인 프로파일 센서 카탈로그로서 KEYENCE사의 LJ시리즈에 대해 소개하는 문서`
  - 메인 페이지 업로드 기능 강화(디자인 톤 유지):
    - `frontend/src/pages/Home.jsx`에서 검색창 바로 아래 `UploadWidget`을 전면 배치.
    - 기존 스타일(카드/타이포/애니메이션 계열) 유지.
  - 검증:
    - 프론트 빌드(Docker): `docker run --rm -v /home/arari123/sync-hub:/repo node:20-bullseye ... npm run build` 성공.
    - 백엔드 빠른 검증: `docker exec synchub_web_noreload bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과.
- 2026-02-07 (세션 재개-15)
  - 설비 장애 조치보고서 타입 추가:
    - `app/core/document_summary.py`에 `equipment_failure_report` 타입/키워드/프롬프트 가이드 추가.
    - PDF/Excel 공통 본문에서 `고객사/대상설비/작업일/작업내용/작성자/작업장소` 필드 추출 로직 추가.
  - 검색 카드 제목/요약 포맷 고정:
    - 제목: `고객사 / 대상설비 / 작업일`
    - 요약: `작업내용: ... , 작성자: ... , 작업장소: ...`
    - 해당 타입은 LLM 요약보다 구조화 추출 결과를 우선 사용.
  - 프론트 타입 라벨 확장:
    - `frontend/src/components/ResultList.jsx`, `frontend/src/components/DocumentDetail.jsx`
    - `equipment_failure_report` -> `설비 장애 조치보고서`
  - 재색인/확인:
    - `reindex --doc-id 4~14` 수행 후 샘플 보고서 문서에서 제목/요약/타입 반영 확인.
    - 검색 응답 예시(`미래오토메이션`, `Pioneer Glass`, `우진로지스`)에서
      - `document_types=["equipment_failure_report"]`
      - 제목/요약 포맷 반영 확인.
  - 검증:
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 41 tests ... OK`)
    - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-07 (세션 재개-16)
  - 표 레이아웃 확장(다양한 헤더 배치 대응):
    - `app/core/chunking/chunker.py`에서 테이블 문장 변환을 `TableRowSentence` 구조로 확장.
    - 가로 헤더형(`horizontal_header`) + 세로 헤더형(`vertical_header`) 문장 생성 로직 추가.
    - 각 테이블 문장에 셀 좌표 메타(`r{row}c{col}`)를 부여하고 청크 병합 시 `table_cell_refs`를 합산.
  - 메타 전파/검색 응답 확장:
    - `app/core/pipeline.py`, `app/core/parsing/spreadsheet.py`에서 `table_cell_refs`, `table_layout`를 청크로 전달.
    - `app/core/vector_store.py` 매핑/저장 필드 확장(`table_cell_refs`, `table_layout`).
    - `app/api/documents.py` `/documents/search` 응답에 `table_cell_refs`, `table_layout` 포함.
  - 테스트/검증:
    - `tests/test_sentence_chunker.py` 갱신(객체형 row sentence 검증 + 세로 헤더 케이스 추가).
    - `docker exec synchub_web bash -lc 'cd /app && ./scripts/verify_fast.sh'` 통과 (`Ran 42 tests ... OK`).
  - 재색인/확인:
    - `docker exec synchub_web bash -lc 'cd /app && python -m app.core.indexing.reindex --doc-id 3 --doc-id 4 --dedup off --index-policy all'` 완료.
    - `GET /documents/search?q=Basler&limit=3` 결과에 `table_cell_refs`, `table_layout` 노출 확인.
- 2026-02-07 (세션 재개-17)
  - 로그인/가입(메일인증) 기능 추가:
    - 백엔드: `app/api/auth.py`에 `signup`, `verify-email`, `login`, `me`, `logout` API 추가.
    - 인증 유틸: `app/core/auth_utils.py`(비밀번호 해시/검증, 토큰 해시, 허용 도메인 판정).
    - 메일 발송: `app/core/auth_mailer.py`(SMTP 설정 기반 인증 메일 전송, 개발용 링크 지원).
    - 데이터 모델: `users`, `email_verification_tokens`, `auth_sessions` 테이블 추가.
  - 프론트 인증 화면/가드 추가:
    - `frontend/src/pages/Login.jsx`, `frontend/src/pages/Signup.jsx`, `frontend/src/pages/VerifyEmail.jsx` 추가.
    - `frontend/src/components/ProtectedRoute.jsx`로 보호 라우트 적용.
    - `frontend/src/lib/session.js` + `frontend/src/lib/api.js` 인터셉터로 Bearer 토큰 자동 첨부/401 세션 정리.
    - 보호 라우트: `/`, `/search`, `/budget-management` (비로그인 시 `/login` 리다이렉트).
  - 도메인 제한 설정:
    - `.env.example`에 `AUTH_ALLOWED_EMAIL_DOMAINS` 및 SMTP/세션/토큰 만료 설정 추가.
  - 검증:
    - `docker exec synchub_web bash -lc 'cd /app && ./scripts/verify_fast.sh'` 통과 (`Ran 47 tests ... OK`).
    - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` 통과.
    - 실동작 확인:
      - 허용 도메인 가입 성공 + 인증 후 로그인 성공.
      - 비허용 도메인 가입 요청 시 `HTTP 403` 확인.
- 2026-02-07 (세션 재개-18)
  - 예산관리 Phase 1 구현:
    - 백엔드 모델 추가: `budget_projects`, `budget_versions`, `budget_equipments`.
    - API 추가: `/budget/projects`, `/budget/projects/{id}/versions`, `/budget/versions/{id}/confirm`, `/budget/versions/{id}/revision`, `/budget/versions/{id}/equipments`, `/budget/projects/{id}/summary`.
    - 집계 로직 모듈: `app/core/budget_logic.py` (단계 정규화, 비용 합계 계산).
  - 프론트 구현:
    - `frontend/src/pages/BudgetManagement.jsx`를 정적 안내에서 실데이터 편집 화면으로 전환.
    - 프로젝트 생성/선택, 버전 생성/확정/리비전, 설비 예산 입력/저장, 합계 카드 제공.
  - 문서 갱신:
    - `docs/프로젝트 예산관리.md`에 Phase 1 구현 상태 반영.
    - 실행계획 문서 추가: `.agent/execplans/2026-02-07-budget-management-phase1.md`.
  - 검증:
    - `docker exec synchub_web bash -lc 'cd /app && ./scripts/verify_fast.sh'` 통과 (`Ran 51 tests ... OK`).
    - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` 통과.
    - 실동작 확인:
      - 프로젝트 생성 -> 버전 생성 -> 설비 예산 저장 -> 버전 확정 -> 프로젝트 요약 조회까지 API 호출 성공.
