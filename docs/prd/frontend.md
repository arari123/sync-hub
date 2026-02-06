# PRD: Sync-Hub Frontend MVP

## 1. 목적
사용자가 문서를 업로드하고, 자연어 검색을 통해 필요한 사내 지식을 시각적으로 편리하게 찾을 수 있는 웹 인터페이스를 제공한다.

## 2. 핵심 기능

### FE-REQ-001: 검색 인터페이스
- [AC-1] 메인 페이지 중앙에 검색창 배치 (검색 아이콘 포함).
- [AC-2] 실시간 검색어 입력 및 엔터/클릭으로 검색 트리거.
- [AC-3] 검색 엔진 응답 대기 중 로딩 애니메이션 표시.

### FE-REQ-002: 검색 결과 전시
- [AC-1] 검색 결과 리스트 표시 (문서 제목, 스니펫, 스코어 포함).
- [AC-2] 결과 스니펫 내 검색어 매칭 구간을 시각적으로 강조.
- [AC-3] 결과 카드에 핵심 요약 1줄 + 근거 문장(최대 2개) 표시.
- [AC-4] 결과가 없을 경우 안내 문구 표시.
- [AC-5] 결과 카드 클릭 시 문서 상세 정보(또는 원본 파일 경로) 표시 (MVP 수준).

### FE-REQ-003: 문서 업로드
- [AC-1] 드래그 앤 드롭 또는 파일 선택을 통한 PDF 업로드 버튼 제공.
- [AC-2] 업로드 시 진행 상태(Status)를 실시간 또는 주기적으로 확인하여 사용자에게 피드백 제공.

## 3. 디자인 컨셉
- **Aesthetics**: 다크 모드 기반의 프리미엄 디자인 (Glassmorphism 적용).
- **Typography**: 가독성 높은 모던 폰트 조합 사용 (예: Manrope + Space Grotesk).
- **Interactivity**: 부드러운 Hover 효과 및 마이크로 애니메이션.

## 4. 기술 스택
- **Framework**: React (Vite)
- **Styling**: Vanilla CSS (Modern CSS features like CSS variables, Flex/Grid)
- **State Management**: React Hooks (useState, useEffect)
- **API Client**: Fetch API or Axios
