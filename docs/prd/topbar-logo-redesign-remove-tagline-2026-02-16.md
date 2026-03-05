# PRD: 상단 좌측 Sync-Hub 로고 리디자인 및 태그라인 제거 (2026-02-16)

## 목적
- 상단 좌측 브랜드 영역의 시각 완성도를 높여 더 강한 첫인상을 제공한다.
- 기존 보조 문구 `Industrial Knowledge Workspace`를 제거해 로고 영역을 간결하게 만든다.

## 적용 범위
- `frontend/src/components/ui/Logo.jsx`
- `frontend/src/components/GlobalTopBar.jsx`
- `frontend/src/pages/SearchResults.jsx`

## 요구사항
- REQ-001: 상단 좌측 `Sync-Hub` 로고를 기존 대비 더 강한 비주얼(아이콘/타이포)로 리디자인한다.
- REQ-002: 상단 좌측 로고 영역에서 `Industrial Knowledge Workspace` 문구를 제거한다.
- REQ-003: 홈 상단바(`SearchResults`)와 일반 상단바(`GlobalTopBar`)가 동일 로고 스타일을 사용한다.

## 수용 기준
- AC-001: 홈 상단바 좌측에 새 로고 스타일이 노출된다.
- AC-002: 일반 상단바 좌측에 동일 로고 스타일이 노출된다.
- AC-003: 상단 좌측 어디에도 `Industrial Knowledge Workspace` 텍스트가 보이지 않는다.
