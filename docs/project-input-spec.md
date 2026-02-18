# Sync-Hub 프로젝트 생성 입력 스펙

이 문서는 AI가 `Sync-Hub`에서 다양한 조건의 프로젝트를 안정적으로 생성할 수 있도록, 프로젝트 기본정보부터 예산/집행 상세까지 모든 입력 항목을 정리한 기준 문서다.

## 1. 권장 생성 순서

1. `POST /budget/projects`로 프로젝트 기본정보 생성
2. `POST /budget/projects/{project_id}/versions`로 버전 생성
3. `PUT /budget/versions/{version_id}/equipments`로 설비 목록 등록
4. `PUT /budget/versions/{version_id}/details`로 재료/인건/경비 및 집행 데이터 저장
5. 필요 시 `POST /budget/versions/{version_id}/confirm`로 버전 확정
6. 확정 후 예산 변경이 필요하면 `POST /budget/versions/{version_id}/revision`로 리비전 생성

## 2. 프로젝트 기본정보 입력

### 2.1 프로젝트 생성 (`POST /budget/projects`)

| field | type | 필수 | 기본값 | 제약/허용값 | 설명 |
|---|---|---|---|---|---|
| `name` | string | Y | - | 1~120자 | 프로젝트명 |
| `code` | string | N | `null` | 최대 64자, 전체 프로젝트 유니크 | 프로젝트 코드 |
| `description` | string | N | `null` | 최대 500자 | 프로젝트 개요 |
| `project_type` | string | N | `equipment` | `equipment`, `parts`, `as` | 프로젝트 구분 |
| `parent_project_id` | integer | `as`일 때 Y | `null` | `>= 1`, `project_type=equipment`만 허용 | AS 프로젝트 소속 설비 프로젝트 ID |
| `customer_name` | string | N | `null` | 최대 180자 | 고객사 |
| `installation_site` | string | N | `null` | 최대 180자 | 설치 장소 |
| `business_trip_distance_km` | number | N | `0` | `>= 0` | 출장 거리(km, 편도) |
| `manager_user_id` | integer | N | 현재 로그인 사용자 | `>= 1`, 활성/이메일 인증 사용자만 가능 | 담당자 |
| `cover_image_url` | string | N | `null` | 최대 500자 | 프로젝트 커버 이미지 URL(`POST /budget/project-covers/upload` 결과값 권장) |

생성 시 유효성 규칙:
- `code`가 비어있지 않으면 중복 불가
- `project_type`은 허용값만 가능
- `project_type=as`(워런티)이면 `parent_project_id`는 필수이며, `project_type=equipment` 프로젝트만 선택 가능
- `project_type!=as`이면 `parent_project_id`는 허용되지 않음
- `manager_user_id`는 유효 사용자여야 함

AS 프로젝트 추가 규칙:
- `customer_name`, `installation_site`가 비어있으면 서버에서 소속 설비 프로젝트 값을 자동으로 채운다.

프로젝트 커버 이미지 파일 업로드:
- 업로드: `POST /budget/project-covers/upload` (`multipart/form-data`, 필드명 `file`)
- 허용 포맷: PNG/JPG/WEBP/GIF
- 크기 제한: 기본 5MB (`PROJECT_COVER_MAX_BYTES`로 조정 가능)
- 조회 URL: `GET /budget/project-covers/{stored_filename}` (생성/수정의 `cover_image_url`로 사용)

### 2.2 UI 전용 입력(설비 프로젝트)

`BudgetProjectCreate`와 `BudgetProjectInfoEdit`에서 `project_type=equipment`일 때 아래 UI 입력을 함께 받는다.

| field(UI) | type | 필수 | 규칙 |
|---|---|---|---|
| `equipmentInput` | string | Y(`equipment`일 때) | 쉼표/줄바꿈 기준 분리, trim, 중복 제거 |

이 값은 서버에 직접 전달되지 않고, 버전 생성 후 `PUT /versions/{id}/equipments`의 `items[].equipment_name`으로 변환되어 저장된다.

## 3. 프로젝트 수정 입력

### 3.1 프로젝트 정보 수정 (`PUT /budget/projects/{project_id}`)

아래 필드를 부분 업데이트할 수 있다.

| field | type | 필수 | 제약/허용값 |
|---|---|---|---|
| `name` | string | N | 1~120자(전송 시 비어있으면 오류) |
| `code` | string | N | 최대 64자, 타 프로젝트와 중복 불가 |
| `description` | string | N | 최대 500자 |
| `project_type` | string | N | `equipment`, `parts`, `as` |
| `parent_project_id` | integer | N | `as`일 때만 허용, `project_type=equipment`만 가능 |
| `current_stage` | string | N | `review`, `design`, `fabrication`, `installation`, `warranty`, `closure` |
| `customer_name` | string | N | 최대 180자 |
| `installation_site` | string | N | 최대 180자 |
| `business_trip_distance_km` | number | N | `>= 0` |
| `cover_image_url` | string | N | 최대 500자 |
| `manager_user_id` | integer | N | `>= 1`, 활성/이메일 인증 사용자 |

