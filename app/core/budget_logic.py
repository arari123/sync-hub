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
    "W": 40.0,
    "M": 160.0,
}


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


def labor_unit_to_hours(unit: str) -> float:
    value = (unit or "").strip().upper()
    return _LABOR_UNIT_HOURS.get(value, 1.0)


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

    for key in ("material_items", "labor_items", "expense_items"):
        value = parsed.get(key)
        if isinstance(value, list):
            base[key] = value
    return base


def detail_payload_to_json(payload: dict) -> str:
    return json.dumps(
        {
            "material_items": payload.get("material_items", []),
            "labor_items": payload.get("labor_items", []),
            "expense_items": payload.get("expense_items", []),
        },
        ensure_ascii=False,
    )


def aggregate_equipment_costs_from_detail(payload: dict) -> list[dict]:
    equipment_map: dict[str, dict] = {}

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
        amount = quantity * unit_price
        phase = normalize_phase(item.get("phase") or "fabrication")
        if phase == "installation":
            target["material_install_cost"] += amount
        else:
            target["material_fab_cost"] += amount

    for item in payload.get("labor_items", []):
        target = _bucket(item.get("equipment_name") or "")
        quantity = to_number(item.get("quantity"))
        rate = to_number(item.get("hourly_rate"))
        factor = labor_unit_to_hours(item.get("unit") or "H")
        amount = quantity * factor * rate
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
