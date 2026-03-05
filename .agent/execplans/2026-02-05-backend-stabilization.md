# Execution Plan: Backend Container Stabilization

## 1. Goal
`web` 컨테이너가 재빌드/재기동 시에도 의존성 오류 없이 안정적으로 올라오도록 정리한다.

## 2. Entry Points
- Backend API: `http://localhost:8000`
- Health Check: `GET /health`
- Build file: `Dockerfile`

## 3. Files-to-Touch
- `requirements.txt`: 웹 런타임 필수 의존성만 유지.
- `requirements.ocr.txt`: 무거운 OCR/임베딩 의존성 분리.
- `docs/repo-map.md`: 의존성 파일 구조 반영.
- `app/core/pipeline.py`: 선택 의존성 미설치 환경 fallback 처리.
- `app/core/vector_store.py`: ES 연결 지연/쿼리 실패 시 복구 가능한 검색 로직.
- `app/api/documents.py`: 임베딩 결과 타입 호환성 보강.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BE-STAB-001 | web 이미지 재빌드 성공 | `docker-compose build web` |
| BE-STAB-002 | web 서비스 재기동 후 health 정상 | `curl /health` -> `{"status":"healthy"}` |
| BE-STAB-003 | 통합 verify 통과 | `npm run verify` |

## 5. Implementation Steps
1. 기존 `requirements.txt`에서 고중량 의존성 원인 분석.
2. web 기본 의존성과 OCR 전용 의존성을 분리.
3. 이미지 재빌드/재기동 후 verify로 결과 확인.

## 6. Rollback Plan
1. `requirements.txt`를 이전 버전으로 되돌린다.
2. 필요 시 `requirements.ocr.txt`를 제거한다.

## 7. Evidence
- `sg docker -c 'docker-compose build web'` 성공 (`Successfully tagged sync-hub_web:latest`).
- `sg docker -c 'docker-compose up -d db elasticsearch web'` 성공.
- `sg docker -c 'docker-compose ps'` 결과: `synchub_web`, `synchub_db`, `synchub_es`, `synchub_frontend`, `synchub_kibana` 모두 `Up`.
- `npm run verify:fast` -> `Syntax check passed for 11 files.`
- `npm run verify` -> `{"status":"healthy"}` + `cluster_name : "docker-cluster"` + `All services are operational.`
- E2E 스모크:
  - `POST /documents/upload` -> `{"id":4,"status":"pending"}`
  - `GET /documents/4` -> `status":"completed"`
  - `GET /documents/search?q=OCR&limit=3` -> `e2e.pdf` 결과 반환
