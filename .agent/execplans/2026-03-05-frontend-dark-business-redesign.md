# Execution Plan - frontend-dark-business-redesign (2026-03-05)

## 1. Goal
프론트엔드 전역을 점검하여 다크모드 기반의 전문적인 비즈니스 UI로 개편하고, 공통 컴포넌트 중복을 리팩토링한다.

## 2. Entry Points
- `frontend/src/main.jsx`
- `frontend/src/index.css`
- `frontend/src/components/Layout.jsx`
- `frontend/src/components/GlobalTopBar.jsx`
- `frontend/src/pages/SearchResults.jsx`

## 3. Files-to-Touch
- 생성
  - `frontend/src/components/AppQuickMenu.jsx`
  - `docs/prd/frontend-dark-business-redesign-2026-03-05.md`
  - `.agent/execplans/2026-03-05-frontend-dark-business-redesign.md`
- 수정
  - `frontend/src/main.jsx`
  - `frontend/src/index.css`
  - `frontend/src/components/ui/Button.jsx`
  - `frontend/src/components/ui/Input.jsx`
  - `frontend/src/components/ui/Logo.jsx`
  - `frontend/src/components/Layout.jsx`
  - `frontend/src/components/GlobalTopBar.jsx`
  - `frontend/src/pages/SearchResults.jsx`
  - `frontend/src/components/ResultList.jsx`
  - `frontend/src/components/GlobalSearchResultList.jsx`
  - `frontend/src/components/DocumentDetail.jsx`
  - `frontend/src/components/agenda/AgendaSplitView.jsx`
  - `frontend/src/components/agenda/RichTextEditor.jsx`
  - `frontend/src/pages/Login.jsx`
  - `frontend/src/pages/Signup.jsx`
  - `frontend/src/pages/VerifyEmail.jsx`
  - `docs/repo-map.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 다크모드 기본 적용 확인 | `docker exec synchub_frontend ... eslint ...` 통과 + 코드에서 루트 dark class 적용 |
| REQ-002 | 전역 토큰/서피스 스타일 점검 | `python3 scripts/lint_frontend_design_tokens.py` (verify:fast 내 포함) |
| REQ-003 | 상단 퀵메뉴 중복 제거 확인 | `SearchResults`, `GlobalTopBar`가 공통 컴포넌트 사용 |
| REQ-004 | 홈/검색 화면 개편 | `SearchResults.jsx` 수정 diff 확인 |
| REQ-005 | 핵심 컴포넌트 다크 가독성 | 관련 컴포넌트 수정 diff + ESLint 통과 |
| REQ-006 | 인증 화면 다크 일관화 | `Login/Signup/VerifyEmail.jsx` 수정 diff 확인 |
| REQ-007 | 검증 통과 | `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'` + 프론트 ESLint 통과 |

## 5. Implementation Steps
1. PRD/실행계획 문서 작성
2. 다크모드 기본 활성화 및 전역 디자인 토큰 재정의
3. 상단 퀵메뉴 공통 컴포넌트 분리 및 상단바 리팩토링
4. 홈/검색/문서/안건/인증 핵심 화면 다크 톤 정리
5. Docker 검증 실행 및 문서(repo-map) 동기화
6. 커밋 및 원격 push

## 6. Rollback Plan
1. `git revert <commit_sha>`로 단일 작업 커밋 롤백
2. UI 문제 범위가 크면 `frontend/src/index.css`와 신규 공통 컴포넌트 우선 롤백
3. 필요 시 `main.jsx`의 dark 기본 적용만 제거해 긴급 복구

## 7. Evidence
- 검증 로그
  - `docker exec synchub_web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
  - `docker exec synchub_frontend sh -lc 'cd /app && npx eslint ...'`
- Git 증적
  - `git status --short`
  - `git show --stat --oneline HEAD`

