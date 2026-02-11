# 실행 계획: 메인 검색 필터 단계 디자인 정렬

## 목표
- 검색 페이지 필터 버튼 디자인을 프로젝트 메인 단계 세그먼트 스타일로 통일한다.

## 작업 단계
- [x] `SearchResults.jsx` 필터 버튼 구조를 세그먼트 그룹 컨테이너 형태로 변경
- [x] 토글 버튼/단계 버튼에 프로젝트 메인 단계 스타일 적용
- [x] 필터 동작(토글/다중선택) 회귀 확인
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
