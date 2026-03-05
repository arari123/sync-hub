# 실행 계획: 메인 페이지 테마 색상 정렬

## 목표
- 메인 페이지 색상을 `docs/code.html` 테마로 맞추고, 프론트엔드 가이드에 동일 기준을 문서화한다.

## 작업 단계
- [x] `docs/code.html` 기준 팔레트 추출 및 토큰 매핑 정의
- [x] `frontend/src/index.css` 색상 토큰 갱신
- [x] `frontend/src/pages/SearchResults.jsx` 메인 화면 색상 클래스 정렬
- [x] `docs/ai-frontend-guide.md` 색상 가이드 업데이트(기존 내용 대체)
- [x] Docker 검증 (`npm run build`, `verify:fast`)
- [x] 커밋 및 `git push`

## 검증 계획
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'`
- `docker-compose exec -T web bash -lc 'cd /app && bash scripts/verify_fast.sh'`

## 리스크
- 전역 토큰 변경으로 다른 페이지의 `bg-primary` 계열 색이 동시에 변할 수 있음
- 대응: 메인 페이지 중심으로 시각 검증하고, 토큰 사용 영역을 점검
