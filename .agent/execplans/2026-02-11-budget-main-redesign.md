# 실행 계획: 예산 메인 페이지 개편

## 목표
- 예산 페이지를 프로젝트 메인 상단 UX + ex_budget_detail 기반 본문 레이아웃으로 개편하고, 용어를 `예산 메인`으로 통일한다.

## 작업 단계
- [x] PRD 반영 및 요구사항 정리
- [x] 예산 페이지 상단 구조를 프로젝트 메인 스타일로 전환
- [x] 본문을 ex_budget_detail 클론 구조로 교체
- [x] 필터 동작(단계/설비/비용유형/자체·외주/검색) 연결
- [x] `예산 관리` -> `예산 메인` 명칭 통일
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests, OK)
- 반영 커밋: `f9e6e72`
