# PDF Reflow + Sentence Chunking 운영 가이드

## 1) 목적
- 2단/병렬 PDF 레이아웃에서 잘못된 가로 결합을 방지한다.
- 문장 경계 기반 청킹으로 문장 중간 잘림을 줄인다.
- 표를 본문과 분리해 `table_raw`, `table_row_sentence` 청크로 저장한다.
- 검색 디버그 API로 BM25/벡터 산발 원인을 추적한다.

## 2) 주요 경로
- 파이프라인: `app/core/pipeline.py`
- 리플로우: `app/core/parsing/reflow.py`
- 클린업: `app/core/parsing/cleaning.py`
- 문장 분리: `app/core/chunking/sentence_splitter.py`
- 청킹: `app/core/chunking/chunker.py`
- 재색인 CLI: `app/core/indexing/reindex.py`
- 디버그 API: `GET /api/admin/search_debug`

## 3) 설정값(Environment)
- `LINE_Y_TOL`: 같은 줄(y) 판단 오차. 기본 `8.0`
- `GUTTER_GAP_THRESHOLD`: 컬럼 간 gutter 최소 비율(페이지 폭 대비). 기본 `0.12`
- `INLINE_GAP_RATIO`: 같은 컬럼 내 가로 병합 허용 간격 비율. 기본 `0.03`
- `PARALLEL_MIN_ROWS`: 병렬 컬럼 판단 최소 매칭 행 수. 기본 `4`
- `PARALLEL_MATCH_RATIO`: 병렬 컬럼 매칭 비율 임계값. 기본 `0.72`
- `MAX_CHARS`: sentence-aware chunk 최대 길이(문자 기준). 기본 `900`
- `OVERLAP_SENTENCES`: 다음 청크로 넘기는 겹침 문장 수. 기본 `1`
- `MIN_CHUNK_CHARS`: 본문 최소 청크 길이. 기본 `50`
- `NOISE_THRESHOLD`: 본문 청크 최소 quality score 임계값. 기본 `0.28`
- `DEDUP_IDENTICAL_CHUNKS`: 문서 내부 완전 동일 청크를 1회만 유지할지 여부. 기본 `true`
- `DEDUP_IDENTICAL_CHUNKS_MIN_CHARS`: 이 길이 이상 청크에만 전역 중복 제거 적용. 기본 `40`
- `MAX_CHUNKS_PER_DOC`: 문서당 최대 청크 수 상한(초과 시 균등 샘플링). 기본 `400`
- `TABLE_ROW_SENTENCE_MAX_PER_TABLE`: 표 1개에서 `table_row_sentence`로 유지할 최대 행 수(초과 시 앞/뒤 중심으로 축약). 기본 `240`
- `TABLE_ROW_SENTENCE_MERGE_SIZE`: `table_row_sentence`를 N행씩 병합해 청크 수를 줄이는 설정. 기본 `3`
- `CHUNK_SCHEMA_VERSION`: 청크 스키마 버전 라벨. 기본 `v2_reflow_sentence_table`
- `EMBEDDING_MODEL_NAME`, `EMBEDDING_MODEL_VERSION`: 임베딩 모델 메타 정보.
- `OCR_MAX_PAGES`, `OCR_RENDER_DPI`: OCR 워커 요청 페이지/해상도 상한.
- 페이지 상한값이 `0`이면 전체 페이지(무제한)로 처리한다.
- `OCR_PROFILE`: `speed|balanced|quality` 요청 프로파일. 기본 `balanced`.
  - `speed`: `OCR_SPEED_*` 사용(속도 우선)
  - `quality`: `OCR_QUALITY_*` 사용(정확도 우선)
  - `balanced`: 기존 `OCR_MAX_PAGES`, `OCR_RENDER_DPI`, `OCR_FAST_MODE` 사용
- `OCR_FAST_MODE`: OCR fast pass 활성화 여부. 기본 `true`
- `PADDLE_FAST_FIRST_PAGES`, `PADDLE_FAST_RENDER_DPI`, `PADDLE_FAST_MIN_TEXT_CHARS`: Paddle OCR fast pass 튜닝값
- `PADDLE_SKIP_PDF_OCR_ON_CPU`: CPU 환경에서 무거운 Paddle PDF OCR 건너뛰기(속도 우선). 기본 `true`
- `OCR_PROVIDER=glm`일 때:
  - 로컬 배포는 `SGLang` 기준으로 고정한다.
  - `docker-compose.gpu.yml`의 `sglang` 서비스는 `Dockerfile.sglang` 커스텀 이미지로 기동한다.
  - 커스텀 이미지 단계에서 `transformers`를 사전 설치해 재시작 시 `pip install` 지연을 제거한다.
  - `GLM_OCR_ENDPOINT`: `http://sglang:8080/v1/chat/completions`
  - `GLM_OCR_MODE`: `openai-chat`
  - `GLM_OCR_MODEL`: `glm-ocr` (SGLang `--served-model-name`와 동일)
  - `GLM_MAX_PAGES`: 기본 `0` (전체 페이지 처리, 무제한)
  - `GLM_RENDER_DPI`: 기본 `180`
  - GLM 단독 모드로 동작하며 Paddle Lite fallback은 사용하지 않는다.
  - `GLM_OCR_ENDPOINT` 미설정 또는 GLM 호출 실패 시 OCR 응답은 실패로 반환된다.
  - WSL GPU 사용 시: `/usr/lib/wsl/lib` 마운트 + `/dev/dxg` 디바이스가 필요
  - GPU 런타임 변수: `CUDA_VISIBLE_DEVICES`, `NVIDIA_VISIBLE_DEVICES`, `NVIDIA_DRIVER_CAPABILITIES`
  - SGLang 첫 기동 시 `transformers`/모델 다운로드로 초기 지연이 길 수 있다(웜업 이후 단축).

## 4) 디버그 API
- 엔드포인트: `GET /api/admin/search_debug?q=<query>&limit=10`
- 응답 핵심 필드:
  - `request_id`
  - `original_query`, `rewritten_query`
  - `vector_topk[]`: `score`, `doc_id`, `page`, `chunk_id`, `chunk_type`, `preview`
  - `bm25_topk[]`: 동일 구조
  - `fused_topk[]`: RRF 융합 결과

## 5) 재색인 CLI
1. DB 문서 dry-run:
```bash
python3 -m app.core.indexing.reindex --dry-run --limit 5
```

2. DB 문서 실제 재색인:
```bash
python3 -m app.core.indexing.reindex --limit 20
```

3. 단일 파일 dry-run(의존성/DB 없이):
```bash
python3 -m app.core.indexing.reindex --dry-run --file-path uploads/sample.pdf --filename sample.pdf
```

## 6) 청크 타입
- `paragraph`
- `parallel_columns_left`
- `parallel_columns_right`
- `table_raw`
- `table_row_sentence`

## 7) 검증
```bash
npm run verify:fast
python3 -m unittest discover -s tests -p 'test_*.py' -v
```