## 4. 버전/리비전 관련 입력

### 4.1 버전 생성 (`POST /budget/projects/{project_id}/versions`)

| field | type | 필수 | 기본값 | 허용값 |
|---|---|---|---|---|
| `stage` | string | N | `review` | `review`, `design`, `fabrication`, `installation`, `warranty`, `closure` |

### 4.2 리비전 생성 (`POST /budget/versions/{version_id}/revision`)

| field | type | 필수 | 제약 |
|---|---|---|---|
| `change_reason` | string | Y | 2~500자 |

## 5. 설비 목록 입력

### 5.1 설비 목록 저장 (`PUT /budget/versions/{version_id}/equipments`)

```json
{
  "items": [
    { "equipment_name": "설비 A" },
    { "equipment_name": "설비 B" }
  ]
}
```

`EquipmentItemPayload` 전체 필드:

| field | type | 필수 | 기본값 | 제약 |
|---|---|---|---|---|
| `equipment_name` | string | Y | - | 1~180자 |
| `material_fab_cost` | number | N | 0 | |
| `material_install_cost` | number | N | 0 | |
| `labor_fab_cost` | number | N | 0 | |
| `labor_install_cost` | number | N | 0 | |
| `expense_fab_cost` | number | N | 0 | |
| `expense_install_cost` | number | N | 0 | |
| `currency` | string | N | `KRW` | 최대 8자 |

실운영에서는 비용 필드는 보통 생략하고 `equipment_name`만 전달한다.

## 6. 예산/집행 상세 입력

### 6.1 상세 저장 API

`PUT /budget/versions/{version_id}/details`

```json
{
  "material_items": [],
  "labor_items": [],
  "expense_items": [],
  "execution_material_items": [],
  "execution_labor_items": [],
  "execution_expense_items": [],
  "budget_settings": {}
}
```

### 6.2 `material_items[]`

| field | type | 필수 | 기본값 | 제약 |
|---|---|---|---|---|
| `equipment_name` | string | Y | - | 1~180자 |
| `unit_name` | string | N | `""` | 최대 180자 |
| `part_name` | string | N | `""` | 최대 180자 |
| `spec` | string | N | `""` | 최대 180자 |
| `quantity` | number | N | 0 | |
| `unit_price` | number | N | 0 | |
| `executed_amount` | number | N | 0 | |
| `phase` | string | N | `fabrication` | `fabrication`/`installation` 권장 |
| `memo` | string | N | `""` | 최대 300자 |

### 6.3 `labor_items[]`

| field | type | 필수 | 기본값 | 제약 |
|---|---|---|---|---|
| `equipment_name` | string | Y | - | 1~180자 |
| `task_name` | string | N | `""` | 최대 180자 |
| `staffing_type` | string | N | `자체` | `자체`, `외주` |
| `worker_type` | string | N | `""` | 최대 120자 |
| `unit` | string | N | `H` | `H`, `D`, `W`, `M` 권장 |
| `quantity` | number | N | 0 | |
| `headcount` | number | N | 1 | |
| `location_type` | string | N | `domestic` | `domestic`, `overseas` |
| `hourly_rate` | number | N | 0 | |
| `executed_amount` | number | N | 0 | |
| `phase` | string | N | `fabrication` | `fabrication`/`installation` 권장 |
| `memo` | string | N | `""` | 최대 300자 |

### 6.4 `expense_items[]`

| field | type | 필수 | 기본값 | 제약 |
|---|---|---|---|---|
| `equipment_name` | string | Y | - | 1~180자 |
| `expense_type` | string | N | `자체` | `자체`, `외주` |
| `expense_name` | string | N | `""` | 최대 180자 |
| `basis` | string | N | `""` | 최대 180자 |
| `quantity` | number | N | 0 | |
| `amount` | number | N | 0 | |
| `is_auto` | boolean | N | `false` | |
| `auto_formula` | string | N | `""` | 최대 120자 |
| `executed_amount` | number | N | 0 | |
| `phase` | string | N | `fabrication` | `fabrication`/`installation` 권장 |
| `memo` | string | N | `""` | 최대 300자 |

참고:
- 프론트 UI의 `lock_auto`는 서버 모델 필드가 아니므로 API 공식 스펙에는 포함되지 않는다.

### 6.5 집행 전용 배열

