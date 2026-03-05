# 실행 계획: 메인 프로젝트 리스트 상태/종류 표시

## 목표
- 메인 페이지 프로젝트 리스트에서 프로젝트 상태/종류를 명시적으로 노출한다.

## 작업 단계
- [x] 상태/종류 라벨 계산 유틸 추가
- [x] 프로젝트 테이블에 상태/종류 열 및 셀 렌더링 추가
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
