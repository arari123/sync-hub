# Sync-Hub 운영 규칙

## 개발 흐름
1. **PRD**: 요구사항을 `docs/prd/*.md`에 정의한다.
2. **PLANS**: `PLANS.md` 템플릿을 기준으로 `.agent/execplans/*.md`에 실행 계획을 작성한다.
3. **실행**: 계획에 따라 구현한다.
4. **검증**: `verify` 스크립트를 실행해 요구사항 충족을 확인한다.

## 규칙 및 금지사항
- **언어**: 문서와 사용자 커뮤니케이션은 한국어, 코드와 변수명은 영어를 사용한다.
- **플레이스홀더 금지**: 정당한 사유 없이 `TODO` 또는 빈 구현을 남기지 않는다.
- **원자적 커밋**: 변경은 논리적 하위 작업 단위로 묶어 커밋한다.
- **완료 기준 = 검증 통과**: `verify` 또는 `verify:fast`가 통과되어야 작업 완료로 본다.
- **Git Push 원칙**: 작업 단위 완료 시 `verify:fast`(또는 `verify`) 통과 후 커밋하고 원격에 `git push`까지 수행한다. 원격 미설정/권한 오류로 push가 불가하면 사유를 즉시 공유한다.
- **Docker 100% 종속 원칙**: 개발/실행/테스트/검증은 반드시 Docker 환경에서만 수행한다.
- **비도커 실행 금지**: 로컬 호스트(비도커) 직접 실행 경로는 사용하지 않는다. 문서/스크립트/가이드는 Docker 기준으로만 유지한다.
- **GPU 사용 규칙**: OCR 등 GPU 고부하 작업은 `docker-compose.gpu.yml`을 사용한다.
- **REPO-MAP 점검/동기화 규칙**: 모든 작업 완료 시 `docs/repo-map.md`를 반드시 점검하고, 변경된 구조/경로/엔트리포인트가 있으면 같은 작업에서 즉시 업데이트한다.
- **프로젝트 입력 문서 동기화 규칙**: 프로젝트 생성/수정/버전/설비/예산상세(`budget_settings` 포함) 입력 항목이 추가·변경되면 같은 작업에서 `docs/project-input-spec.md`를 반드시 갱신한다.

## 명령어 가이드
- `npm run verify`: 전체 테스트 및 린트 실행(추후 구현).
- `npm run verify:fast`: 빠른 단위 테스트 실행(추후 구현).
- `sudo docker-compose up -d`: 서비스 기동.
- `docker-compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`: GPU 포함 표준 실행.

## 실행 기준
- 기본 실행은 컨테이너 내부 기준으로 수행한다.
- 예시:
  - API: `synchub_web_noreload` 또는 `synchub_web`
  - OCR Worker: `synchub_ocr`
  - DB: `synchub_db`
  - ES: `synchub_es`

## 저장소 맵 (빠른 링크)
- 자세한 구조는 [docs/repo-map.md](docs/repo-map.md)를 참고한다.

## 세션 재개 규칙
- 새 세션에서 사용자가 **`다음 작업 진행해줘`** 또는 동일 의미의 재개 지시(예: `다음 작업 진행해주고 ...`)를 입력하면 재개 명령으로 처리한다.
- 재개 기준 문서: `docs/session-handover-2026-02-08.md`
- 실행 순서:
  1. 문서의 `코드 리뷰 반영 필요사항`을 먼저 처리한다(미해결 항목이 있을 경우 최우선).
  2. 문서의 `다음 세션 우선 작업`을 위에서 아래 순서로 수행한다.
  3. 측정 가능한 결과(시간/청크/상태/로그 근거)로 검증한다.
  4. 같은 핸드오버 문서에 결과와 남은 작업(체크리스트 완료 상태 포함)을 갱신한다.
  5. `npm run verify:fast` 실행 후 커밋 및 `git push`까지 수행한다.
