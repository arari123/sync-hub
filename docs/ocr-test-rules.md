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

## 권장 측정 절차
1. OCR 캐시 초기화
- `docker exec synchub_ocr sh -lc 'rm -rf /app/.cache/ocr_worker/*'`

2. 샘플 파일별 `/ocr` 호출
- 동일 파라미터로 최소 1회차(캐시 미사용) 기준 측정
- 필요 시 2회차(캐시 사용) 측정

3. 결과 기록
- 같은 문서/같은 파라미터 기준으로 이전 값과 비교
- 정책 변경 시 핸드오버 문서(`docs/session-handover-2026-02-07.md`)에 반영
