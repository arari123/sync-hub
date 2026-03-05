# 실행 계획: 메인 상단바 브레드크럼 추가

## 목표
- 메인 상단바에 브레드크럼을 추가하고 검색 입력 시작 위치와 정렬을 일치시킨다.

## 작업 단계
- [x] 헤더 레이아웃 구조 확인 및 브레드크럼 삽입 위치 확정
- [x] `SearchResults.jsx` 상단바에 브레드크럼 UI 추가
- [x] 헤더 높이/본문 높이 계산 보정
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
