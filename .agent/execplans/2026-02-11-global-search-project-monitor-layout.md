# 글로벌 검색/프로젝트 모니터링 레이아웃 실행 계획

## 1. Goal
- `docs/code.html`을 공통 상단 레이아웃 + 프로젝트 모니터링 중심 구조로 개편하고, 글로벌 검색 정책과 필터 UX 요구사항을 반영한다.

## 2. Entry Points
- `docs/code.html`
- `docs/prd/global-search-project-monitor-layout.md`

## 3. Files-to-Touch
- `docs/prd/global-search-project-monitor-layout.md` (신규)
- `.agent/execplans/2026-02-11-global-search-project-monitor-layout.md` (신규)
- `docs/code.html` (수정)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| GSPM-REQ-001 | 상단바 요소가 로고/검색/알림/유저만 존재 | `rg -n "My Projects|All Projects" docs/code.html` 결과가 상단바 영역에 없음 |
| GSPM-REQ-002 | 요약 카드 + 새 프로젝트 버튼 + 내/전체 토글 + 10개 리스트 반영 | `rg -n "새 프로젝트 생성|내 프로젝트|전체 프로젝트|Showing 10" docs/code.html` |
| GSPM-REQ-003 | Latest Issue 전 항목 Empty 상태 반영 | `rg -n "Latest Issue|Empty" docs/code.html` |
| GSPM-REQ-004 | 검색 정책/우선순위/명령어 예시 노출 | `rg -n "프로젝트 정보 > 안건 > 사양 > 자료 > UNIT > PART'S|프로젝트코드:삼성전자" docs/code.html` |
| GSPM-REQ-005 | 필터 패널 기본 접힘 및 업데이트 바로가기 제공 | `rg -n "details class=\"group rounded-2xl\"|안건|예산|사양|기본정보" docs/code.html` |

## 5. Implementation Steps
1. PRD와 실행계획 문서를 추가해 요구사항/검증 기준을 명문화한다.
2. 상단바를 공통 레이아웃 요구사항에 맞게 재구성한다.
3. 본문에 프로젝트 요약 카드, 글로벌 검색 정책 안내, 프로젝트 토글/생성 액션, 접힘형 필터 패널을 배치한다.
4. 프로젝트 리스트 10개를 업데이트 강조 + Latest Issue Empty 상태로 정리한다.
5. Docker 환경에서 `verify:fast`를 실행해 검증한다.

## 6. Rollback Plan
- `git revert <commit>`으로 본 변경을 되돌린다.

## 7. Evidence
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
- `rg -n "Latest Issue|Empty|프로젝트코드:삼성전자" docs/code.html`
