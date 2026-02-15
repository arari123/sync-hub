# Execution Plan: 보안/운영 하드닝 (2026-02-15)

## 1. Goal
- 관리자 API를 관리자만 접근 가능하도록 제한하고,
- 문서 업로드/다운로드를 인증 기반 + 안전한 파일 저장 방식으로 개선하며,
- 안건 HTML을 sanitize 하되 리치 편집 기능(폰트/색상/굵기/표/이미지)을 유지하고,
- 브라우저 다운로드 흐름을 Authorization 포함 방식으로 통일한다.

## 2. Entry Points
- Backend API
  - `app/api/admin_debug.py`, `app/api/admin_dedup.py`
  - `app/api/documents.py`
  - `app/api/agenda.py`
  - `app/api/auth.py`
  - `app/main.py`, `scripts/verify.sh`
- Frontend
  - `frontend/src/components/DocumentDetail.jsx`
  - `frontend/src/pages/AgendaDetail.jsx`, `frontend/src/pages/AgendaCreate.jsx`
  - `frontend/src/lib/api.js`

## 3. Files-to-Touch
- Backend
  - `app/api/auth.py` (admin dependency 추가)
  - `app/core/admin_access.py` (관리자 판별 유틸)
  - `app/core/html_sanitizer.py` (허용 리스트 기반 sanitize)
  - `app/api/admin_debug.py`, `app/api/admin_dedup.py` (관리자 가드)
  - `app/api/documents.py` (auth 적용, 안전 업로드/응답 스키마)
  - `app/api/agenda.py` (sanitize 저장, 첨부 다운로드 권한 보강)
  - `app/main.py` (CORS 기본값/중복 schema init 정리)
  - `requirements.txt` (bleach 추가)
  - `scripts/verify.sh` (포트 수정)
- Frontend
  - `frontend/src/lib/download.js` (blob 다운로드 유틸)
  - `frontend/src/components/DocumentDetail.jsx` (다운로드/경로표시 정리)
  - `frontend/src/pages/AgendaDetail.jsx`, `frontend/src/pages/AgendaCreate.jsx` (첨부 다운로드 개선)
  - `frontend/src/components/UploadWidget.jsx` (file_path 의존 제거)
- Tests/Docs
  - `tests/test_html_sanitizer.py`
  - `docs/repo-map.md` (신규 엔트리 반영)

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| BE-REQ-001 | admin endpoint requires admin | `curl /api/admin/search_debug` -> 403 (non-admin) |
| BE-REQ-003 | documents endpoints require auth | FE에서 로그인 후 동작, 미로그인 401 |
| BE-REQ-004 | upload path is safe | unit test: sanitize filename & no traversal |
| BE-REQ-007/008 | sanitize preserves rich features | `python -m unittest ... test_html_sanitizer` |
| OPS-REQ-001 | verify.sh uses 8001 | `bash scripts/verify.sh` passes in docker |

## 5. Implementation Steps
1. 관리자 판별 유틸 + `get_current_admin_user` 추가 후 `/api/admin/*`에 적용.
2. `documents` 라우터에 로그인 의존성 추가, 업로드 저장명/디렉토리/용량 제한/응답 스키마 개선.
3. `bleach` 기반 HTML sanitizer 모듈 추가, 안건 저장 경로(create/update/reply)에서 sanitize 적용.
4. 안건 첨부 다운로드에서 thread 접근 검증(초안 보호) 추가.
5. 프론트에서 문서/첨부 다운로드를 blob 다운로드로 통일.
6. CORS 기본값/verify 포트/중복 schema init 정리.
7. 컨테이너에서 `verify_fast`/`verify` 실행, 필요 시 테스트 추가/수정.
8. `docs/repo-map.md` 업데이트, 원자적 커밋/푸시.

## 6. Rollback Plan
- 각 단계별 커밋 단위로 `git revert <commit>` 수행.
- 문서/첨부 다운로드 관련 변경은 FE/BE 동시 변경이므로, revert 시 항상 쌍으로 되돌린다.

## 7. Evidence
- `bash scripts/verify_fast.sh`, `bash scripts/verify.sh` 통과 로그
- admin/documents/agenda 다운로드 동작 확인(브라우저 네트워크 로그 또는 curl)

