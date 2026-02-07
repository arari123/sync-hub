# OCR 테스트 규칙

## 목적
- OCR 품질/속도 회귀를 동일 기준으로 비교하기 위한 고정 테스트 샘플을 정의한다.
- 모든 OCR 테스트는 기본적으로 Docker 컨테이너 환경에서 수행한다.

## 고정 테스트 샘플셋
- 기준 경로: `uploads/`

1. `uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2.pdf`
- 유형: 텍스트 PDF
- 페이지 수: 40
- 용도: 텍스트 추출 정상 경로, preflight 동작, 텍스트 기반 처리 성능 비교

2. `uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image.pdf`
- 유형: 이미지 PDF
- 페이지 수: 40
- 용도: OCR 본 경로 품질/속도 측정, 이미지 문서 정책 검증

3. `uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image_p32.pdf`
- 유형: 이미지 PDF
- 페이지 수: 1 (원본 32p 분리본)
- 용도: 단일 페이지 OCR 파라미터 튜닝, 빠른 반복 측정

4. `uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_text_p32.pdf`
- 유형: 텍스트 PDF
- 페이지 수: 1 (원본 32p 분리본)
- 용도: 단일 페이지 preflight/텍스트 추출 기준선 측정

## 측정 시 필수 기록 항목
- `elapsed_s`
- `engine`
- `pages`
- `content_chars`
- `used_fallback`
- (색인 테스트 시) `chunk_count`
- (품질 비교 리포트) `table_chunk_count`, `table_chunk_ratio`, `top-k recall`

## 권장 측정 절차
1. OCR 캐시 초기화
- `docker exec synchub_ocr sh -lc 'rm -rf /app/.cache/ocr_worker/*'`

2. 샘플 파일별 `/ocr` 호출
- 동일 파라미터로 최소 1회차(캐시 미사용) 기준 측정
- 필요 시 2회차(캐시 사용) 측정

3. 결과 기록
- 같은 문서/같은 파라미터 기준으로 이전 값과 비교
- 정책 변경 시 핸드오버 문서(`docs/session-handover-2026-02-08.md`)에 반영

## 품질 비교 리포트 자동화
1. 실행 명령(컨테이너 내부 기준)
- `docker exec synchub_web bash -lc 'cd /app && python scripts/generate_ocr_quality_report.py --api-base http://localhost:8000 --top-k 5'`

2. 기본 대상
- 텍스트 PDF: `AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2.pdf`
- 이미지 PDF: `AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image.pdf`

3. 산출물
- 경로: `reports/ocr_quality_comparison_YYYY-mm-dd_HHMMSS.md`
- 포함 항목:
  - 문서별 `content_chars`, `chunk_count`, `table_chunk_ratio`
  - 질의 5개 기준 `top-k recall` 및 질의별 상위 문서 ID

## Excel 검색 테스트 샘플셋
- 기준 경로: `uploads/excel-test-reports/`
- 생성 스크립트: `scripts/generate_excel_test_reports.py`
- 기본 샘플 개수: 10개 (`excel_report_01_*.xlsx` ~ `excel_report_10_*.xlsx`)

### 공통 포함 필드
- 고객사
- 작성자
- 작업장소
- 대상설비
- 고객사 담당자 이름
- 작업 일자
- 작업 시간
- 작업 내용

### Excel 검색 검증 절차
1. 샘플 생성
- `docker exec synchub_web bash -lc 'cd /app && python scripts/generate_excel_test_reports.py'`

2. 업로드
- `for f in /home/arari123/sync-hub/uploads/excel-test-reports/*.xlsx; do curl -s -F \"file=@$f\" http://localhost:8001/documents/upload; echo; done`

3. 완료 상태 확인
- `curl -s http://localhost:8001/documents/search?q=고객사&limit=20`

4. 키워드 검색 확인(예시)
- `curl -s 'http://localhost:8001/documents/search?q=한빛정밀&limit=5'`
- `curl -s 'http://localhost:8001/documents/search?q=VisionFlex-Cam-12&limit=5'`
- `curl -s 'http://localhost:8001/documents/search?q=라벨 인쇄 불량&limit=5'`
