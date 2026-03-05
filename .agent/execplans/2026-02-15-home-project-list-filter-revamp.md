# 실행 계획: 메인 프로젝트 리스트 필터 개편 (유형 → 단계)

## 범위
- 메인(`/home`) 프로젝트 리스트 필터 UI/로직 개편
- Desktop + Mobile 필터 영역 모두 반영

## 작업 항목
1. 프론트 필터 모델링 정리
   - 유형 필터를 단일 선택으로 변경(선택 시 stages 유효성 정리)
   - 단계 필터 옵션을 선택된 유형에 따라 동적으로 구성
   - 파츠/AS `시작(start)` 버킷 필터 로직 추가(= `review/closure` 제외)
2. UI 배치 변경
   - 유형 필터를 단계 필터보다 왼쪽으로 이동
   - 유형 미선택 시 단계 필터 숨김(접힘 상태)
   - 유형 선택 시 단계 필터 노출(펼침)
3. 검증
   - Docker: `docker exec -w /app synchub_web bash scripts/verify_fast.sh`
   - Docker: `docker exec -w /app synchub_frontend npm run build`
4. 커밋/푸시
   - 변경 단위를 원자적으로 커밋하고 `git push`

## 변경 파일
- `frontend/src/pages/SearchResults.jsx`
- `docs/prd/home-project-list-filter-revamp-2026-02-15.md`
- `.agent/execplans/2026-02-15-home-project-list-filter-revamp.md`

