# 개발 환경 설정 (Docker 100% 종속)

## 0) 빠른 시작
- 세션 시작/복구는 `bash scripts/start_localhost.sh` 사용을 권장한다.
- 상세 절차와 오류 복구는 `docs/localhost-startup.md`를 따른다.

## 1) 원칙
- 이 프로젝트는 **개발/실행/테스트/검증 전 과정이 Docker 전용**이다.
- 비도커(호스트 직접 실행) 경로는 지원하지 않는다.

## 2) 표준 실행 규칙
1. 항상 저장소 루트(`/home/arari123/sync-hub`)에서 실행한다.
2. Compose 프로젝트명을 고정한다.
   - `export COMPOSE_PROJECT_NAME=synchub`
3. GPU OCR 포함 표준 기동 명령을 사용한다.
   - `docker-compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`
4. 프론트엔드 API 대상 포트를 실행 환경과 일치시킨다.
   - 기본값: `VITE_API_URL=http://localhost:8001`
   - 포트 기준: Frontend `8000`, API `8001`

## 3) 필수 서비스
- `synchub_db` (PostgreSQL)
- `synchub_es` (Elasticsearch)
- `synchub_ocr` (OCR Worker)
- `synchub_paddle_vlm` (PaddleOCR-VL vLLM 가속 서버)
- `synchub_web` (API)
- `synchub_frontend` (웹 UI)

## 4) 상태 확인
1. 컨테이너 목록
   - `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`
2. API 상세 헬스
   - `curl -s http://localhost:8001/health/detail`
3. OCR 워커 헬스
   - `curl -s http://localhost:8100/health`
4. vLLM 헬스
   - `curl -s http://localhost:8118/health`
5. 프론트 API 연결 확인
   - `curl -s http://localhost:8001/health/detail`
   - 필요 시 프론트 콘솔에서 `VITE_API_URL` 값 점검

## 5) 네트워크 일관성 규칙
- `web`, `ocr-worker`, `paddle-vlm-server`는 반드시 같은 compose project/network에 있어야 한다.
- 서로 다른 project로 올라오면 `web -> ocr-worker` DNS 실패가 발생할 수 있다.
- 재기동 전 반드시 같은 `COMPOSE_PROJECT_NAME`으로 올린다.

## 6) 검증 규칙
- 작업 완료 기준:
  - `npm run verify:fast` 통과
  - 필요 시 `npm run verify` 통과
- OCR 측정 샘플/기록 기준:
  - `docs/ocr-test-rules.md`
- 문서 요약 메타(검색 카드용) 옵션:
  - 기본: 추출형 요약(`DOC_SUMMARY_ENABLED=true`)
  - 로컬 LLM 사용 시: `DOC_SUMMARY_USE_LOCAL_LLM=true`, `DOC_SUMMARY_OLLAMA_URL`, `DOC_SUMMARY_OLLAMA_MODEL` 설정
- 프론트엔드 검색 장애 점검 순서:
  1. `VITE_API_URL`이 현재 API 포트와 일치하는지 확인
  2. `/health/detail`, `/documents/search`를 `curl`로 직접 확인
  3. 프론트에서 동일 요청이 실패하면 브라우저 네트워크 탭의 요청 URL/상태코드 확인

## 7) 금지사항
- `python app/main.py` 등 호스트 직접 실행 금지
- `.env`를 localhost 기반으로 바꿔 비도커 실행하는 방식 금지
