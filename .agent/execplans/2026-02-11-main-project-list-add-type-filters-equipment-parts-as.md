# 실행 계획: 메인 프로젝트 타입 필터(설비/파츠/AS) 추가

## 목표
- 메인 페이지 프로젝트 필터에서 타입 기준(설비/파츠/AS) 필터링을 제공한다.

## 작업 단계
- [x] 타입 정규화/옵션 상수 추가
- [x] 타입 필터 상태 및 토글 로직 추가
- [x] 리스트 필터(useMemo) 조건에 타입 필터 반영
- [x] 필터 UI에 설비/파츠/AS 버튼 그룹 추가
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
