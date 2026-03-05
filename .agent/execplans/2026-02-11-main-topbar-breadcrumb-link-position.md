# 실행 계획: 메인 브레드크럼 위치/링크 개선

## 목표
- 브레드크럼을 검색창 하단으로 이동하고 클릭 이동 및 가독성을 개선한다.

## 작업 단계
- [x] 브레드크럼 렌더 순서 조정(입력창 하단)
- [x] 브레드크럼 링크 적용(클릭 이동)
- [x] 폰트 크기 소폭 확대
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`
