# 개발 환경 점검 (Docker 종속성 포함)

## 1) 결론
- 이 프로젝트는 **Docker 권장** 구조지만, 코드 자체가 100% Docker 전용은 아니다.
- 다만 기본 환경값이 Docker 서비스명(`db`, `elasticsearch`, `ocr-worker`)을 사용하므로, 비도커 실행 시 환경변수 오버라이드가 필요하다.

## 2) Docker 종속 지점
- DB 기본 연결: `DATABASE_URL` (`POSTGRES_HOST=db`)
- 검색엔진 기본 연결: `ES_HOST=http://elasticsearch:9200`
- OCR 기본 연결: `OCR_WORKER_URL=http://ocr-worker:8100/ocr`
- GPU OCR 운영 규칙: `docker-compose.gpu.yml` 사용

## 3) 비도커(로컬) 실행 가능 여부
- 가능하지만 아래 인프라를 로컬에서 직접 띄워야 한다.
1. PostgreSQL (`localhost:5432`)
2. Elasticsearch (`localhost:9200`)
3. OCR worker (`localhost:8100`, 선택)

- 최소 오버라이드 권장값:
1. `POSTGRES_HOST=localhost`
2. `ES_HOST=http://localhost:9200`
3. `OCR_WORKER_URL=http://localhost:8100/ocr`
4. `VITE_API_URL=http://localhost:8000`

## 4) 빠른 시작
- Docker 기반:
1. `.env.example`를 참고해 `.env` 구성
2. `docker-compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`

- 로컬 기반(비도커):
1. 인프라(PostgreSQL/Elasticsearch/OCR worker) 수동 기동
2. `.env`에서 host 관련 값을 localhost로 변경
3. 백엔드/프론트를 각각 실행
