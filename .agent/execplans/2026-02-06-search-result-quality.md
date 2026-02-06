# Execution Plan: Search Result Readability & Relevance Upgrade

## 1. Goal
검색 결과를 "파싱 텍스트 나열" 수준에서 "의미 있는 답변형 결과" 수준으로 개선한다.

## 2. Entry Points
- Search API: `GET /documents/search`
- Chunking pipeline: `app/core/pipeline.py`
- Hybrid search backend: `app/core/vector_store.py`
- Frontend result cards: `frontend/src/App.jsx`, `frontend/src/App.css`

## 3. Files-to-Touch
- `app/core/pipeline.py`: 문장/문단 기반 청크 + 비의미 텍스트 인덱싱 제외.
- `app/core/vector_store.py`: 키워드 하이라이트 유지 및 하이브리드 결과 병합 보강.
- `app/api/documents.py`: 스니펫/요약/근거문장/매칭포인트 생성 + 재랭킹.
- `frontend/src/App.jsx`: 요약/근거/매칭포인트 UI 렌더링.
- `frontend/src/App.css`: 답변형 카드 스타일 추가.

## 4. Requirements ↔ Test Mapping
| REQ-ID | Test Case | Proof (Command/Output) |
| :--- | :--- | :--- |
| SRQ-001 | 검색 결과에 매칭 중심 스니펫/강조 표시 | `GET /documents/search?q=...` 응답 `snippet` + 프론트 `<mark>` 렌더링 |
| SRQ-002 | 랭킹 품질 개선(키워드/문장 근거 기반 재정렬) | `GET /documents/search?q=...` 응답 `score`, `raw_score`, `match_points` 확인 |
| SRQ-003 | 답변형 UI(요약 + 근거문장) 노출 | `cd frontend && npm run build` 후 결과 카드 필드 렌더링 |
| SRQ-004 | 기존 검증 비회귀 | `npm run verify:fast`, `npm run verify`, `cd frontend && npm run lint && npm run build` |

## 5. Implementation Steps
1. OCR placeholder/노이즈 텍스트를 인덱싱 단계에서 배제.
2. 문자 길이 슬라이딩 청크를 문장/문단 단위 청크로 교체.
3. 검색 후보를 넓게 수집한 뒤 키워드 근거 기반 재랭킹 추가.
4. 스니펫/요약/근거문장/매칭 포인트를 API 응답으로 확장.
5. 프론트 결과 카드를 답변형 형태로 업데이트.
6. verify/lint/build 및 검색 스모크 테스트로 회귀 확인.

## 6. Rollback Plan
1. `app/core/pipeline.py`를 기존 고정 길이 청크 로직으로 복원.
2. `app/api/documents.py`에서 재랭킹/요약/근거 필드를 제거하고 기존 `snippet+score`로 복원.
3. `frontend/src/App.jsx`, `frontend/src/App.css`의 답변형 카드 요소를 제거.

## 7. Evidence
- `npm run verify:fast` -> `Syntax check passed for 12 files.`
- `npm run verify` 통과:
  - `GET /health` -> `{"status":"healthy"}`
  - `GET /health/detail` -> `status:"healthy"` + required dependency healthy
  - `POST /_analyze` (`nori_tokenizer`) -> `Nori tokens: 6`
- `cd frontend && npm run lint` 통과 (eslint 오류 없음)
- `cd frontend && npm run build` 통과:
  - `dist/assets/index-BzsnjupE.css`
  - `dist/assets/index-CHeuIbMe.js`
- 검색 스모크:
  - `GET /documents/search?q=높이로&limit=3` -> `summary`, `evidence`, `match_points`, `score/raw_score` 반환 확인
  - `GET /documents/search?q=OCR&limit=5` -> placeholder 계열 결과 제외 후 실제 문맥 결과 상위 노출 확인
