# 실행 계획: 프로젝트 메인 브레드크럼 메뉴 hover 개선

## 목표
- 브레드크럼 패널 메뉴 디자인 정렬 및 예산관리 hover 드롭다운 UX를 구현한다.

## 작업 단계
- [x] 메뉴 버튼 스타일을 검색 필터 세그먼트 스타일로 변경
- [x] 예산관리 버튼을 Link로 전환하고 hover 기반 하위 메뉴 노출 구현
- [x] 하위 메뉴 1행 레이아웃 적용 및 마우스 이탈 후 1초 유지 타이머 구현
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 검증 결과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'` 통과 (80 tests)
