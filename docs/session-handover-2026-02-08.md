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

3. 디자인 토큰/컴포넌트 규칙 lint 가이드화 [대기]
- 대상: `frontend/src/index.css`, `frontend/src/components/ui/*`
- 목표: 토큰 미사용 하드코딩 색상/크기 남발 방지 체크리스트/자동 점검 규칙 추가

## 체크리스트
- [x] 1) 프로젝트/문서 목록 pagination 표준화
- [x] 2) 검색 품질 E2E 스모크 자동화
- [ ] 3) 디자인 토큰/컴포넌트 규칙 lint 가이드화

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
