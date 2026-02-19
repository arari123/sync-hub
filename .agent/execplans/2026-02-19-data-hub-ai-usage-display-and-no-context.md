# ExecPlan: 데이터 허브 AI 사용량 표시/무근거 UX 개선

## 목표
- no-context/안건 미일치 응답에서 `prompt - · output -` 오해 유발 UI 제거
- 사용자에게 모델 호출 생략 상태를 명확히 안내

## 작업 단계
1. 백엔드 응답 정규화
- `app/api/data_hub.py`
- `_agenda_not_found_response`의 `usage`를 `None`으로 변경
- no-context 응답에 `mode=rag_no_context`, `usage=None` 적용
- 성공 응답에 `mode=rag_answer` 명시

2. 프론트 렌더링 조건 보강
- `frontend/src/pages/DataHub.jsx`
- 사용량 객체에 실제 토큰 필드가 있을 때만 표시
- `rag_no_context`일 때 안내 문구 노출

3. 검증
- `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
- `docker exec -w /app synchub_frontend sh -lc 'npm run build'`

4. 배포
- Cloud Run 재배포
- Firebase Hosting 재배포

## 리스크
- 기존 캐시 응답(`usage={}`)이 남아 있어도 프론트 조건 보강으로 UI 노이즈는 제거됨.
