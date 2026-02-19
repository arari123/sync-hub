# ExecPlan: 프로젝트 데이터 업로드 후 폴링 깜빡임 수정

## 목표
- 업로드 상태 자동 갱신은 유지하되 폴링 주기마다 발생하는 로딩 깜빡임 제거

## 단계
1. `frontend/src/pages/BudgetProjectData.jsx` 수정
- `loadFiles`에 `silent` 파라미터 추가
- `silent=true`일 때 `isFileLoading`/에러 토글 생략
- 업로드 후 상태 폴링 useEffect에서 `silent: true`로 호출

2. 검증
- `verify_fast` 실행

3. 배포
- 프론트 빌드 + Firebase Hosting 배포
