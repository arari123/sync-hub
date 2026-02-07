# AI 디자인 가이드

## 1. 문서 목적
- 프론트 변경 시 기존 화면 톤과 정보 전달 밀도를 유지하기 위한 기준 문서다.
- 대상 코드: `frontend/src/index.css`, `frontend/src/components/*`, `frontend/src/pages/*`

## 2. 현재 디자인 방향
- 키워드: `업무형`, `고밀도`, `가독성 우선`, `부드러운 카드 UI`
- 내비 구조: 좌측 사이드바 + 우측 콘텐츠 스크롤
- 카드/필터/표현: 강한 장식보다 빠른 스캔 가능한 정보 배치 우선

## 3. 토큰 사용 규칙
- 토큰 출처: `frontend/src/index.css`
- 필수 토큰
  - 색상: `primary`, `secondary`, `muted`, `destructive`, `border`, `card`
  - 반경: `--radius` 기반 `rounded-*`
- 금지 패턴
  - 페이지별 임의 hex 색상 남발
  - 토큰 없이 인라인 스타일로 색상/여백 고정

## 4. 타이포/간격 규칙
- 타이포 밀도
  - 페이지 타이틀: `text-2xl~text-3xl`
  - 섹션 타이틀: `text-base~text-lg`
  - 라벨/메타: `text-[10px]~text-xs`
- 간격 기준
  - 페이지 간격: `space-y-5~space-y-8`
  - 카드 내부: `p-4~p-6`
  - compact 입력 높이: `h-8~h-9`

## 5. 컴포넌트 스타일 계약
- 버튼
  - `frontend/src/components/ui/Button.jsx` variants 우선 사용
  - `default`, `outline`, `ghost`, `secondary`, `destructive`
- 입력
  - `frontend/src/components/ui/Input.jsx` 스타일 문법 준수
- 카드
  - 기본: `rounded-xl/2xl border bg-card shadow-sm`
- 배지
  - 상태/타입 텍스트 + 배지 조합으로 표현(색상만 의존 금지)

## 6. 페이지 패턴

### 6.1 홈
- Hero -> 검색 -> 빠른 액션 -> 상태 위젯 순서 유지
- 빠른 액션 카드는 3개 기준 균형 레이아웃 유지

### 6.2 검색
- 상단 sticky 검색바 유지
- 결과는 `프로젝트 결과`와 `문서 결과` 섹션 분리
- 데스크톱 우측 상세 패널(sticky) 유지

### 6.3 프로젝트 관리
- 상단 요약 카드 + 필터 + 카드 그리드 구조 유지
- 필터는 작은 높이/짧은 라벨로 밀도 유지
- 프로젝트 카드는 제목/코드/담당자/고객사/진행률/상세 액션을 한 카드 안에서 소화

## 7. 인터랙션 규칙
- 클릭 가능한 요소는 hover/focus 상태가 즉시 보여야 함
- 로딩은 스피너와 텍스트를 함께 표시
- 오류는 원인과 재시도 유도 메시지를 함께 제공
- 빈 상태는 단순 문장 1줄이 아니라 안내 문구 + 다음 행동(버튼/힌트) 포함

## 8. 접근성 기준
- `focus-visible` 링 제거 금지
- 아이콘 단독 버튼은 텍스트/툴팁으로 의미 보강
- 색상만으로 상태 전달 금지(텍스트 병행)
- 주요 조작 버튼은 최소 `h-8` 이상 유지

## 9. 작업 금지 패턴
- 기존 레이아웃 체계(사이드바/콘텐츠 폭/브레드크럼)를 무시한 독립 레이아웃 추가
- 페이지마다 버튼/입력 컴포넌트 문법을 다르게 만드는 변경
- 불필요한 대형 여백으로 업무형 화면 밀도 저하
- 로딩/오류/권한 제한 상태를 숨기는 변경

## 10. 변경 체크리스트
- 변경 전
  1. 동일 역할의 기존 컴포넌트 재사용 가능 여부 확인
  2. 라우팅/상태/권한 흐름 영향 확인
- 변경 후
  1. 데스크톱/모바일에서 요소 겹침 없는지 확인
  2. 로딩/오류/빈결과 UI 확인
  3. Docker 기준 빌드 검증
     - `docker exec synchub_frontend sh -lc 'cd /app && npm run build'`

## 11. 자동 점검 규칙
- 디자인 토큰 lint 스크립트:
  - `python3 scripts/lint_frontend_design_tokens.py`
- 점검 대상:
  - `frontend/src/index.css`
  - `frontend/src/components/ui/*.jsx`
- 실패 조건:
  - UI 컴포넌트의 하드코딩 hex 색상
  - 임의 색상 class(`bg-[...]`, `text-[...]` 등) 남용
  - 인라인 color/background/borderColor 스타일
  - `index.css`의 필수 토큰/루트 변수 누락
- `verify:fast`에는 위 lint가 기본 포함되어야 한다.

## 12. 연관 문서
- `docs/ai-system-context.md`
- `docs/ai-frontend-guide.md`
- `docs/repo-map.md`
