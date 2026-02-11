# 실행 계획: 메인 프로젝트 리스트 정렬/열 너비 튜닝

## 목표
- 지정 열 중앙 정렬과 열 너비 재배분을 통해 리스트 가독성을 개선한다.

## 작업 단계
- [x] 테이블 열 정렬 클래스 중앙 정렬 적용
- [x] 열 너비 재배분(핵심 열 확장) 적용
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
