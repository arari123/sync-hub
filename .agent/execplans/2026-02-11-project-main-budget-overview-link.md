# 실행 계획: 프로젝트 메인 예산 대비 집행 전체 보기 링크 추가

## 목표
- 예산 대비 집행 패널 우측 상단에 예산 관리 이동 링크를 추가한다.

## 작업 단계
- [x] 링크 경로 상수 정리 및 예산 패널 상단 우측 링크 추가
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
