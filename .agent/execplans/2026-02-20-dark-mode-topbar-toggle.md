# 1. Goal
상단바 사용자 메뉴 옆에 다크모드 전환 버튼을 추가하고, 전역 테마(light/dark)를 안정적으로 적용/유지한다.

# 2. Entry Points
- `frontend/src/components/GlobalTopBar.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/index.css`
- `frontend/src/main.jsx`

# 3. Files-to-Touch
- `docs/prd/dark-mode-topbar-toggle-2026-02-20.md` (new)
- `.agent/execplans/2026-02-20-dark-mode-topbar-toggle.md` (new)
- `frontend/src/lib/theme.js` (new)
- `frontend/src/components/ThemeToggleButton.jsx` (new)
- `frontend/src/components/GlobalTopBar.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `frontend/src/main.jsx`
- `frontend/src/index.css`
- `docs/repo-map.md`

# 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 상단바 버튼 노출 확인 | 코드 반영 (`GlobalTopBar`, `SearchResults`) |
| REQ-002 | 클릭 시 테마 전환 확인 | 코드 반영 (`ThemeToggleButton`, `theme.js`) |
| REQ-003 | localStorage 유지 확인 | 코드 반영 (`theme.js`) |
| REQ-004 | 초기 렌더 전 테마 적용 | 코드 반영 (`main.jsx`) |
| REQ-005 | 다크 배경 확인 | 코드 반영 (`index.css`) |
| REQ-006 | 회귀 검증 | `bash scripts/verify_frontend_fast.sh`, `bash scripts/verify_fast.sh` |

# 5. Implementation Steps
1. 테마 유틸(`theme.js`) 추가 및 초기화 함수 구현
2. 상단바 토글 컴포넌트(`ThemeToggleButton`) 추가
3. 상단바 2개 경로에 버튼 연결
4. 다크 배경 CSS 보강
5. 검증 스크립트 실행 및 결과 기록

# 6. Rollback Plan
- 신규 파일(`theme.js`, `ThemeToggleButton`) 삭제
- 상단바/메인/CSS 변경 이전 커밋으로 리셋
- `verify:fast` 재실행으로 원복 검증

# 7. Evidence
- eslint 통과 로그
- `verify_frontend_fast.sh` 실행 로그
- `verify_fast.sh` 실행 로그
