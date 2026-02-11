# 실행 계획: 프로젝트 메인 단계 세그먼트/메인 배지 제거

## 목표
- 프로젝트 메인 상단의 불필요한 단계 세그먼트와 메인 배지를 제거한다.

## 작업 단계
- [x] 프로젝트 상태 오른쪽 `프로젝트 메인` 배지 제거
- [x] 프로젝트 정보 우측 상단 단계 세그먼트 제거
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
