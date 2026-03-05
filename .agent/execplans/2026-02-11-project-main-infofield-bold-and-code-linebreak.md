# 실행 계획: 프로젝트 메인 정보 필드 굵기/코드 줄바꿈

## 목표
- 정보 필드 값 가독성을 높이고 프로젝트 코드의 줄바꿈 표시를 명확히 한다.

## 작업 단계
- [x] `InfoField` 라벨/값 스타일 조정
- [x] 고객사/위치/담당자/프로젝트 코드 값 굵기 반영 확인
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
