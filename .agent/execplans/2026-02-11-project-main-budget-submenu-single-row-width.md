# 실행 계획: 프로젝트 메인 예산 하위 메뉴 1행 고정

## 목표
- 예산 하위 메뉴 드롭다운 폭을 넓혀 모든 메뉴를 1행으로 표시한다.

## 작업 단계
- [x] 드롭다운 컨테이너 폭 확장 스타일 적용
- [x] 하위 메뉴 줄바꿈 방지 스타일 적용
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
