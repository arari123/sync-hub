from __future__ import annotations

from collections.abc import Iterable
import json

COST_FIELDS = (
    "material_fab_cost",
    "material_install_cost",
    "labor_fab_cost",
    "labor_install_cost",
    "expense_fab_cost",
    "expense_install_cost",
)

ALLOWED_STAGES = {
    "review": "검토",
    "fabrication": "제작",
    "installation": "설치",
    "warranty": "워런티",
    "closure": "종료",
}

ALLOWED_STATUSES = {"draft", "confirmed", "revision"}

_KOREAN_STAGE_TO_CODE = {
    "검토": "review",
    "진행": "fabrication",
    "제작": "fabrication",
    "설치": "installation",
    "워런티": "warranty",
    "보증": "warranty",
    "종료": "closure",
}

_LEGACY_STAGE_ALIAS = {
    "progress": "fabrication",
}

_PHASE_MAP = {
    "fabrication": "fabrication",
    "fab": "fabrication",
    "제작": "fabrication",
    "installation": "installation",
    "install": "installation",
    "설치": "installation",
}

_LABOR_UNIT_HOURS = {
    "H": 1.0,
    "D": 8.0,
}

_LOCATION_TYPE_MAP = {
    "domestic": "domestic",
    "국내": "domestic",
    "home": "domestic",
    "overseas": "overseas",
    "abroad": "overseas",
    "해외": "overseas",
}

_DEFAULT_BUDGET_SETTINGS = {
    "installation_locale": "domestic",
    "labor_days_per_week_domestic": 5.0,
    "labor_days_per_week_overseas": 7.0,
    "labor_days_per_month_domestic": 22.0,
    "labor_days_per_month_overseas": 30.0,
}

INHOUSE_LABOR_RATE_PER_HOUR = 35000.0
OUTSOURCE_LABOR_RATE_PER_DAY = 400000.0


def normalize_stage(stage: str) -> str:
    value = (stage or "").strip().lower()
    if value in _LEGACY_STAGE_ALIAS:
        value = _LEGACY_STAGE_ALIAS[value]
    if value in ALLOWED_STAGES:
        return value
    if stage in _KOREAN_STAGE_TO_CODE:
        return _KOREAN_STAGE_TO_CODE[stage]
    raise ValueError(f"Unsupported stage: {stage}")


def stage_label(stage: str) -> str:
    value = (stage or "").strip().lower()
    if value in _LEGACY_STAGE_ALIAS:
        value = _LEGACY_STAGE_ALIAS[value]
    return ALLOWED_STAGES.get(value, stage or "-")


def to_number(value) -> float:  # noqa: ANN001
    if value in (None, ""):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip().replace(",", ""))
    except Exception:  # noqa: BLE001
        return 0.0


def normalize_phase(phase: str) -> str:
    value = (phase or "").strip().lower()
    return _PHASE_MAP.get(value, "fabrication")


def normalize_location_type(location_type: str) -> str:
    value = (location_type or "").strip().lower()
    return _LOCATION_TYPE_MAP.get(value, "domestic")


def _setting_number(settings: dict, key: str, default_value: float) -> float:
    parsed = to_number((settings or {}).get(key))
    return parsed if parsed > 0 else default_value


def labor_unit_to_hours(unit: str, location_type: str = "domestic", settings: dict | None = None) -> float:
    value = (unit or "").strip().upper()
    if value in _LABOR_UNIT_HOURS:
        return _LABOR_UNIT_HOURS[value]

    normalized_location = normalize_location_type(location_type)
    normalized_settings = {**_DEFAULT_BUDGET_SETTINGS, **(settings or {})}
    if value == "W":
        days = _setting_number(
            normalized_settings,
            "labor_days_per_week_overseas" if normalized_location == "overseas" else "labor_days_per_week_domestic",
            7.0 if normalized_location == "overseas" else 5.0,
        )
        return days * _LABOR_UNIT_HOURS["D"]
    if value == "M":
        days = _setting_number(
            normalized_settings,
            "labor_days_per_month_overseas" if normalized_location == "overseas" else "labor_days_per_month_domestic",
            30.0 if normalized_location == "overseas" else 22.0,
        )
        return days * _LABOR_UNIT_HOURS["D"]
    return 1.0


