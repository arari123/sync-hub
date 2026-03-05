# 실행 계획: 메인 브레드크럼 서브패널 분리

## 목표
- 브레드크럼을 상단바 하단 패널로 이동하고, 상단바와 배경색을 구분한다.

## 작업 단계
- [x] `SearchResults.jsx` 헤더 내부 브레드크럼 제거
- [x] 상단바 하단 종속 패널에 브레드크럼 추가
- [x] 상단바/브레드크럼 패널 배경 및 경계선 구분 적용
- [x] 레이아웃 높이 계산 보정
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
