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
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
  - 남은 작업:
    - Undo/Redo 히스토리 고도화
    - 다중 선택 상태에서 복사/붙여넣기 범위 매핑 개선
- 2026-02-08 (경비 UX 구조 개편 반영)
  - 경비 입력 스코프를 `설비 > 제작/설치 > 자체/외주`로 분리:
    - 경비 섹션 상단에 `자체 경비 / 외주 경비` 토글 추가
    - 입력 스코프 배지에 현재 경로 표시(`재료비/인건비는 설비 > 제작/설치 유지`)
  - 경비 자동 산정/수정/저장 로직에 `expense_type` 반영:
    - 자동 산정 rows가 현재 자체/외주 스코프 기준으로 생성/병합되도록 보강
    - 저장 시 `expense_type` 정규화 및 왕복 유지
  - 백엔드 호환 반영:
    - `ExpenseDetailItem`, `ExpenseExecutionItem`에 `expense_type` 필드 추가
    - 확정 버전 예산락 시그니처에 `expense_type` 포함(구버전 누락 데이터는 `자체`로 정규화)
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
  - 커밋/배포:
    - `c4adf92 feat: 경비 자체/외주 스코프 전환 및 저장 일관화`
    - `git push` 완료 (`main`)
- 2026-02-08 (경비 수동값 저장 초기화 버그 보정)
  - `전체 저장` 이후 경비 수동 입력값이 자동값으로 덮이는 레거시 데이터 경로 보정:
    - `expense_name` 기반 `auto_formula` 복원 맵 추가
    - 경비 자동 병합 시 `auto_formula` 미보유 행도 `공식키/항목명` 기준으로 동일 행 매칭
    - 셀 수정 시 `auto_formula` 미보유 레거시 행도 즉시 공식키를 복원해 수동 전환(`is_auto=false`)이 유지되도록 보강
    - 저장 정규화 시 `auto_formula`를 이름 기반으로 복원하여 왕복 저장 일관성 확보
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (경비 저장 후 재병합 덮어쓰기 재수정)
  - 문제:
    - `전체 저장` 이후 경비 재병합 과정에서 `횟수/MD`, `산정 기준`, 금액이 자동값으로 다시 덮이는 케이스 재발
  - 조치:
    - `autoFillExpenseRows(forceReset=false)`를 **비파괴 병합**으로 변경
    - 저장/일반 변경 경로에서는 기존 행(`quantity`, `amount`, `basis`, `memo`)을 그대로 유지
    - `경비 자동 산정` 버튼(`forceReset=true`)에서만 자동값으로 재산정/초기화되도록 경로 분리
    - 일반 병합에서 누락 행 보존 로직 강화(동일 공식키/항목명 기준)
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
    - `docker-compose restart web frontend` 재기동 완료
- 2026-02-08 (경비 횟수/MD 비대상 항목 잠금/숨김)
  - 요구 반영:
    - `프로젝트 운영비`, `소모품비`, `공구비`, `현지인원채용 비용`, `도비 비용`은 `횟수/MD` 입력 대상에서 제외
  - 조치:
    - 해당 항목의 `횟수/MD` 셀을 행 단위 읽기전용으로 잠금
    - 저장값이 `0`이어도 화면 표시/복사 시 빈칸으로 보이도록 렌더링 보정
    - 키보드 입력/붙여넣기/드래그복사로도 해당 셀은 수정되지 않도록 테이블 공통 편집 경로에 잠금 로직 적용
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (교통비 계산식/출장거리 연동)
  - 요구 반영:
    - 제작 경비의 `국내 교통비` 산정 기준을 설치와 동일한 식(`교통 횟수 * 거리(km) * km당 단가`)으로 통일
    - 프로젝트 기본정보에 `출장 거리(km)` 입력 필드를 추가하고 교통비 계산에 반영
  - 조치:
    - 백엔드:
      - `budget_projects.business_trip_distance_km` 컬럼 추가(런타임 스키마 보정 포함)
      - 프로젝트 생성/수정 payload 및 응답에 `business_trip_distance_km` 추가
    - 프론트:
      - 프로젝트 생성/상세 수정 모달에 `출장 거리(km)` 입력 UI 추가
      - 프로젝트 상세 정보 카드에 출장 거리 표시
      - 예산 편집기 경비 교통비 계산 시 프로젝트 출장 거리 값을 우선 사용하도록 연동
      - 제작 `국내 교통비` 산정 기준 문구를 설치와 동일 식으로 통일
  - 관련 파일:
    - `app/models.py`
    - `app/database.py`
    - `app/api/budget.py`
    - `frontend/src/pages/BudgetProjectCreate.jsx`
    - `frontend/src/pages/BudgetProjectOverview.jsx`
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
    - `docker-compose restart web frontend` 후 `budget_projects` 컬럼 반영 확인
