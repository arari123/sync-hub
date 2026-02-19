# ExecPlan: 호스팅 문서 검색 폴백

## 목표
- ES 메모리 초기화 상황에서도 호스팅 문서 검색과 데이터 허브 AI 근거 수집이 동작하도록 DB 폴백 경로를 추가한다.

## 작업
1. `app/api/documents.py`
- `build_db_fallback_search_hits` 추가
- `/documents/search`에서 벡터 히트 0건 시 DB 폴백 히트 사용

2. `app/api/data_hub.py`
- `/api/data-hub/ask`에서 `fused_hits` 0건 시 DB 폴백 히트 사용

3. 검증
- `verify_fast` 실행
- 호스팅 API 실검증: `/documents/search`, `/api/data-hub/ask`

## 리스크
- OCR 불가(이미지 PDF) 문서는 `failed` 상태이므로 본 폴백 대상이 아니다.
