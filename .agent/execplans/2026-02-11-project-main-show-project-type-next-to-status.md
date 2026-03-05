# 실행 계획: 프로젝트 메인 상태 옆 프로젝트 종류 표시

## 목표
- 프로젝트 제목 행에 상태 + 종류를 함께 노출한다.

## 작업 단계
- [x] 프로젝트 종류 라벨 보정 로직 추가
- [x] 상태 오른쪽 프로젝트 종류 배지 렌더링 추가
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
