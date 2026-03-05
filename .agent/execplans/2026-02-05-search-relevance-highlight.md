# Execution Plan: Search Relevance & Highlighting Upgrade

## 1. Goal
검색 정확도를 개선해 단어 검색 시 관련 문서가 상위에 오도록 하고, 결과 카드에서 매칭 구간을 시각적으로 강조한다.

## 2. Entry Points
- Search API: `GET /documents/search`
- Vector store hybrid logic: `app/core/vector_store.py`
- Search response shaping: `app/api/documents.py`
- Frontend result rendering: `frontend/src/App.jsx`, `frontend/src/App.css`

## 3. Files-to-Touch
- `app/core/pipeline.py`: 임베딩 백엔드 상태 노출(실임베딩/폴백).
- `app/core/vector_store.py`: 키워드 우선 하이브리드 검색 및 ES 쿼리 품질 개선.
- `app/api/documents.py`: 매칭 중심 스니펫 생성 로직 추가.
- `frontend/src/App.jsx`: 검색어 기반 하이라이트 렌더링.
- `frontend/src/App.css`: 하이라이트 스타일 추가.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SRH-001 | 단어 검색 시 비관련 상위 노출 완화 | `GET /documents/search?q=...` 결과에서 키워드 포함 스니펫 확인 |
| SRH-002 | 결과 카드에서 매칭 포인트 강조 | `frontend` lint/build 통과 + 하이라이트 마크업 렌더링 |
| SRH-003 | 기존 검증 비회귀 | `npm run verify:fast`, `npm run verify`, `cd frontend && npm run lint && npm run build` |

## 5. Implementation Steps
1. 임베딩이 fallback일 때 벡터 검색을 비활성화해 랜덤 유사도 노이즈를 제거.
2. ES 키워드 쿼리를 `match_phrase` + `match(and/or)` 부스트 조합으로 강화.
3. 키워드 히트가 있을 경우 하이브리드 후보를 키워드 매칭 문서로 제한.
4. 검색어 주변 문맥을 잘라내는 스니펫 생성 함수 추가.
5. 프론트에서 검색어 토큰을 `<mark>`로 강조해 매칭 포인트 표시.
6. verify/lint/build를 실행해 회귀 여부 확인.

## 6. Rollback Plan
1. `app/core/vector_store.py`를 기존 RRF 단순 결합 로직으로 복원.
2. `app/api/documents.py`의 스니펫 생성 함수를 제거하고 기존 200자 고정 방식으로 복원.
3. `frontend/src/App.jsx`, `frontend/src/App.css`의 하이라이트 렌더링/스타일을 제거.

## 7. Evidence
- `npm run verify:fast` -> `Syntax check passed for 12 files.`
- `npm run verify` 통과:
  - `GET /health` -> `{"status":"healthy"}`
  - `GET /health/detail` -> `status:"healthy"` + required dependency healthy
  - `POST /_analyze` (`nori_tokenizer`) -> `Nori tokens: 6`
- `cd frontend && npm run lint` 통과 (eslint 오류 없음)
- `cd frontend && npm run build` 통과:
  - `dist/assets/index-DGMsZboW.css`
  - `dist/assets/index-zCzw4atg.js`
- 검색 스모크:
  - `GET /documents/search?q=높이로&limit=5` -> 상위 결과가 키워드 포함 문서로 반환
  - 응답 `snippet`에 검색어 주변 문맥 포함(프론트 `<mark>` 하이라이트 대상)
