# Execution Plan: Home Breadcrumb Main Page Unification (2026-02-16)

## 1. Goal
- 홈 페이지 브레드크럼 명칭을 `메인 페이지`로 통일한다.

## 2. Entry Points
- `frontend/src/pages/SearchResults.jsx`

## 3. Files-to-Touch
- `frontend/src/pages/SearchResults.jsx`
- `docs/prd/home-breadcrumb-main-page-unification-2026-02-16.md`
- `.agent/execplans/2026-02-16-home-breadcrumb-main-page-unification.md`

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| REQ-001 | 홈 브레드크럼에 `메인 페이지` 표기 | 수동 확인 |
| REQ-002 | `메인 / 글로벌 검색` 제거 확인 | 코드 확인 |
| - | 프론트 빌드 | `docker exec synchub_frontend npm run build` |
| - | 빠른 검증 | `docker exec synchub_web bash scripts/verify_fast.sh` |

## 5. Implementation Steps
1. `SearchResults` 브레드크럼 노드를 `메인 페이지` 단일 라벨로 교체.
2. Docker 기준 빌드/검증 수행.
3. 커밋 및 푸시.

## 6. Rollback Plan
- `SearchResults` 브레드크럼을 `메인 / 글로벌 검색` 형태로 원복.

## 7. Evidence
- `git diff` 변경 내역
- 검증 커맨드 결과
