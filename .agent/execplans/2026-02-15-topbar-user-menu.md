# Execution Plan: 상단바 사용자 메뉴(정보/로그아웃) (2026-02-15)

## 1. Goal
상단바 사용자 이니셜 아이콘 클릭 시 Google 계정 메뉴와 유사한 팝오버를 띄워 사용자 정보(이름/이메일)와 로그아웃을 제공한다.

## 2. Entry Points
- 홈 상단바: `frontend/src/pages/SearchResults.jsx`
- 전역 상단바: `frontend/src/components/GlobalTopBar.jsx`
- 세션/로그아웃: `frontend/src/lib/session.js`, `frontend/src/lib/api.js`

## 3. Files-to-Touch
- `frontend/src/components/UserMenu.jsx` (신규)
- `frontend/src/components/GlobalTopBar.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `docs/prd/topbar-user-menu-2026-02-15.md`
- `docs/repo-map.md` (컴포넌트 추가 반영)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| FE-REQ-001~004 | 메뉴 열림/닫힘 + 사용자 정보 표시 + 로그아웃 동작 | 브라우저에서 `/home` 및 임의 라우트에서 확인 |
| AC-003 | 빠른 검증 통과 | `docker exec -w /app synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `UserMenu.jsx` 팝오버 컴포넌트 구현(외부 클릭 닫힘, 로딩 상태, 로그아웃 처리).
2. `GlobalTopBar.jsx`, `SearchResults.jsx`에 `UserMenu` 적용.
3. `docs/repo-map.md`에 신규 컴포넌트 반영.
4. `verify:fast` 실행 후 커밋/푸시.

## 6. Rollback Plan
- `UserMenu.jsx`를 제거하고 기존 상단바의 단순 배지 버튼으로 되돌린다.

## 7. Evidence
- UI 동작 확인(스크린샷/설명)
- `verify:fast` 통과 로그

