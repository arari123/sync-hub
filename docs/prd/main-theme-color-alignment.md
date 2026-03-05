# 메인 페이지 테마 색상 정렬 PRD

## 배경
- 메인 페이지(`/`)가 `docs/code.html` 디자인을 기준으로 운영되고 있으며, 현재 실제 구현 색상 톤이 기준 문서와 일부 다르다.
- 프론트엔드 가이드 문서에 색상 기준이 수치(HEX)로 명확히 정의되어 있지 않아 후속 작업 시 일관성 유지가 어렵다.

## 목표
- 메인 페이지의 테마 색상을 `docs/code.html` 팔레트와 동일한 톤으로 맞춘다.
- 프론트엔드 가이드 문서에 메인 테마 색상 기준을 명시하고, 기존 색상 가이드와 충돌하는 내용은 업데이트한다.

## 기능 요구사항
1. 메인 페이지 테마 정렬
- 대상: `frontend/src/pages/SearchResults.jsx`
- 주요 UI 요소(배경, 헤더, 경계선, 주요 버튼/활성 상태, 상단 액션 아이콘)의 색상을 `docs/code.html` 테마 톤으로 정렬한다.

2. 토큰 정렬
- 대상: `frontend/src/index.css`
- `primary`, `background`, `border`, `ring` 등 핵심 토큰을 `docs/code.html` 기준 색상으로 업데이트한다.

3. 문서 반영
- 대상: `docs/ai-frontend-guide.md`
- 메인 페이지 테마 색상(HEX + 토큰 매핑 + 적용 규칙)을 명시한다.
- 기존 색상 가이드 중 신규 기준과 충돌하거나 모호한 문구는 대체한다.

## 완료 기준
- `http://localhost:8000/` 메인 페이지의 색상 톤이 `docs/code.html` 기준과 일치한다.
- 프론트엔드 가이드 문서에 새 테마 색상 기준이 반영되어 있다.
- Docker 환경에서 `npm run build`, `verify:fast`가 통과한다.
