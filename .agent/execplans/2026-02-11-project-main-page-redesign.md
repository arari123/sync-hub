# 실행 계획: 프로젝트 메인 페이지 개편

## 목표
- 프로젝트 상세 페이지를 프로젝트 메인으로 개편하고 ex project main 디자인을 실제 데이터와 연결한다.

## 작업 단계
- [x] `BudgetProjectOverview.jsx` 레이아웃을 메인 상단바 + 브레드크럼 패널 + 클론 본문으로 재구성
- [x] 실제 프로젝트 데이터 매핑(ERP-CODE, 기본정보, 예산/통계)
- [x] Timeline 임의 일정 데이터 적용, Latest issues 빈 레이아웃 적용
- [x] 브레드크럼 경로 규칙(`메인 / 글로벌 검색 > 프로젝트명(<=10자)`) 적용
- [x] '프로젝트 상세' 사용자 노출 명칭을 '프로젝트 메인'으로 통일
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
