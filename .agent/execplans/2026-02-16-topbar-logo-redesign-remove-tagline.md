# Execution Plan: Topbar Logo Redesign + Tagline Removal (2026-02-16)

## 1. Goal
- 상단 좌측 `Sync-Hub` 로고를 더 강한 시각 스타일로 개편하고, `Industrial Knowledge Workspace` 문구를 제거한다.

## 2. Entry Points
- `frontend/src/components/ui/Logo.jsx`
- `frontend/src/components/GlobalTopBar.jsx`
- `frontend/src/pages/SearchResults.jsx`

## 3. Files-to-Touch
- `frontend/src/components/ui/Logo.jsx`
- `frontend/src/components/GlobalTopBar.jsx`
- `frontend/src/pages/SearchResults.jsx`
- `docs/prd/topbar-logo-redesign-remove-tagline-2026-02-16.md`
- `.agent/execplans/2026-02-16-topbar-logo-redesign-remove-tagline.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 새 로고 스타일 노출 확인 | 수동 확인 |
| REQ-002 | 문구 제거 확인 | `rg -n "Industrial Knowledge Workspace" frontend/src` |
| REQ-003 | 홈/일반 상단 동일 스타일 확인 | 수동 확인 |
| - | 프론트 빌드/회귀 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `Logo` 컴포넌트에 topbar 전용 variant 및 subtitle 토글 옵션 추가.
2. `GlobalTopBar`와 `SearchResults` 상단 좌측 영역을 `Logo` 컴포넌트 사용으로 통일.
3. 태그라인 문구 제거 확인 후 Docker 검증 실행.
4. 커밋 및 푸시.

## 6. Rollback Plan
- `GlobalTopBar`, `SearchResults`의 좌측 로고 영역을 이전 하드코딩 마크업으로 되돌린다.
- `Logo` 컴포넌트의 variant/showSubtitle 확장을 제거한다.

## 7. Evidence
- `rg -n "Industrial Knowledge Workspace" frontend/src` 결과
- `docker exec synchub_frontend npm run build`
- `docker exec synchub_web bash scripts/verify_fast.sh`