`execution_material_items[]`, `execution_labor_items[]`, `execution_expense_items[]`는 집행금액 입력용이며, 예산 배열과 유사하되 핵심 금액 필드는 `executed_amount`다.

공통적으로 사용되는 핵심 필드:
- `equipment_name`
- `phase`
- 품목 식별 필드(`unit_name/part_name/spec` 또는 `task_name/worker_type` 또는 `expense_name/basis`)
- `executed_amount`
- `memo`

## 7. `budget_settings` 입력 키

`budget_settings`는 자유형 `dict`이며, 현재 프론트/백엔드에서 사용하는 주요 키는 아래와 같다.

| key | type | 기본값 | 의미 |
|---|---|---|---|
| `installation_locale` | string | `domestic` | 설치 국가 구분(`domestic`/`overseas`) |
| `labor_days_per_week_domestic` | number | 5 | 국내 주 환산 일수 |
| `labor_days_per_week_overseas` | number | 7 | 해외 주 환산 일수 |
| `labor_days_per_month_domestic` | number | 22 | 국내 월 환산 일수 |
| `labor_days_per_month_overseas` | number | 30 | 해외 월 환산 일수 |
| `material_unit_counts` | object | `{}` | 키=`equipment::phase::unit`, 값=유닛 개수 |
| `labor_departments` | string[] | `[PM, 설계, SW, 검사기술, 제어1, 제어2]` | 자체 인건비 부서 버튼 목록 |
| `project_overhead_ratio` | number | 3 | 프로젝트 운영비 비율(%) |
| `consumable_ratio_fabrication` | number | 2 | 제작 소모품 비율(%) |
| `consumable_ratio_installation` | number | 2 | 설치 소모품 비율(%) |
| `tool_ratio_fabrication` | number | 1 | 제작 공구비 비율(%) |
| `tool_ratio_installation` | number | 1 | 설치 공구비 비율(%) |
| `domestic_trip_daily` | number | 36000 | 국내 출장비 일단가 |
| `domestic_lodging_daily` | number | 70000 | 국내 숙박비 일단가 |
| `domestic_transport_per_km` | number | 250 | 국내 교통 km 단가 |
| `domestic_distance_km` | number | 0 | 국내 이동거리(km, 편도 입력값 기준) |
| `overseas_trip_daily` | number | 120000 | 해외 출장비 일단가 |
| `overseas_lodging_daily` | number | 200000 | 해외 숙박비 일단가 |
| `overseas_airfare_daily` | number | 350000 | 해외 항공료 일단가 |
| `overseas_transport_daily_count` | number | 1 | 해외 교통 횟수 계수 |

## 7.1 `schedule_wbs_json`(프로젝트 공통 일정) 입력 키

`budget_projects.schedule_wbs_json`은 프로젝트 공통 WBS 일정 JSON이며, 버전 상세(`budget_detail_json`)와 별도로 저장된다.

AS 프로젝트(`project_type=as`) 규칙:
- `PUT /budget/projects/{project_id}/schedule`은 허용되지 않는다(400).
- 기존 AS 프로젝트에 저장된 `schedule_wbs_json`은 데이터 정합성을 위해 마이그레이션에서 비워진다.

| key | type | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `schema_version` | string | Y | `wbs.v1` | 스키마 버전 |
| `weekend_mode` | string | Y | `exclude` | `exclude`(주말 제외) / `include`(주말 포함) |
| `anchor_date` | string(YYYY-MM-DD) | Y | 생성일 기준 오늘 | 첫 일정 자동 산정 기준일 |
| `groups` | object[] | Y | 기본 3개 루트 그룹 | 그룹 트리 |
| `rows` | object[] | Y | `[]` | 일정/이벤트 행 |
| `updated_at` | string | N | `""` | 마지막 저장 시각(ISO) |

`groups[]` 필드:

| key | type | 필수 | 설명 |
|---|---|---|---|
| `id` | string | Y | 그룹 식별자 |
| `name` | string | Y | 그룹명 |
| `stage` | string | Y | `design`/`fabrication`/`installation` |
| `parent_group_id` | string\|null | Y | 상위 그룹 ID, 루트는 `null` |
| `sort_order` | number | Y | 같은 부모 내 정렬순서 |
| `is_system` | boolean | Y | 기본 루트 그룹 여부 |

`rows[]` 필드:

| key | type | 필수 | 설명 |
|---|---|---|---|
| `id` | string | Y | 행 식별자 |
| `kind` | string | Y | `task`/`event` |
| `name` | string | Y | 일정 명칭 |
| `stage` | string | Y | 그룹과 동일 stage로 정규화 |
| `parent_group_id` | string | Y | 소속 그룹 ID(단일 소속) |
| `sort_order` | number | Y | 같은 그룹 내 정렬순서 |
| `duration_days` | number | Y | 작업일(`event`는 0 고정) |
| `start_date` | string(YYYY-MM-DD) | Y | 시작일 |
| `end_date` | string(YYYY-MM-DD) | Y | 종료일 |
| `note` | string | N | 비고 |

