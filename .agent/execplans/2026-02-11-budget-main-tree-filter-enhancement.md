# 실행 계획: 예산 메인 트리/필터 개선

## 목표
- 예산 메인 상세 트리의 가독성을 높이고, 필터/검색/합계 고정 요구사항을 반영한다.

## 작업 단계
- [x] PRD 반영
- [x] 트리 레이아웃 정렬 개선(들여쓰기 제거, 레벨 시각 구분)
- [x] 재료비 상세 헤더 제거
- [x] `예산 상세` 명칭 변경 + 모두 접기/펼치기 토글 추가
- [x] 합계 금액 고정 기능 추가
- [x] 필터 전체 선택/해제(전역 + 단계/비용/설비) 추가
- [x] 사이드바 통합 검색(하이라이트, 필터 범위 검색, 자동 펼침) 반영
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests, OK)
- 반영 커밋: `ea13b5c`
