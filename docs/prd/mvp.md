# PRD: 사내 지식 검색 MVP (Sync-Hub)

## 1. 목적
사내의 PDF 문서들을 효율적으로 인덱싱하고, 자연어 검색(한글/영어) 및 하이브리드 검색을 통해 필요한 정보를 빠르게 찾을 수 있는 MVP를 구축한다.

## 2. 핵심 기능

### REQ-001: 문서 업로드 및 관리
- [AC-1] PDF 문서 업로드 API (`POST /documents/upload`).
- [AC-2] 업로드된 문서의 상태(대기, 처리중, 완료, 실패) 관리.
- [AC-3] Postgres DB에 문서 메타데이터 저장.

### REQ-002: 문서 파싱 파이프라인
- [AC-1] 텍스트 기반 PDF에서 직접 텍스트 추출.
- [AC-2] 스캔/이미지 PDF 판별 및 OCR provider(GLM/Ollama/Paddle) 기반 텍스트 추출.
- [AC-3] 추출된 텍스트를 의미 있는 단위(Chunk)로 분할.
- [AC-4] placeholder/비의미 텍스트는 인덱싱 대상에서 제외.

### REQ-003: 인덱싱 및 벡터화
- [AC-1] 한/영 통합 임베딩 모델을 사용하여 텍스트 청크 벡터화.
- [AC-2] Elasticsearch에 텍스트 및 벡터 저장.
- [AC-3] 한글 검색을 위해 `nori` 분석기 적용.

### REQ-004: 검색 API
- [AC-1] 키워드 기반 검색 (Elasticsearch BM25).
- [AC-2] 벡터 기반 시맨틱 검색.
- [AC-3] 하이브리드 검색 시 키워드 매칭 우선 랭킹 보장 옵션 제공.
- [AC-4] 검색 결과 스니펫은 검색어 주변 문맥을 반환해 UI 하이라이트에 활용.
- [AC-5] 검색 결과에 요약(summary)과 근거문장(evidence)을 함께 반환.

## 3. 기술 스택
- **Backend**: FastAPI
- **Database**: PostgreSQL (메타데이터), Elasticsearch (검색/벡터)
- **OCR**: GLM-OCR / Ollama / PaddleOCR-VL provider + fallback
- **Infra**: Docker, Docker Compose
- **Embedding**: HuggingFace local model (e.g., `paraphrase-multilingual-MiniLM-L12-v2`)

## 4. 제약 사항
- 로컬 환경(Windows/Docker) 구동 우선.
- GPU 워커 분리 (`docker-compose.gpu.yml`).
- 외부 API 의존성 최소화.