운영 규칙:
- 기본 루트 그룹: `stage-design`, `stage-fabrication`, `stage-installation`는 항상 존재하며 삭제/명칭 변경 불가.
- 커스텀 그룹은 동일 루트 stage 내부에서만 생성 가능.
- `event`는 항상 `duration_days=0`, `start_date=end_date`로 정규화.

## 8. 자동 계산 규칙(데이터 생성 시 반영 권장)

- 재료비: `quantity * unit_price * material_unit_counts(scope)`
- 인건비:
  - `staffing_type=자체`: `quantity * (unit->hours) * 35000 * headcount`
  - `staffing_type=외주`: `quantity * (unit->days) * 400000 * headcount`
- 경비 자동 산정 항목(`auto_formula`):
  - `project_operation`, `consumables`, `tools`, `trip`, `lodging`, `domestic_transport`, `overseas_transport`, `airfare`, `local_hire`, `dobi`, `other`
- 국내 교통비는 편도 거리(`business_trip_distance_km`)를 왕복(`*2`)으로 환산해 계산

## 9. 상태/수정 규칙

- `version.status=confirmed`인 버전은 예산 항목 구조 변경이 제한된다.
- 확정 버전에서 예산 변경이 필요하면 반드시 리비전(`change_reason` 포함) 생성 후 수정한다.
- 실행 단계(`fabrication`, `installation`, `warranty`)에서는 집행 입력(`execution_*`) 중심 운용이 권장된다.

## 10. AI 프로젝트 생성 다양성 가이드

아래 축을 조합해 데이터셋을 만든다.

| 축 | 권장 패턴 |
|---|---|
| 프로젝트 종류 | `equipment`, `parts`, `as` 혼합 |
| 설비 수 | 1개, 2~3개, 5개 이상 |
| 단계 | `review`(예산 중심), `fabrication/installation/warranty`(집행 포함) |
| 설치 국가 | `domestic`, `overseas` |
| 인건비 구성 | 자체 비중 높음, 외주 비중 높음, 혼합 |
| 경비 구성 | 자동산정 중심, 수동입력 중심, 잠금/수정 혼합 |
| 예산-집행 편차 | 집행 60%/90%/110%(초과) 시나리오 |

## 11. 최소 생성 예시

### 11.1 프로젝트 + 버전 + 설비

```json
{
  "project": {
    "name": "2차전지 라인 증설",
    "code": "BAT-EXP-2026-01",
    "project_type": "equipment",
    "customer_name": "ABC 배터리",
    "installation_site": "헝가리 공장",
    "business_trip_distance_km": 8700,
    "manager_user_id": 3,
    "description": "전극 공정 자동화 설비 증설"
  },
  "version": {
    "stage": "installation"
  },
  "equipments": {
    "items": [
      { "equipment_name": "코터 라인" },
      { "equipment_name": "슬리터 라인" }
    ]
  }
}
```

### 11.2 상세 예산/집행

```json
{
  "material_items": [
    {
      "equipment_name": "코터 라인",
      "unit_name": "헤드 유닛",
      "part_name": "서보모터",
      "spec": "3kW",
      "quantity": 4,
      "unit_price": 1200000,
      "phase": "fabrication",
      "memo": "예비 1EA 포함"
    }
  ],
  "labor_items": [
    {
      "equipment_name": "코터 라인",
      "task_name": "설치",
      "staffing_type": "외주",
      "worker_type": "기계",
      "unit": "D",
      "quantity": 12,
      "headcount": 3,
      "location_type": "overseas",
      "phase": "installation"
    }
  ],
  "expense_items": [
    {
      "equipment_name": "코터 라인",
      "expense_type": "외주",
      "expense_name": "항공료",
      "basis": "항공 횟수/MD * 350000원",
      "quantity": 10,
      "amount": 3500000,
      "is_auto": true,
      "auto_formula": "airfare",
      "phase": "installation"
    }
  ],
  "execution_material_items": [
    {
      "equipment_name": "코터 라인",
      "unit_name": "헤드 유닛",
      "part_name": "서보모터",
      "executed_amount": 4200000,
      "phase": "fabrication"
    }
  ],
  "execution_labor_items": [],
  "execution_expense_items": [],
  "budget_settings": {
    "installation_locale": "overseas",
    "labor_days_per_week_overseas": 7,
    "overseas_airfare_daily": 350000,
    "material_unit_counts": {
      "코터 라인::fabrication::헤드 유닛": 2
    }
  }
}
```
