from __future__ import annotations

from collections.abc import Iterable

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
    "progress": "진행",
    "closure": "종료",
}

ALLOWED_STATUSES = {"draft", "confirmed", "revision"}

_KOREAN_STAGE_TO_CODE = {
    "검토": "review",
    "진행": "progress",
    "종료": "closure",
}


def normalize_stage(stage: str) -> str:
    value = (stage or "").strip().lower()
    if value in ALLOWED_STAGES:
        return value
    if stage in _KOREAN_STAGE_TO_CODE:
        return _KOREAN_STAGE_TO_CODE[stage]
    raise ValueError(f"Unsupported stage: {stage}")


def stage_label(stage: str) -> str:
    return ALLOWED_STAGES.get((stage or "").strip().lower(), stage or "-")


def to_number(value) -> float:  # noqa: ANN001
    if value in (None, ""):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip().replace(",", ""))
    except Exception:  # noqa: BLE001
        return 0.0


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
