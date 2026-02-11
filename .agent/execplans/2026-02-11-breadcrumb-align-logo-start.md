# 실행 계획: 브레드크럼 시작 위치 로고 정렬

## 목표
- 브레드크럼 시작 위치를 로고 시작 위치로 정렬한다.

## 작업 단계
- [x] `SearchResults.jsx` 브레드크럼 패널 스페이서 제거
- [x] `BudgetProjectOverview.jsx` 브레드크럼 패널 스페이서 제거
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