def labor_budget_amount(item: dict, settings: dict | None = None) -> float:
    quantity = to_number(item.get("quantity"))
    headcount = to_number(item.get("headcount")) or 1.0
    location_type = normalize_location_type(
        item.get("location_type")
        or (settings or {}).get("installation_locale")
        or "domestic"
    )
    hours = labor_unit_to_hours(
        item.get("unit") or "H",
        location_type=location_type,
        settings=settings,
    )
    staffing_type = str(item.get("staffing_type") or "자체").strip()
    if staffing_type == "외주":
        days = hours / 8.0
        return quantity * days * OUTSOURCE_LABOR_RATE_PER_DAY * headcount
    return quantity * hours * INHOUSE_LABOR_RATE_PER_HOUR * headcount


def summarize_costs(items: Iterable[object]) -> dict[str, float]:
    summary = {
        "material_fab_cost": 0.0,
        "material_install_cost": 0.0,
        "labor_fab_cost": 0.0,
        "labor_install_cost": 0.0,
        "expense_fab_cost": 0.0,
        "expense_install_cost": 0.0,
    }

    for item in items:
        for field in COST_FIELDS:
            summary[field] += to_number(getattr(item, field, 0.0))

    summary["material_total"] = summary["material_fab_cost"] + summary["material_install_cost"]
    summary["labor_total"] = summary["labor_fab_cost"] + summary["labor_install_cost"]
    summary["expense_total"] = summary["expense_fab_cost"] + summary["expense_install_cost"]
    summary["fab_total"] = (
        summary["material_fab_cost"]
        + summary["labor_fab_cost"]
        + summary["expense_fab_cost"]
    )
    summary["install_total"] = (
        summary["material_install_cost"]
        + summary["labor_install_cost"]
        + summary["expense_install_cost"]
    )
    summary["grand_total"] = summary["fab_total"] + summary["install_total"]
    return summary


def default_detail_payload() -> dict:
    return {
        "material_items": [],
        "labor_items": [],
        "expense_items": [],
        "execution_material_items": [],
        "execution_labor_items": [],
        "execution_expense_items": [],
        "budget_settings": dict(_DEFAULT_BUDGET_SETTINGS),
    }


def parse_detail_payload(raw_text: str) -> dict:
    base = default_detail_payload()
    text = (raw_text or "").strip()
    if not text:
        return base
    try:
        parsed = json.loads(text)
    except Exception:  # noqa: BLE001
        return base
    if not isinstance(parsed, dict):
        return base

    for key in (
        "material_items",
        "labor_items",
        "expense_items",
        "execution_material_items",
        "execution_labor_items",
        "execution_expense_items",
    ):
        value = parsed.get(key)
        if isinstance(value, list):
            base[key] = value
    settings = parsed.get("budget_settings")
    if isinstance(settings, dict):
        base["budget_settings"] = {**_DEFAULT_BUDGET_SETTINGS, **settings}
    return base


def detail_payload_to_json(payload: dict) -> str:
    return json.dumps(
        {
            "material_items": payload.get("material_items", []),
            "labor_items": payload.get("labor_items", []),
            "expense_items": payload.get("expense_items", []),
            "execution_material_items": payload.get("execution_material_items", []),
            "execution_labor_items": payload.get("execution_labor_items", []),
            "execution_expense_items": payload.get("execution_expense_items", []),
            "budget_settings": payload.get("budget_settings", dict(_DEFAULT_BUDGET_SETTINGS)),
        },
        ensure_ascii=False,
    )


