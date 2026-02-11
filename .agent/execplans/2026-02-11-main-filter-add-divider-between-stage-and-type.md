# 실행 계획: 메인 필터 단계/유형 사이 구분선 추가

## 목표
- 메인 필터의 단계 그룹과 유형 그룹 사이 시각 구획을 명확히 한다.

## 작업 단계
- [x] 단계 필터 그룹과 유형 필터 그룹 사이 구분선 추가
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
