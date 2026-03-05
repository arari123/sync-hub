# 1. Goal
메인 페이지 프로젝트 리스트 카드에서 메타(고객사/설치장소/담당자)를 하단으로 내리고, 개요를 2줄까지 보이도록 조정한다.

# 2. Entry Points
- `frontend/src/pages/SearchResults.jsx`

# 3. Files-to-Touch
- `frontend/src/pages/SearchResults.jsx`
- `docs/prd/main-project-list-meta-bottom-overview-two-lines-2026-02-18.md`
- `.agent/execplans/2026-02-18-main-project-list-meta-bottom-overview-two-lines.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 카드 메타 정보 하단 배치 확인 | `git diff frontend/src/pages/SearchResults.jsx` |
| REQ-002 | 개요 2줄 표시/클램프 확인 | `git diff frontend/src/pages/SearchResults.jsx` |
| REQ-003 | 빠른 회귀 검증 통과 | `docker-compose run --rm web bash -lc 'cd /app && bash scripts/verify_fast.sh'` |

# 5. Implementation Steps
1. 프로젝트 카드 좌측 본문 영역을 세로 `flex` 구조로 변경한다.
2. 메타 정보 블록을 `mt-auto` 기반 하단 영역으로 이동한다.
3. 개요 텍스트에 2줄 표시 클램프 및 최소 높이를 적용한다.
4. Docker 컨테이너에서 `verify:fast`를 실행해 회귀를 확인한다.

# 6. Rollback Plan
1. 변경 커밋을 `git revert`한다.
2. 레이아웃 이상 시 `SearchResults.jsx` 카드 섹션을 이전 구조로 복구한다.

# 7. Evidence
- 코드 diff
- `docker-compose run --rm web bash scripts/verify_fast.sh` 통과 로그