def aggregate_equipment_costs_from_detail(payload: dict) -> list[dict]:
    equipment_map: dict[str, dict] = {}
    settings = payload.get("budget_settings")
    if not isinstance(settings, dict):
        settings = {}
    material_unit_counts_raw = settings.get("material_unit_counts")
    material_unit_counts: dict[str, float] = {}
    if isinstance(material_unit_counts_raw, dict):
        for scope_key, raw_count in material_unit_counts_raw.items():
            key = str(scope_key or "").strip()
            if not key:
                continue
            count = to_number(raw_count)
            if count <= 0:
                continue
            material_unit_counts[key] = max(1.0, float(int(count)))

    def _bucket(name: str) -> dict:
        key = (name or "").strip() or "미지정 설비"
        if key not in equipment_map:
            equipment_map[key] = {
                "equipment_name": key,
                "material_fab_cost": 0.0,
                "material_install_cost": 0.0,
                "labor_fab_cost": 0.0,
                "labor_install_cost": 0.0,
                "expense_fab_cost": 0.0,
                "expense_install_cost": 0.0,
                "currency": "KRW",
            }
        return equipment_map[key]

    for item in payload.get("material_items", []):
        target = _bucket(item.get("equipment_name") or "")
        quantity = to_number(item.get("quantity"))
        unit_price = to_number(item.get("unit_price"))
        phase = normalize_phase(item.get("phase") or "fabrication")
        unit_name = str(item.get("unit_name") or item.get("part_name") or "").strip()
        unit_scope_key = (
            f"{target['equipment_name']}::{phase}::{unit_name}"
            if unit_name
            else ""
        )
        unit_count = material_unit_counts.get(unit_scope_key, 1.0)
        amount = quantity * unit_price * unit_count
        if phase == "installation":
            target["material_install_cost"] += amount
        else:
            target["material_fab_cost"] += amount

    for item in payload.get("labor_items", []):
        target = _bucket(item.get("equipment_name") or "")
        amount = labor_budget_amount(item, settings=settings)
        phase = normalize_phase(item.get("phase") or "fabrication")
        if phase == "installation":
            target["labor_install_cost"] += amount
        else:
            target["labor_fab_cost"] += amount

    for item in payload.get("expense_items", []):
        target = _bucket(item.get("equipment_name") or "")
        amount = to_number(item.get("amount"))
        phase = normalize_phase(item.get("phase") or "fabrication")
        if phase == "installation":
            target["expense_install_cost"] += amount
        else:
            target["expense_fab_cost"] += amount

    return list(equipment_map.values())


def summarize_executed_costs_from_detail(payload: dict) -> dict[str, float]:
    summary = {
        "material_fab_executed": 0.0,
        "material_install_executed": 0.0,
        "labor_fab_executed": 0.0,
        "labor_install_executed": 0.0,
        "expense_fab_executed": 0.0,
        "expense_install_executed": 0.0,
    }

    execution_material_items = payload.get("execution_material_items", []) or []
    execution_labor_items = payload.get("execution_labor_items", []) or []
    execution_expense_items = payload.get("execution_expense_items", []) or []
    has_execution_rows = bool(execution_material_items or execution_labor_items or execution_expense_items)

    source_material_items = execution_material_items if has_execution_rows else (payload.get("material_items", []) or [])
    source_labor_items = execution_labor_items if has_execution_rows else (payload.get("labor_items", []) or [])
    source_expense_items = execution_expense_items if has_execution_rows else (payload.get("expense_items", []) or [])

    for item in source_material_items:
        amount = to_number(item.get("executed_amount"))
        phase = normalize_phase(item.get("phase") or "fabrication")
        if phase == "installation":
            summary["material_install_executed"] += amount
        else:
            summary["material_fab_executed"] += amount

    for item in source_labor_items:
        amount = to_number(item.get("executed_amount"))
        phase = normalize_phase(item.get("phase") or "fabrication")
        if phase == "installation":
            summary["labor_install_executed"] += amount
        else:
            summary["labor_fab_executed"] += amount

    for item in source_expense_items:
        amount = to_number(item.get("executed_amount"))
        phase = normalize_phase(item.get("phase") or "fabrication")
        if phase == "installation":
            summary["expense_install_executed"] += amount
        else:
            summary["expense_fab_executed"] += amount

    summary["material_executed_total"] = (
        summary["material_fab_executed"] + summary["material_install_executed"]
    )
    summary["labor_executed_total"] = (
        summary["labor_fab_executed"] + summary["labor_install_executed"]
    )
    summary["expense_executed_total"] = (
        summary["expense_fab_executed"] + summary["expense_install_executed"]
    )
    summary["fab_executed_total"] = (
        summary["material_fab_executed"]
        + summary["labor_fab_executed"]
        + summary["expense_fab_executed"]
    )
    summary["install_executed_total"] = (
        summary["material_install_executed"]
        + summary["labor_install_executed"]
        + summary["expense_install_executed"]
    )
    summary["grand_executed_total"] = (
        summary["fab_executed_total"] + summary["install_executed_total"]
    )
    return summary
