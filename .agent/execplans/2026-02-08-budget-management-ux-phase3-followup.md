# 실행 계획: Budget Management UX Phase3 Follow-up

## 목표
- 상태 기반 예산/집행 자동 전환
- 인건비 자체/외주 및 부서 빠른 추가
- 경비 자동산정 상시 적용 + 잠금/초기화

## 작업 단계
- [x] 상태 기반 입력 모드 고정(수동 전환 제거)
- [x] 설치 기준 자동 판별 및 UI 표시(국내/해외)
- [x] 인건비 부서 입력 UI 제거 및 빠른 추가 버튼 도입
- [x] 인건비 자체/외주 구분 컬럼 추가
- [x] 경비 자동산정 로직 개선(자동갱신 + 초기화 + 잠금)
- [x] Docker 검증(`verify_fast`, `frontend build`)

## 검증 결과
- `docker-compose exec -T web bash -lc 'bash scripts/verify_fast.sh'` 통과
- `docker-compose exec -T frontend sh -lc 'cd /app && npm run build'` 통과
