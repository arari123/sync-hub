# 세션 핸드오버 (2026-02-08)

## 목적
- `session-handover-2026-02-07.md`가 방대해져, 재개 기준 문서를 분리한다.
- 다음 세션부터 이 문서를 단일 기준으로 사용한다.

## 세션 시작 트리거
- 사용자가 **`다음 작업 진행해줘`** 또는 동일 의미 재개 지시를 입력하면 본 문서를 기준으로 즉시 진행한다.

## 코드 리뷰 반영 필요사항
- 현재 미해결 코드 리뷰 항목 없음.

## 현재 상태 요약
- 레거시 `posts` API 정리 완료
  - 제거: `POST /posts`, `GET /posts`
  - 제거: `app/models.py`의 `Post` 모델, `app/schemas.py`
- 문서/가이드 최신화 완료
  - `AGENTS.md` 세션 재개 기준 문서를 본 문서로 전환
  - `docs/repo-map.md`, `docs/ai-system-context.md` 링크/재개 기준 최신화

## 다음 세션 우선 작업
1. 프로젝트/문서 목록 pagination 표준화 [완료]
- 대상: `GET /budget/projects`, `GET /documents/search`
- 목표: `page`, `page_size`, `total` 형태의 공통 응답 규격 수립

2. 검색 품질 E2E 스모크 자동화 [완료]
- 대상: 문서 검색 + 프로젝트 검색 동작 시나리오
- 목표: 주요 질의(`라인 프로파일 센서`, `basler`, 장애조치 키워드) 회귀 자동 검증

3. 디자인 토큰/컴포넌트 규칙 lint 가이드화 [완료]
- 대상: `frontend/src/index.css`, `frontend/src/components/ui/*`
- 목표: 토큰 미사용 하드코딩 색상/크기 남발 방지 체크리스트/자동 점검 규칙 추가

4. 예산 입력 UX Phase2-2 고급 엑셀 인터랙션 [진행중]
- 대상: `frontend/src/pages/BudgetProjectEditor.jsx`
- 목표:
  - Shift+화살표 다중 선택
  - Ctrl+화살표 입력 영역 끝 이동
  - 셀 드래그 자동복사(fill)
  - Undo/Redo 히스토리 고도화(미완료)

## 체크리스트
- [x] 1) 프로젝트/문서 목록 pagination 표준화
- [x] 2) 검색 품질 E2E 스모크 자동화
- [x] 3) 디자인 토큰/컴포넌트 규칙 lint 가이드화
- [ ] 4) 예산 입력 UX Phase2-2 고급 엑셀 인터랙션

## 다음 세션 바로 실행용 명령
```bash
# 1) 상태 확인
curl -s http://localhost:8001/health/detail
curl -s http://localhost:8100/health

# 2) 빠른 검증
npm run verify:fast

# 2-1) 검색 E2E 스모크
python3 scripts/search_e2e_smoke.py --api-base http://localhost:8001

# 3) DB/ES 초기화 (필요 시)
docker exec synchub_db psql -U postgres -d synchub -c "TRUNCATE TABLE dedup_audit_log, dedup_cluster_members, dedup_clusters, documents RESTART IDENTITY CASCADE;"
curl -X DELETE 'http://localhost:9200/documents_index?ignore_unavailable=true'
```

## 참고 문서
- `docs/session-handover-2026-02-07.md` (아카이브)
- `docs/ai-system-context.md`
- `docs/ai-frontend-guide.md`
- `docs/ai-design-guide.md`

## 진행 로그
- 2026-02-08
  - 레거시 `posts` API 제거(`app/main.py`, `app/models.py`, `app/schemas.py`)
  - 세션 재개 기준 문서를 `docs/session-handover-2026-02-08.md`로 분리
  - 검증:
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 64 tests ... OK`)
    - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (우선작업 1 완료)
  - pagination 표준화 구현:
    - `GET /budget/projects` 응답을 `{ items, page, page_size, total }`로 통일
    - `GET /documents/search` 응답을 `{ items, page, page_size, total }`로 통일 (`limit`은 호환 파라미터로 유지)
  - 프론트 호환 보강:
    - `BudgetManagement`, `SearchResults`에서 배열/페이지네이션 응답 모두 파싱 가능하도록 보강
  - 검증:
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과
    - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (우선작업 2 완료)
  - 검색 E2E 스모크 자동화 스크립트 추가: `scripts/search_e2e_smoke.py`
    - 기본 시나리오: `라인 프로파일 센서`, `basler`, `장애 조치`
    - 문서 검색 + 프로젝트 검색을 함께 호출해 최소 품질 조건 검증
    - 인증은 `--access-token`/`--email --password` 또는 자동 가입/인증(`--auto-signup`) 지원
  - 기존 품질 리포트 스크립트 호환 보강:
    - `scripts/generate_ocr_quality_report.py`가 페이지네이션 응답(`items`)을 인식하도록 수정
  - 검증:
    - `python3 scripts/search_e2e_smoke.py --api-base http://localhost:8001` 통과
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과
    - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (우선작업 3 완료)
  - 디자인 토큰 lint 자동화:
    - 스크립트 추가: `scripts/lint_frontend_design_tokens.py`
    - 점검 범위: `frontend/src/index.css`, `frontend/src/components/ui/*.jsx`
    - 실패 조건: 하드코딩 hex/임의 색상 class/인라인 색상 스타일/필수 토큰 누락
  - 검증 파이프라인 연결:
    - `scripts/verify_fast.sh`에 디자인 lint 실행 단계 추가
  - 가이드 문서 갱신:
    - `docs/ai-design-guide.md`에 자동 점검 규칙/명령 추가
  - 검증:
    - `python3 scripts/lint_frontend_design_tokens.py` 통과
    - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과
    - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (우선작업 4 진행)
  - 예산 입력 고급 인터랙션 1차 구현:
    - 셀 다중 선택(마우스 드래그, Shift+화살표 확장)
    - Ctrl+화살표 입력 영역 끝 이동
    - 활성 셀 핸들 드래그 자동복사(fill)
  - 예산 입력 표 컴포넌트 FortuneSheet 기반으로 교체:
    - 패키지 추가: `@fortune-sheet/react`, `@fortune-sheet/core`
    - `BudgetProjectEditor`의 커스텀 `ExcelTable` 제거
    - `Workbook` 기반 입력으로 전환(선택 후 키보드 입력, 범위 선택/채우기 기본 동작 활용)
    - 기존 상세 스키마(`material/labor/expense` + `execution_*`)와 양방향 매핑 유지
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
    - `frontend/package.json`
    - `frontend/package-lock.json`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
  - 남은 작업:
    - FortuneSheet 툴바/메뉴 정책(노출 항목 최소화) 조정
    - 대용량 데이터 입력 시 성능 튜닝 및 청크 로딩