- 2026-02-08 (제작 자체경비 교통비 산정 기준 문구 갱신 보정)
  - 문제:
    - 계산식은 반영되어 있으나, 기존 행 보존 로직으로 `산정 기준` 문구가 과거 텍스트로 유지됨
  - 조치:
    - 경비 자동 병합(`forceReset=false`) 시 값(`횟수/금액`)은 보존하되, `basis`는 최신 생성 문구(`generated.basis`)로 갱신
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (출장 거리 편도 입력 / 경비 왕복 계산 반영)
  - 요구 반영:
    - 프로젝트 기본정보의 출장 거리는 `편도(km)` 입력 기준 유지
    - 경비 교통비 계산은 `왕복 거리(편도 * 2)` 기준으로 계산
  - 조치:
    - `국내 교통비` 산정 기준 문구를 `교통 횟수 * 왕복 {거리}km * km당 단가`로 변경
    - 자동 산정 금액 및 횟수 입력 시 금액 재계산 로직 모두 `편도 * 2` 적용
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (재료비 유닛 템플릿 개수 지정 반영)
  - 요구 반영:
    - 재료비 사이드바 `유닛 템플릿`에 `개수` 입력(기본값 1) 추가
    - 템플릿 카드 금액 표시를 `유닛합계 x 개수`로 반영
    - 드래그 payload에 `unit_count` 포함
    - 템플릿 드롭 시 `개수`를 반영해 행 생성:
      - 예산 모드: `수량 = 원본수량 x 개수`
      - 집행 모드: `집행금액 = 원본금액 x 개수`
  - 관련 파일:
    - `frontend/src/components/BudgetSidebar.jsx`
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (예산 입력 사이드바 트리 전환 및 상단 전환 UI 제거)
  - 요구 반영:
    - 재료비/인건비/경비 입력 페이지 공통으로 사이드바를 트리 구조로 개편
      - 재료비: `설비 > 제작/설치 > 유닛`
      - 인건비/경비: `설비 > 제작/설치`
    - 재료비 트리 선택 동작:
      - 설비 클릭: 설비 전체 파츠 표시
      - 설비 > 제작/설치 클릭: 해당 단계 파츠 표시
      - 설비 > 제작/설치 > 유닛 클릭: 해당 유닛 파츠 표시
    - 기존 상단의 입력 스코프/설비/제작설치/자체외주 전환 버튼 제거
    - 재료비에서 유닛 노드 선택 시 상단에 `유닛 개수` 입력 + `적용` 버튼 제공(기본값 1)
  - 조치:
    - `BudgetSidebar`를 템플릿 카드 방식에서 트리 렌더링 컴포넌트로 재구성
    - `BudgetProjectEditor`의 표시 필터 로직을 트리 선택 기반으로 재작성
    - 재료비 유닛 개수 적용 시 선택 유닛의 수량(집행 모드에서는 집행금액) 배수 반영
    - 경비 표에 `구분(expense_type)` 열 추가(자체/외주 동시 표시 가시성 보강)
  - 관련 파일:
    - `frontend/src/components/BudgetSidebar.jsx`
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (트리 가시성 개선)
  - 요구 반영:
    - 사이드바 트리 구조 가시성이 낮아 연결선/활성 구분 강화 필요
  - 조치:
    - 트리 자식 영역에 세로 연결선(`border-l`) 추가
    - 자식 노드에 가지선 + 포인트 도트 표시
    - 활성 노드/활성 경로 노드 스타일 대비 강화(테두리/배경/뱃지 색상)
  - 관련 파일:
    - `frontend/src/components/BudgetSidebar.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (경비 트리 3단계 확장: 자체/외주)
  - 요구 반영:
    - 경비 입력 트리를 `설비 > 제작/설치 > 자체/외주`로 확장
  - 조치:
    - 트리 선택 상태에 `expenseType` 추가
    - 경비 트리에서 단계 하위 노드로 `자체`, `외주` 노드 생성
    - 경비 목록 필터를 트리의 `자체/외주` 선택값과 연동
    - 경비 행 수정 시 트리에서 선택된 `expense_type`을 유지하도록 보강
    - `경비 자동 산정` 버튼을 경비 트리 선택 범위(단계/자체외주)에 맞춰 동작하도록 조정
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectEditor.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (입력 트리 접기/펼치기 기능 추가)
  - 요구 반영:
    - `입력 트리` 제목 옆에 아이콘 버튼으로 `모두 접기`, `모두 펼치기` 제공
    - 각 트리 노드별 접기/펼치기 토글 제공
  - 조치:
    - 트리 노드 접힘 상태(`collapsedByKey`)를 사이드바 상태로 관리
    - 헤더에 `Minus/Plus` 아이콘 버튼 추가
    - 노드 라벨 왼쪽에 `Chevron` 토글 버튼 추가(개별 노드 접기/펼치기)
    - 키보드 선택 접근성 보완(`role="button"`, Enter/Space 지원)
  - 관련 파일:
    - `frontend/src/components/BudgetSidebar.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (트리 항목 본문 클릭 시 접기/펼치기 연동)
  - 요구 반영:
    - 트리 항목 텍스트/영역 자체를 클릭해도 접기/펼치기 동작 필요
  - 조치:
    - 자식이 있는 노드는 항목 본문 클릭 시 `선택 + 접기/펼치기` 동시 동작으로 변경
    - 키보드 Enter/Space 동작도 동일하게 연동
  - 관련 파일:
    - `frontend/src/components/BudgetSidebar.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (프로젝트 상세정보 수정 페이지 전환 및 설비 동기화 보강)
  - 요구 반영:
    - 프로젝트 상세 정보 수정을 팝업이 아닌 별도 페이지 이동 방식으로 전환
    - 설비 추가/삭제 시 현재 등록 설비를 모두 보면서 관리 가능하도록 개선
    - 상세 정보에서 설비 삭제 시 예산관리 페이지에 반영되지 않던 버그(삭제 미반영) 수정
  - 조치:
    - 프론트:
      - 신규 페이지 추가: `BudgetProjectInfoEdit`
      - 라우트 추가: `/project-management/projects/:projectId/info/edit`
      - `BudgetProjectOverview`에서 기존 팝업 편집 제거 및 페이지 이동 링크로 교체
      - 설비 편집 UI를 리스트+추가/삭제 방식으로 구성(기존 설비 전체 표시, 개별 삭제)
    - 백엔드:
      - `PUT /budget/versions/{version_id}/equipments` 호출 시 버전 상세 JSON의 설비 항목을 선택 설비 목록과 동기화
      - 삭제된 설비에 연결된 재료/인건비/경비 및 집행 상세 행을 제거하도록 보강
      - 동기화된 상세 기준으로 설비 합계 재계산 저장하여 예산관리 화면과 일관성 유지
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectInfoEdit.jsx`
    - `frontend/src/pages/BudgetProjectOverview.jsx`
    - `frontend/src/App.jsx`
    - `app/api/budget.py`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (상세정보 설비 삭제 버튼 포커스/오삭제 UI 버그 보정)
  - 문제:
    - 설비 삭제(X) UI가 첫 항목에 포커스가 튀며 오동작하는 현상
  - 조치:
    - 설비 목록 영역을 `label` 래퍼에서 분리해 클릭 시 첫 삭제 버튼으로 포커스가 이동하는 문제 제거
    - 삭제 버튼에 `onMouseDown/onClick`에서 `preventDefault + stopPropagation` 적용
  - 관련 파일:
    - `frontend/src/pages/BudgetProjectInfoEdit.jsx`
  - 검증:
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- 2026-02-08 (프로젝트 상세 공통 상단 메뉴 개편)
  - 요구 반영:
    - 프로젝트 상세 하위 모든 페이지에서 동일한 상단 메뉴 유지
    - 상세/예산/이슈/일정/사양/데이터/프로젝트 정보 수정으로 즉시 이동 가능
    - 예산 관리 하위(재료비/인건비/경비 입력) 2단 메뉴를 상단에 고정 제공
  - 조치:
    - 프로젝트 경로(`:projectId`) 감지형 공통 메뉴 컴포넌트 신규 추가
    - `Layout` 헤더 하단에 공통 메뉴 삽입하여 프로젝트 하위 전체 페이지에 일괄 노출
    - 현재 경로 기준 활성 상태 스타일 반영(예산 관리는 `/budget` 및 `/edit/*` 포함)
  - 관련 파일:
    - `frontend/src/components/ProjectContextNav.jsx`
    - `frontend/src/components/Layout.jsx`
    - `.agent/execplans/2026-02-08-project-global-top-menu.md`
  - 검증:
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
- 2026-02-08 (프로젝트 헤더/메뉴 UX 리디자인)
  - 요구 반영:
    - 프로젝트 상세 기준으로 브레드크럼/제목 우측에 공통 메뉴 배치
    - 상세/예산/입력/정보수정/프로젝트 하위 플레이스홀더 페이지를 동일 헤더 패턴으로 통일
    - 예산관리 메뉴는 클릭 시 메인 이동, 마우스오버 시 하위 입력(재료비/인건비/경비) 노출
    - 재료비/인건비/경비 입력 페이지의 `전체 저장`, `버전 확정` 버튼을 상단 헤더 우측으로 이동
  - 조치:
    - 공통 헤더 컴포넌트 추가: `ProjectPageHeader`
    - 프로젝트 컨텍스트 메뉴 컴포넌트 개편: hover dropdown + active 상태 개선
    - 레이아웃 전역 메뉴 제거 후 각 프로젝트 페이지 헤더에 메뉴 삽입
    - 프로젝트 하위 placeholder 전용 페이지 추가(`ProjectPlaceholderPage`) 후 라우트 교체
  - 관련 파일:
    - `frontend/src/components/ProjectPageHeader.jsx`
    - `frontend/src/components/ProjectContextNav.jsx`
    - `frontend/src/components/Layout.jsx`
    - `frontend/src/pages/BudgetProjectOverview.jsx`
    - `frontend/src/pages/BudgetProjectBudget.jsx`
    - `frontend/src/pages/BudgetProjectEditor.jsx`
    - `frontend/src/pages/BudgetProjectInfoEdit.jsx`
    - `frontend/src/pages/ProjectPlaceholderPage.jsx`
    - `frontend/src/App.jsx`
    - `.agent/execplans/2026-02-08-project-header-menu-redesign.md`
  - 검증:
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
- 2026-02-08 (상단 메뉴 슬림화/아이콘 스타일 개선)
  - 요구 반영:
    - 메뉴에서 `프로젝트 관리` 버튼 제거
    - 메뉴 버튼 크기를 더 작고 슬림하게 조정
    - 모든 메뉴 및 예산 하위 드롭다운에 아이콘 추가
  - 조치:
    - `ProjectContextNav` 메뉴 메타에 아이콘 필드 추가
    - 1차/2차 메뉴 버튼 높이/패딩/폰트 크기 축소 및 활성 스타일 정리
  - 관련 파일:
    - `frontend/src/components/ProjectContextNav.jsx`
  - 검증:
    - `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
    - `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (`Ran 77 tests ... OK`)
