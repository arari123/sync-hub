# 실행 계획: 프로젝트 메인 예산 하위 메뉴 우측 여백 축소

## 목표
- 예산 하위 메뉴의 우측 빈 공간을 제거하고 1행 노출을 유지한다.

## 작업 단계
- [x] 하위 메뉴 드롭다운 최소폭 제거
- [x] 1행 유지 스타일 확인
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
