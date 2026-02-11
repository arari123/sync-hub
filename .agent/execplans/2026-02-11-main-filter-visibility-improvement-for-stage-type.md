# 실행 계획: 메인 필터 단계/유형 활성 가시성 개선

## 목표
- 단계/유형 필터의 활성/비활성 시각 대비를 높여 가독성을 개선한다.

## 작업 단계
- [x] 단계/유형 필터 버튼 공통 스타일 정리
- [x] 활성 상태 스타일을 primary 채움으로 강화
- [x] 비활성 상태 대비 스타일 조정
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [ ] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests, OK)
