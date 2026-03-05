# 실행 계획: 프로젝트 메인 브레드크럼 패널 메뉴 추가

## 목표
- 프로젝트 메인 페이지 브레드크럼 패널에 우측 섹션 메뉴를 추가하고 예산 드롭다운을 구현한다.

## 작업 단계
- [x] `BudgetProjectOverview.jsx` 브레드크럼 패널 레이아웃을 좌측 경로 + 우측 메뉴 구조로 변경
- [x] 메뉴 7종 및 예산관리 하위 3종 링크 구현
- [x] 예산 드롭다운 열림/닫힘 및 외부 클릭 닫힘 처리 구현
- [x] 우측 끝 정렬을 상단바 유저 아이콘 끝선과 일치하도록 조정
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
