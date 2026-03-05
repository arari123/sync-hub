# 실행 계획: 메인 프로젝트 리스트 클론 레이아웃 및 프로젝트 내 검색

## 목표
- 메인 페이지 프로젝트 필터/리스트 패널을 시안 클론 레이아웃으로 전환하고, 프로젝트 내 단어 매칭 검색을 구현한다.

## 작업 단계
- [x] 시안(`docs/ex_project_list.html`) 분석 및 대응 UI 블록 정의
- [x] `SearchResults`의 필터/리스트 패널을 카드형 클론 구조로 교체
- [x] 필터 패널 검색 입력 추가 및 프로젝트 데이터 범위 단어 매칭 필터 구현
- [x] 영문 항목명 한국어 표기로 치환
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
