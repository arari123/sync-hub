from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, exists, func, or_
from sqlalchemy.orm import Session

from .. import models
from ..core.auth_utils import parse_iso, to_iso, utcnow
from ..core.budget_logic import (
    aggregate_equipment_costs_from_detail,
    default_detail_payload,
    detail_payload_to_json,
    normalize_phase,
    normalize_stage,
    parse_detail_payload,
    stage_label,
    summarize_executed_costs_from_detail,
    summarize_costs,
    to_number,
)
from .auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/budget", tags=["budget"])

_PROJECT_TYPE_LABELS = {
    "equipment": "설비",
    "parts": "파츠",
    "as": "AS",
}

_PROJECT_TYPE_TO_CODE = {
    "설비": "equipment",
    "equipment": "equipment",
    "eq": "equipment",
    "파츠": "parts",
    "부품": "parts",
    "parts": "parts",
    "워런티": "as",
    "유지보수": "as",
    "a/s": "as",
    "warranty": "as",
    "as": "as",
}

_SEARCH_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")
_SEARCH_STOPWORDS = {
    # Field-hint tokens that users often prepend (e.g., "담당자 이용호").
    "담당자",
    "담당",
    "매니저",
    "manager",
    "pm",
    "고객사",
    "고객",
    "프로젝트",
    "프로젝트명",
    "프로젝트코드",
    "코드",
    "설비",
    "설비명",
}
_DEFAULT_PROJECT_SORT = "updated_desc"
_ALLOWED_PROJECT_SORTS = {
    "updated_desc",
    "updated_asc",
    "name_desc",
    "name_asc",
}
_PROJECT_SORT_ALIASES = {
    "updated": "updated_desc",
    "updated_at_desc": "updated_desc",
    "updated_at_asc": "updated_asc",
}
_RAW_ADMIN_IDENTIFIERS = os.getenv("BUDGET_ADMIN_IDENTIFIERS", "admin,admin@example.com")
_ADMIN_IDENTIFIERS = {
    token.strip().lower()
    for token in _RAW_ADMIN_IDENTIFIERS.split(",")
    if token.strip()
}
_EXECUTION_ONLY_STAGES = {"fabrication", "installation", "warranty", "closure"}
_REVIEW_STAGE = "review"
_SCHEDULE_SCHEMA_VERSION = "wbs.v1"
_SCHEDULE_STAGE_ORDER = ("design", "fabrication", "installation")
_SCHEDULE_STAGE_LABELS = {
    "design": "설계",
    "fabrication": "제작",
    "installation": "설치",
}
_SCHEDULE_STAGE_ALIASES = {
    "design": "design",
    "설계": "design",
    "fabrication": "fabrication",
    "제작": "fabrication",
    "installation": "installation",
    "install": "installation",
    "설치": "installation",
}
_SCHEDULE_WEEKEND_MODES = {"exclude", "include"}
_SCHEDULE_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SCHEDULE_ROOT_GROUP_IDS = {
    stage: f"stage-{stage}"
    for stage in _SCHEDULE_STAGE_ORDER
}


def _budget_settings_lock_signature(settings: Any) -> tuple:
    """Return stable signature for settings that affect budget calculations.

    In execution-only stages we lock these values to prevent budget drift while
    users input executed amounts.
    """

    normalized = settings if isinstance(settings, dict) else {}

    locale_raw = str(normalized.get("installation_locale") or "domestic").strip().lower()
    installation_locale = "overseas" if locale_raw in {"overseas", "abroad", "해외"} else "domestic"

    def _positive_or(value: Any, default_value: float) -> float:
        parsed = to_number(value)
        return float(parsed) if parsed > 0 else float(default_value)

    material_unit_counts_raw = normalized.get("material_unit_counts")
    material_unit_counts: list[tuple[str, int]] = []
    if isinstance(material_unit_counts_raw, dict):
        for scope_key, raw_count in material_unit_counts_raw.items():
            key = str(scope_key or "").strip()
            if not key:
                continue
            count = int(to_number(raw_count))
            if count <= 1:
                continue
            material_unit_counts.append((key, count))
    material_unit_counts.sort()

    return (
        installation_locale,
        _positive_or(normalized.get("labor_days_per_week_domestic"), 5.0),
        _positive_or(normalized.get("labor_days_per_week_overseas"), 7.0),
        _positive_or(normalized.get("labor_days_per_month_domestic"), 22.0),
        _positive_or(normalized.get("labor_days_per_month_overseas"), 30.0),
        tuple(material_unit_counts),
    )


def _has_nonzero_executed_amounts(detail_payload: dict) -> bool:
    for key in (
        "material_items",
        "labor_items",
        "expense_items",
        "execution_material_items",
        "execution_labor_items",
        "execution_expense_items",
    ):
        rows = detail_payload.get(key) or []
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            if to_number(row.get("executed_amount")) > 0:
                return True
    return False


def _effective_stage_for_project(project: models.BudgetProject, version: models.BudgetVersion) -> str:
    raw_value = project.current_stage or version.stage or _REVIEW_STAGE
    try:
        return normalize_stage(raw_value)
    except ValueError:
        return _REVIEW_STAGE


class BudgetProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    project_type: Optional[str] = Field(default="equipment", max_length=32)
    parent_project_id: Optional[int] = Field(default=None, ge=1)
    customer_name: Optional[str] = Field(default=None, max_length=180)
    installation_site: Optional[str] = Field(default=None, max_length=180)
    business_trip_distance_km: Optional[float] = Field(default=0, ge=0)
    manager_user_id: Optional[int] = Field(default=None, ge=1)


class BudgetProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    project_type: Optional[str] = Field(default=None, max_length=32)
    parent_project_id: Optional[int] = Field(default=None, ge=1)
    customer_name: Optional[str] = Field(default=None, max_length=180)
    installation_site: Optional[str] = Field(default=None, max_length=180)
    business_trip_distance_km: Optional[float] = Field(default=None, ge=0)
    manager_user_id: Optional[int] = Field(default=None, ge=1)
    cover_image_url: Optional[str] = Field(default=None, max_length=500)
    current_stage: Optional[str] = Field(default=None, max_length=32)


class BudgetVersionCreate(BaseModel):
    stage: str = Field(default="review", max_length=32)


class BudgetRevisionCreate(BaseModel):
    change_reason: str = Field(..., min_length=2, max_length=500)


class EquipmentItemPayload(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    material_fab_cost: float = 0.0
    material_install_cost: float = 0.0
    labor_fab_cost: float = 0.0
    labor_install_cost: float = 0.0
    expense_fab_cost: float = 0.0
    expense_install_cost: float = 0.0
    currency: str = Field(default="KRW", max_length=8)


class EquipmentBulkPayload(BaseModel):
    items: list[EquipmentItemPayload]


class MaterialDetailItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    unit_name: str = Field(default="", max_length=180)
    part_name: str = Field(default="", max_length=180)
    spec: str = Field(default="", max_length=180)
    quantity: float = 0.0
    unit_price: float = 0.0
    executed_amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class LaborDetailItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    task_name: str = Field(default="", max_length=180)
    staffing_type: str = Field(default="자체", max_length=16)
    worker_type: str = Field(default="", max_length=120)
    unit: str = Field(default="H", max_length=8)
    quantity: float = 0.0
    headcount: float = 1.0
    location_type: str = Field(default="domestic", max_length=32)
    hourly_rate: float = 0.0
    executed_amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class ExpenseDetailItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    expense_type: str = Field(default="자체", max_length=16)
    expense_name: str = Field(default="", max_length=180)
    basis: str = Field(default="", max_length=180)
    quantity: float = 0.0
    amount: float = 0.0
    is_auto: bool = False
    auto_formula: str = Field(default="", max_length=120)
    executed_amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class MaterialExecutionItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    unit_name: str = Field(default="", max_length=180)
    part_name: str = Field(default="", max_length=180)
    spec: str = Field(default="", max_length=180)
    executed_amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class LaborExecutionItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    task_name: str = Field(default="", max_length=180)
    staffing_type: str = Field(default="자체", max_length=16)
    worker_type: str = Field(default="", max_length=120)
    executed_amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class ExpenseExecutionItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    expense_type: str = Field(default="자체", max_length=16)
    expense_name: str = Field(default="", max_length=180)
    basis: str = Field(default="", max_length=180)
    executed_amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class BudgetDetailPayload(BaseModel):
    material_items: list[MaterialDetailItem] = Field(default_factory=list)
    labor_items: list[LaborDetailItem] = Field(default_factory=list)
    expense_items: list[ExpenseDetailItem] = Field(default_factory=list)
    execution_material_items: list[MaterialExecutionItem] = Field(default_factory=list)
    execution_labor_items: list[LaborExecutionItem] = Field(default_factory=list)
    execution_expense_items: list[ExpenseExecutionItem] = Field(default_factory=list)
    budget_settings: dict[str, Any] = Field(default_factory=dict)


class ScheduleGroupPayload(BaseModel):
    id: str = Field(default="", max_length=80)
    name: str = Field(default="", max_length=120)
    stage: str = Field(default="design", max_length=32)
    parent_group_id: Optional[str] = Field(default=None, max_length=80)
    sort_order: int = 0
    is_system: bool = False


class ScheduleRowPayload(BaseModel):
    id: str = Field(default="", max_length=80)
    kind: str = Field(default="task", max_length=16)
    name: str = Field(default="", max_length=180)
    stage: str = Field(default="design", max_length=32)
    parent_group_id: str = Field(default="", max_length=80)
    sort_order: int = 0
    duration_days: int = 1
    start_date: str = Field(default="", max_length=16)
    end_date: str = Field(default="", max_length=16)
    note: str = Field(default="", max_length=500)


class BudgetProjectSchedulePayload(BaseModel):
    schema_version: str = Field(default=_SCHEDULE_SCHEMA_VERSION, max_length=32)
    weekend_mode: str = Field(default="exclude", max_length=16)
    anchor_date: str = Field(..., min_length=10, max_length=10)
    groups: list[ScheduleGroupPayload] = Field(default_factory=list)
    rows: list[ScheduleRowPayload] = Field(default_factory=list)
    updated_at: Optional[str] = Field(default=None, max_length=64)


def _get_project_or_404(project_id: int, db: Session) -> models.BudgetProject:
    project = db.query(models.BudgetProject).filter(models.BudgetProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


def _get_version_or_404(version_id: int, db: Session) -> models.BudgetVersion:
    version = db.query(models.BudgetVersion).filter(models.BudgetVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    return version


def _version_equipments(version_id: int, db: Session) -> list[models.BudgetEquipment]:
    return (
        db.query(models.BudgetEquipment)
        .filter(models.BudgetEquipment.version_id == version_id)
        .order_by(models.BudgetEquipment.sort_order.asc(), models.BudgetEquipment.id.asc())
        .all()
    )


def _replace_equipments_from_aggregate(
    version: models.BudgetVersion,
    aggregated_items: list[dict],
    db: Session,
    now_iso: str,
) -> None:
    (
        db.query(models.BudgetEquipment)
        .filter(models.BudgetEquipment.version_id == version.id)
        .delete(synchronize_session=False)
    )

    for index, item in enumerate(aggregated_items):
        db.add(
            models.BudgetEquipment(
                version_id=version.id,
                equipment_name=(item.get("equipment_name") or "").strip() or "미지정 설비",
                material_fab_cost=to_number(item.get("material_fab_cost")),
                material_install_cost=to_number(item.get("material_install_cost")),
                labor_fab_cost=to_number(item.get("labor_fab_cost")),
                labor_install_cost=to_number(item.get("labor_install_cost")),
                expense_fab_cost=to_number(item.get("expense_fab_cost")),
                expense_install_cost=to_number(item.get("expense_install_cost")),
                currency=(item.get("currency") or "KRW").strip() or "KRW",
                sort_order=index,
                created_at=now_iso,
                updated_at=now_iso,
            )
        )


def _sync_detail_with_equipment_names(detail_dict: dict, equipment_names: list[str]) -> dict:
    allowed_names = [
        (name or "").strip()
        for name in equipment_names
        if (name or "").strip()
    ]
    allowed_set = set(allowed_names)
    fallback_name = allowed_names[0] if allowed_names else ""
    result = {
        "material_items": [],
        "labor_items": [],
        "expense_items": [],
        "execution_material_items": [],
        "execution_labor_items": [],
        "execution_expense_items": [],
        "budget_settings": dict(detail_dict.get("budget_settings") or {}),
    }
    for key in (
        "material_items",
        "labor_items",
        "expense_items",
        "execution_material_items",
        "execution_labor_items",
        "execution_expense_items",
    ):
        rows = detail_dict.get(key) or []
        if not isinstance(rows, list):
            continue
        filtered_rows: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            equipment_name = (row.get("equipment_name") or "").strip()
            if not equipment_name and fallback_name:
                equipment_name = fallback_name
            if equipment_name not in allowed_set:
                continue
            filtered_rows.append({**row, "equipment_name": equipment_name})
        result[key] = filtered_rows
    return result


def _serialize_version(version: models.BudgetVersion, db: Session) -> dict:
    equipments = _version_equipments(version.id, db)
    totals = summarize_costs(equipments)
    detail_payload = parse_detail_payload(version.budget_detail_json or "")
    return {
        "id": int(version.id),
        "project_id": int(version.project_id),
        "stage": version.stage,
        "stage_label": stage_label(version.stage),
        "status": version.status,
        "version_no": int(version.version_no),
        "revision_no": int(version.revision_no),
        "parent_version_id": version.parent_version_id,
        "change_reason": version.change_reason or "",
        "is_current": bool(version.is_current),
        "confirmed_at": version.confirmed_at,
        "created_at": version.created_at,
        "updated_at": version.updated_at,
        "equipment_count": len(equipments),
        "material_item_count": len(detail_payload.get("material_items", [])),
        "labor_item_count": len(detail_payload.get("labor_items", [])),
        "expense_item_count": len(detail_payload.get("expense_items", [])),
        "execution_material_item_count": len(detail_payload.get("execution_material_items", [])),
        "execution_labor_item_count": len(detail_payload.get("execution_labor_items", [])),
        "execution_expense_item_count": len(detail_payload.get("execution_expense_items", [])),
        "totals": totals,
    }


def _user_display_name(user: Optional[models.User], empty_label: str = "담당자 미지정") -> str:
    if not user:
        return empty_label
    full_name = (user.full_name or "").strip()
    return full_name or user.email


def _project_owner(project: models.BudgetProject, db: Session) -> Optional[models.User]:
    if not project.created_by_user_id:
        return None
    return db.query(models.User).filter(models.User.id == project.created_by_user_id).first()


def _project_manager_user_id(project: models.BudgetProject) -> Optional[int]:
    if project.manager_user_id is not None:
        return int(project.manager_user_id)
    if project.created_by_user_id is not None:
        return int(project.created_by_user_id)
    return None


def _project_manager(project: models.BudgetProject, db: Session) -> Optional[models.User]:
    manager_user_id = _project_manager_user_id(project)
    if manager_user_id is None:
        return None
    return db.query(models.User).filter(models.User.id == manager_user_id).first()


def _normalize_project_type(value: Optional[str]) -> str:
    key = (value or "").strip().lower()
    if not key:
        return "equipment"
    if key in _PROJECT_TYPE_TO_CODE:
        return _PROJECT_TYPE_TO_CODE[key]
    raise ValueError(f"Unsupported project_type: {value}")


def _project_type_label(value: Optional[str]) -> str:
    try:
        normalized = _normalize_project_type(value)
    except ValueError:
        return "미분류"
    return _PROJECT_TYPE_LABELS.get(normalized, "미분류")


def _project_type_code_or_empty(value: Optional[str]) -> str:
    try:
        return _normalize_project_type(value)
    except ValueError:
        return ""


def _project_stage_rank(stage: Optional[str]) -> int:
    order = {
        "review": 0,
        "design": 1,
        "fabrication": 2,
        "installation": 3,
        "warranty": 4,
        "closure": 5,
    }
    return order.get((stage or "").strip().lower(), 0)


def _normalize_schedule_stage(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return _SCHEDULE_STAGE_ALIASES.get(normalized, "design")


def _schedule_default_anchor_date() -> str:
    return utcnow().date().isoformat()


def _parse_schedule_date(value: Any) -> Optional[date]:
    text = str(value or "").strip()
    if not _SCHEDULE_DATE_PATTERN.match(text):
        return None
    try:
        return date.fromisoformat(text)
    except Exception:  # noqa: BLE001
        return None


def _format_schedule_date(value: date) -> str:
    return value.isoformat()


def _is_weekend(target: date) -> bool:
    return target.weekday() >= 5


def _schedule_next_day(current: date, weekend_mode: str) -> date:
    cursor = current + timedelta(days=1)
    if weekend_mode == "include":
        return cursor
    while _is_weekend(cursor):
        cursor += timedelta(days=1)
    return cursor


def _schedule_duration_from_dates(start: date, end: date, weekend_mode: str) -> int:
    if end < start:
        return 1
    if weekend_mode == "include":
        return max(1, (end - start).days + 1)

    count = 0
    cursor = start
    while cursor <= end:
        if not _is_weekend(cursor):
            count += 1
        cursor += timedelta(days=1)
    return max(1, count)


def _schedule_end_from_duration(start: date, duration_days: int, weekend_mode: str) -> date:
    duration = max(1, int(duration_days or 1))
    if weekend_mode == "include":
        return start + timedelta(days=duration - 1)

    remaining = duration - 1
    cursor = start
    while remaining > 0:
        cursor += timedelta(days=1)
        if _is_weekend(cursor):
            continue
        remaining -= 1
    return cursor


def _schedule_unique_id(raw_value: Any, prefix: str, sequence_no: int, used: set[str]) -> str:
    text = str(raw_value or "").strip()
    if text:
        candidate = text
    else:
        candidate = f"{prefix}-{sequence_no}"
    if candidate not in used:
        used.add(candidate)
        return candidate

    index = 2
    while True:
        next_candidate = f"{candidate}-{index}"
        if next_candidate not in used:
            used.add(next_candidate)
            return next_candidate
        index += 1


def _build_default_schedule_wbs_payload(anchor_date: Optional[str] = None) -> dict:
    parsed_anchor = _parse_schedule_date(anchor_date) if anchor_date else None
    safe_anchor = parsed_anchor.isoformat() if parsed_anchor else _schedule_default_anchor_date()
    return {
        "schema_version": _SCHEDULE_SCHEMA_VERSION,
        "weekend_mode": "exclude",
        "anchor_date": safe_anchor,
        "groups": [
            {
                "id": _SCHEDULE_ROOT_GROUP_IDS[stage],
                "name": _SCHEDULE_STAGE_LABELS[stage],
                "stage": stage,
                "parent_group_id": None,
                "sort_order": index,
                "is_system": True,
            }
            for index, stage in enumerate(_SCHEDULE_STAGE_ORDER)
        ],
        "rows": [],
        "updated_at": "",
    }


def _normalize_schedule_wbs_payload(payload: dict[str, Any], *, strict_anchor: bool) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Invalid schedule payload.")

    weekend_mode = str(payload.get("weekend_mode") or "exclude").strip().lower()
    if weekend_mode not in _SCHEDULE_WEEKEND_MODES:
        weekend_mode = "exclude"

    parsed_anchor = _parse_schedule_date(payload.get("anchor_date"))
    if strict_anchor and not parsed_anchor:
        raise ValueError("anchor_date is required. (YYYY-MM-DD)")
    if not parsed_anchor:
        parsed_anchor = _parse_schedule_date(_schedule_default_anchor_date())
    if parsed_anchor is None:
        raise ValueError("Failed to resolve anchor_date.")
    anchor_date = _format_schedule_date(parsed_anchor)

    root_groups = [
        {
            "id": _SCHEDULE_ROOT_GROUP_IDS[stage],
            "name": _SCHEDULE_STAGE_LABELS[stage],
            "stage": stage,
            "parent_group_id": None,
            "sort_order": stage_index,
            "is_system": True,
        }
        for stage_index, stage in enumerate(_SCHEDULE_STAGE_ORDER)
    ]

    used_group_ids = {item["id"] for item in root_groups}
    raw_groups = payload.get("groups")
    custom_groups: list[dict[str, Any]] = []
    for index, item in enumerate(raw_groups if isinstance(raw_groups, list) else []):
        if not isinstance(item, dict):
            continue
        stage = _normalize_schedule_stage(item.get("stage"))
        raw_group_id = str(item.get("id") or "").strip()
        if raw_group_id in _SCHEDULE_ROOT_GROUP_IDS.values():
            continue
        group_id = _schedule_unique_id(raw_group_id, f"group-{stage}", index + 1, used_group_ids)
        name = str(item.get("name") or "").strip() or "그룹"
        raw_parent = str(item.get("parent_group_id") or "").strip() or None
        custom_groups.append(
            {
                "id": group_id,
                "name": name,
                "stage": stage,
                "raw_parent_group_id": raw_parent,
                "parent_group_id": _SCHEDULE_ROOT_GROUP_IDS[stage],
                "sort_order": int(to_number(item.get("sort_order"))),
                "is_system": False,
            }
        )

    custom_group_map = {item["id"]: item for item in custom_groups}
    root_stage_by_group_id = {
        group_id: stage
        for stage, group_id in _SCHEDULE_ROOT_GROUP_IDS.items()
    }
    for group in custom_groups:
        stage = group["stage"]
        default_parent = _SCHEDULE_ROOT_GROUP_IDS[stage]
        parent_id = group["raw_parent_group_id"]
        if not parent_id:
            group["parent_group_id"] = default_parent
            continue
        if parent_id in root_stage_by_group_id:
            group["parent_group_id"] = parent_id if root_stage_by_group_id[parent_id] == stage else default_parent
            continue
        parent_group = custom_group_map.get(parent_id)
        if not parent_group or parent_group["stage"] != stage:
            group["parent_group_id"] = default_parent
            continue
        group["parent_group_id"] = parent_id

    for group in custom_groups:
        stage = group["stage"]
        default_parent = _SCHEDULE_ROOT_GROUP_IDS[stage]
        visited = {group["id"]}
        cursor = group["parent_group_id"]
        while cursor in custom_group_map:
            if cursor in visited:
                group["parent_group_id"] = default_parent
                break
            visited.add(cursor)
            cursor = custom_group_map[cursor]["parent_group_id"]

    custom_groups_by_parent: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for group in custom_groups:
        key = (group["stage"], group["parent_group_id"])
        custom_groups_by_parent.setdefault(key, []).append(group)

    for siblings in custom_groups_by_parent.values():
        siblings.sort(key=lambda item: (item.get("sort_order", 0), item["name"], item["id"]))
        for sibling_index, sibling in enumerate(siblings):
            sibling["sort_order"] = sibling_index

    normalized_groups = [*root_groups]
    custom_children_map: dict[str, list[dict[str, Any]]] = {}
    for group in custom_groups:
        custom_children_map.setdefault(group["parent_group_id"], []).append(group)

    for children in custom_children_map.values():
        children.sort(key=lambda item: (item.get("sort_order", 0), item["name"], item["id"]))

    def _append_custom_group_tree(parent_group_id: str) -> None:
        for child in custom_children_map.get(parent_group_id, []):
            normalized_groups.append(
                {
                    "id": child["id"],
                    "name": child["name"],
                    "stage": child["stage"],
                    "parent_group_id": child["parent_group_id"],
                    "sort_order": child["sort_order"],
                    "is_system": False,
                }
            )
            _append_custom_group_tree(child["id"])

    for stage in _SCHEDULE_STAGE_ORDER:
        _append_custom_group_tree(_SCHEDULE_ROOT_GROUP_IDS[stage])

    normalized_group_map = {group["id"]: group for group in normalized_groups}
    used_row_ids: set[str] = set()
    raw_rows = payload.get("rows")
    parsed_rows: list[dict[str, Any]] = []
    for row_index, item in enumerate(raw_rows if isinstance(raw_rows, list) else []):
        if not isinstance(item, dict):
            continue
        stage = _normalize_schedule_stage(item.get("stage"))
        parent_group_id = str(item.get("parent_group_id") or "").strip()
        parent_group = normalized_group_map.get(parent_group_id)
        if not parent_group:
            parent_group_id = _SCHEDULE_ROOT_GROUP_IDS[stage]
            parent_group = normalized_group_map[parent_group_id]
        if parent_group["stage"] != stage:
            stage = parent_group["stage"]

        row_id = _schedule_unique_id(item.get("id"), "row", row_index + 1, used_row_ids)
        kind = "event" if str(item.get("kind") or "").strip().lower() == "event" else "task"
        if "name" in item:
            name = str(item.get("name") or "").strip()
        else:
            name = "이벤트" if kind == "event" else "일정"
        note = str(item.get("note") or "").strip()
        start_date = _parse_schedule_date(item.get("start_date"))
        end_date = _parse_schedule_date(item.get("end_date"))
        duration_days = int(to_number(item.get("duration_days")))

        if kind == "event":
            duration_days = 0
            if start_date is None:
                start_date = end_date or parsed_anchor
            end_date = start_date
        else:
            if duration_days <= 0:
                duration_days = 1
            if start_date and end_date:
                if end_date < start_date:
                    end_date = start_date
                duration_days = _schedule_duration_from_dates(start_date, end_date, weekend_mode)
            elif start_date and not end_date:
                end_date = start_date
                duration_days = 1
            elif not start_date and end_date:
                start_date = end_date
                duration_days = 1
            else:
                start_date = parsed_anchor
                end_date = _schedule_end_from_duration(start_date, duration_days, weekend_mode)

        parsed_rows.append(
            {
                "id": row_id,
                "kind": kind,
                "name": name,
                "stage": stage,
                "parent_group_id": parent_group_id,
                "sort_order": int(to_number(item.get("sort_order"))),
                "duration_days": duration_days,
                "start_date": _format_schedule_date(start_date) if start_date else "",
                "end_date": _format_schedule_date(end_date) if end_date else "",
                "note": note,
            }
        )

    rows_by_parent: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in parsed_rows:
        key = (row["stage"], row["parent_group_id"])
        rows_by_parent.setdefault(key, []).append(row)

    for siblings in rows_by_parent.values():
        siblings.sort(key=lambda item: (item.get("sort_order", 0), item["name"], item["id"]))
        for sibling_index, sibling in enumerate(siblings):
            sibling["sort_order"] = sibling_index

    groups_by_parent: dict[str, list[dict[str, Any]]] = {}
    for group in normalized_groups:
        groups_by_parent.setdefault(group["parent_group_id"] or "", []).append(group)

    for children in groups_by_parent.values():
        children.sort(key=lambda item: (item.get("sort_order", 0), item["name"], item["id"]))

    normalized_rows: list[dict[str, Any]] = []

    def _append_rows_by_group(group_id: str) -> None:
        current_group = normalized_group_map.get(group_id)
        if current_group:
            stage = current_group["stage"]
            normalized_rows.extend(rows_by_parent.get((stage, group_id), []))
        for child_group in groups_by_parent.get(group_id, []):
            if child_group["id"] == group_id:
                continue
            _append_rows_by_group(child_group["id"])

    for stage in _SCHEDULE_STAGE_ORDER:
        _append_rows_by_group(_SCHEDULE_ROOT_GROUP_IDS[stage])

    return {
        "schema_version": _SCHEDULE_SCHEMA_VERSION,
        "weekend_mode": weekend_mode,
        "anchor_date": anchor_date,
        "groups": normalized_groups,
        "rows": normalized_rows,
        "updated_at": str(payload.get("updated_at") or "").strip(),
    }


def _parse_schedule_wbs_payload(raw_text: Optional[str]) -> dict[str, Any]:
    text = (raw_text or "").strip()
    if not text:
        return _build_default_schedule_wbs_payload()
    try:
        parsed = json.loads(text)
    except Exception:  # noqa: BLE001
        return _build_default_schedule_wbs_payload()
    if not isinstance(parsed, dict):
        return _build_default_schedule_wbs_payload()
    try:
        return _normalize_schedule_wbs_payload(parsed, strict_anchor=False)
    except Exception:  # noqa: BLE001
        return _build_default_schedule_wbs_payload()


def _build_monitoring_payload(
    project: models.BudgetProject,
    totals: dict,
    executed_summary: Optional[dict] = None,
) -> dict:
    confirmed_material = to_number(totals.get("material_total"))
    confirmed_labor = to_number(totals.get("labor_total"))
    confirmed_expense = to_number(totals.get("expense_total"))
    confirmed_budget_total = to_number(totals.get("grand_total"))
    executed_material = to_number((executed_summary or {}).get("material_executed_total"))
    executed_labor = to_number((executed_summary or {}).get("labor_executed_total"))
    executed_expense = to_number((executed_summary or {}).get("expense_executed_total"))
    executed_total = executed_material + executed_labor + executed_expense

    try:
        current_stage = normalize_stage(project.current_stage or _REVIEW_STAGE)
    except Exception:  # noqa: BLE001
        current_stage = _REVIEW_STAGE

    # Business rule: review stage cannot have executed amounts.
    if current_stage == _REVIEW_STAGE:
        executed_material = 0.0
        executed_labor = 0.0
        executed_expense = 0.0
        executed_total = 0.0

    if executed_total > 0:
        actual_spent_material = round(executed_material, 2)
        actual_spent_labor = round(executed_labor, 2)
        actual_spent_expense = round(executed_expense, 2)
        actual_spent_total = round(executed_total, 2)
    else:
        actual_spent_material = 0.0
        actual_spent_labor = 0.0
        actual_spent_expense = 0.0
        actual_spent_total = 0.0

    variance_material = round(confirmed_material - actual_spent_material, 2)
    variance_labor = round(confirmed_labor - actual_spent_labor, 2)
    variance_expense = round(confirmed_expense - actual_spent_expense, 2)
    variance_total = round(confirmed_budget_total - actual_spent_total, 2)
    return {
        "confirmed_budget_material": confirmed_material,
        "confirmed_budget_labor": confirmed_labor,
        "confirmed_budget_expense": confirmed_expense,
        "confirmed_budget_total": confirmed_budget_total,
        "actual_spent_material": actual_spent_material,
        "actual_spent_labor": actual_spent_labor,
        "actual_spent_expense": actual_spent_expense,
        "actual_spent_total": actual_spent_total,
        "variance_material": variance_material,
        "variance_labor": variance_labor,
        "variance_expense": variance_expense,
        "variance_total": variance_total,
    }


def _svg_safe_text(value: str) -> str:
    text = (value or "").strip()
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _build_generated_cover_image(project: models.BudgetProject) -> str:
    project_name = _svg_safe_text(project.name or "프로젝트")
    project_type = _svg_safe_text(_project_type_label(project.project_type))
    customer_name = _svg_safe_text(project.customer_name or "고객사 미지정")

    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>"
        "<defs>"
        "<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
        "<stop offset='0%' stop-color='#0ea5e9'/>"
        "<stop offset='100%' stop-color='#1d4ed8'/>"
        "</linearGradient>"
        "</defs>"
        "<rect width='640' height='360' fill='url(#g)'/>"
        "<circle cx='560' cy='80' r='90' fill='rgba(255,255,255,0.16)'/>"
        "<circle cx='80' cy='300' r='120' fill='rgba(255,255,255,0.12)'/>"
        "<text x='36' y='64' font-size='22' fill='white' font-family='Pretendard, Apple SD Gothic Neo, sans-serif'>"
        f"{project_type} 프로젝트"
        "</text>"
        "<text x='36' y='130' font-size='36' fill='white' font-weight='700' "
        "font-family='Pretendard, Apple SD Gothic Neo, sans-serif'>"
        f"{project_name}"
        "</text>"
        "<text x='36' y='176' font-size='20' fill='rgba(255,255,255,0.92)' "
        "font-family='Pretendard, Apple SD Gothic Neo, sans-serif'>"
        f"{customer_name}"
        "</text>"
        "</svg>"
    )
    return f"data:image/svg+xml;utf8,{quote(svg)}"


def _coerce_milestone_status(status: str) -> str:
    value = (status or "").strip().lower()
    if value in {"done", "active", "planned"}:
        return value
    return "planned"


def _parse_custom_milestones(raw_json: Optional[str]) -> Optional[list[dict]]:
    text = (raw_json or "").strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(parsed, list):
        return None

    normalized = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        status = _coerce_milestone_status(str(item.get("status") or "planned"))
        normalized.append(
            {
                "key": str(item.get("key") or label),
                "label": label,
                "date": str(item.get("date") or "").strip(),
                "status": status,
                "status_label": {"done": "완료", "active": "진행중", "planned": "예정"}[status],
            }
        )
    if not normalized:
        return None
    return normalized[:5]


def _build_default_milestones(project: models.BudgetProject) -> list[dict]:
    try:
        base_date = parse_iso(project.created_at).date()
    except Exception:  # noqa: BLE001
        base_date = utcnow().date()

    # Default milestones track the execution timeline (design -> fabrication -> installation).
    # We treat review as "before design" so its rank becomes -1 for milestone status computation.
    stage_rank = _project_stage_rank(project.current_stage) - 1
    blueprint = [
        ("design", "설계", 0),
        ("fabrication", "제작", 14),
        ("installation", "설치", 28),
    ]

    output = []
    for index, (key, label, offset_days) in enumerate(blueprint):
        if stage_rank > index:
            status = "done"
        elif stage_rank == index:
            status = "active"
        else:
            status = "planned"
        target_date = (base_date + timedelta(days=offset_days)).isoformat()
        output.append(
            {
                "key": key,
                "label": label,
                "date": target_date,
                "status": status,
                "status_label": {"done": "완료", "active": "진행중", "planned": "예정"}[status],
            }
        )
    return output


def _split_csv_query_values(value: Optional[str]) -> list[str]:
    if not value:
        return []
    output = []
    seen = set()
    for token in str(value).split(","):
        item = token.strip()
        if not item:
            continue
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        output.append(item)
    return output


def _collect_project_type_filters(
    project_type: Optional[str],
    project_types: Optional[str],
) -> set[str]:
    selected = set()
    for token in _split_csv_query_values(project_types):
        selected.add(_normalize_project_type(token))
    if project_type:
        selected.add(_normalize_project_type(project_type))
    return selected


def _collect_stage_filters(stages: Optional[str]) -> set[str]:
    selected = set()
    for token in _split_csv_query_values(stages):
        selected.add(normalize_stage(token))
    return selected


def _normalize_project_sort(sort_by: Optional[str]) -> str:
    token = (sort_by or "").strip().lower()
    if not token:
        return _DEFAULT_PROJECT_SORT
    normalized = _PROJECT_SORT_ALIASES.get(token, token)
    if normalized not in _ALLOWED_PROJECT_SORTS:
        raise ValueError(f"Unsupported sort_by: {sort_by}")
    return normalized


def _sort_project_payloads(projects: list[dict], sort_by: str) -> list[dict]:
    if sort_by == "updated_asc":
        return sorted(
            projects,
            key=lambda item: (
                str(item.get("updated_at") or ""),
                int(item.get("id") or 0),
            ),
        )
    if sort_by == "name_desc":
        return sorted(
            projects,
            key=lambda item: (
                str(item.get("name") or "").lower(),
                int(item.get("id") or 0),
            ),
            reverse=True,
        )
    if sort_by == "name_asc":
        return sorted(
            projects,
            key=lambda item: (
                str(item.get("name") or "").lower(),
                int(item.get("id") or 0),
            ),
        )

    return sorted(
        projects,
        key=lambda item: (
            str(item.get("updated_at") or ""),
            int(item.get("id") or 0),
        ),
        reverse=True,
    )


def _project_can_edit(project: models.BudgetProject, user: Optional[models.User]) -> bool:
    if not user:
        return False
    manager_user_id = _project_manager_user_id(project)
    if manager_user_id is None:
        return True
    return manager_user_id == int(user.id)


def _is_my_project(project: models.BudgetProject, user: Optional[models.User]) -> bool:
    manager_user_id = _project_manager_user_id(project)
    if not user or manager_user_id is None:
        return False
    return manager_user_id == int(user.id)


def _is_admin_user(user: Optional[models.User]) -> bool:
    if not user:
        return False
    email = (user.email or "").strip().lower()
    local_part = email.split("@", 1)[0] if "@" in email else email
    return email in _ADMIN_IDENTIFIERS or local_part in _ADMIN_IDENTIFIERS


def _get_current_version_for_project(
    project: models.BudgetProject,
    db: Session,
) -> Optional[models.BudgetVersion]:
    current_version = (
        db.query(models.BudgetVersion)
        .filter(
            models.BudgetVersion.project_id == project.id,
            models.BudgetVersion.stage == project.current_stage,
            models.BudgetVersion.is_current.is_(True),
        )
        .order_by(models.BudgetVersion.updated_at.desc(), models.BudgetVersion.id.desc())
        .first()
    )
    if current_version is None:
        current_version = (
            db.query(models.BudgetVersion)
            .filter(models.BudgetVersion.project_id == project.id)
            .order_by(models.BudgetVersion.updated_at.desc(), models.BudgetVersion.id.desc())
            .first()
        )
    return current_version


def _is_project_visible_to_user(
    project: models.BudgetProject,
    current_version: Optional[models.BudgetVersion],
    user: Optional[models.User],
) -> bool:
    if _is_admin_user(user):
        return True
    if _project_can_edit(project, user):
        return True
    if project.current_stage != "review":
        return True
    if current_version is None:
        return False
    return current_version.status == "confirmed"


def _project_visibility_clause(user: models.User):
    if _is_admin_user(user):
        return None

    user_id = int(user.id)
    can_edit_clause = or_(
        func.coalesce(models.BudgetProject.manager_user_id, models.BudgetProject.created_by_user_id) == user_id,
        and_(
            models.BudgetProject.manager_user_id.is_(None),
            models.BudgetProject.created_by_user_id.is_(None),
        ),
    )
    review_confirmed_clause = exists().where(
        and_(
            models.BudgetVersion.project_id == models.BudgetProject.id,
            models.BudgetVersion.stage == models.BudgetProject.current_stage,
            models.BudgetVersion.is_current.is_(True),
            models.BudgetVersion.status == "confirmed",
        )
    )
    return or_(
        can_edit_clause,
        models.BudgetProject.current_stage != _REVIEW_STAGE,
        and_(
            models.BudgetProject.current_stage == _REVIEW_STAGE,
            review_confirmed_clause,
        ),
    )


def _get_current_versions_for_projects(
    projects: list[models.BudgetProject],
    db: Session,
) -> dict[int, Optional[models.BudgetVersion]]:
    if not projects:
        return {}

    project_ids = [int(item.id) for item in projects]
    versions = (
        db.query(models.BudgetVersion)
        .filter(
            models.BudgetVersion.project_id.in_(project_ids),
            models.BudgetVersion.is_current.is_(True),
        )
        .order_by(models.BudgetVersion.updated_at.desc(), models.BudgetVersion.id.desc())
        .all()
    )

    stage_current_map: dict[tuple[int, str], models.BudgetVersion] = {}
    for version in versions:
        key = (int(version.project_id), str(version.stage or "").strip().lower())
        if key in stage_current_map:
            continue
        stage_current_map[key] = version

    output: dict[int, Optional[models.BudgetVersion]] = {}
    missing_project_ids: list[int] = []
    for project in projects:
        project_id = int(project.id)
        stage_key = str(project.current_stage or "").strip().lower()
        chosen = stage_current_map.get((project_id, stage_key))
        output[project_id] = chosen
        if chosen is None:
            missing_project_ids.append(project_id)

    if missing_project_ids:
        fallback_versions = (
            db.query(models.BudgetVersion)
            .filter(models.BudgetVersion.project_id.in_(missing_project_ids))
            .order_by(
                models.BudgetVersion.project_id.asc(),
                models.BudgetVersion.updated_at.desc(),
                models.BudgetVersion.id.desc(),
            )
            .all()
        )
        fallback_map: dict[int, models.BudgetVersion] = {}
        for version in fallback_versions:
            project_id = int(version.project_id)
            if project_id in fallback_map:
                continue
            fallback_map[project_id] = version
        for project_id in missing_project_ids:
            output[project_id] = fallback_map.get(project_id)

    return output


def _serialize_projects_bulk(
    projects: list[models.BudgetProject],
    db: Session,
    user: Optional[models.User],
    current_versions: dict[int, Optional[models.BudgetVersion]],
) -> list[dict]:
    if not projects:
        return []

    project_ids = [int(item.id) for item in projects]
    version_count_map: dict[int, int] = {}
    version_count_rows = (
        db.query(models.BudgetVersion.project_id, func.count(models.BudgetVersion.id))
        .filter(models.BudgetVersion.project_id.in_(project_ids))
        .group_by(models.BudgetVersion.project_id)
        .all()
    )
    for project_id, count in version_count_rows:
        version_count_map[int(project_id)] = int(count or 0)

    user_ids = set()
    for project in projects:
        manager_id = _project_manager_user_id(project)
        if manager_id is not None:
            user_ids.add(int(manager_id))
        if project.created_by_user_id is not None:
            user_ids.add(int(project.created_by_user_id))

    user_map: dict[int, models.User] = {}
    if user_ids:
        users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        user_map = {int(item.id): item for item in users}

    version_ids = [int(item.id) for item in current_versions.values() if item is not None]
    equipments_by_version_id: dict[int, list[models.BudgetEquipment]] = {}
    if version_ids:
        equipment_rows = (
            db.query(models.BudgetEquipment)
            .filter(models.BudgetEquipment.version_id.in_(version_ids))
            .order_by(
                models.BudgetEquipment.version_id.asc(),
                models.BudgetEquipment.sort_order.asc(),
                models.BudgetEquipment.id.asc(),
            )
            .all()
        )
        for equipment in equipment_rows:
            vid = int(equipment.version_id)
            equipments_by_version_id.setdefault(vid, []).append(equipment)

    parent_ids = {
        int(project.parent_project_id)
        for project in projects
        if project.parent_project_id is not None and int(project.parent_project_id) > 0
    }
    parent_payload_by_id: dict[int, dict] = {}
    if parent_ids:
        parent_rows = (
            db.query(models.BudgetProject)
            .filter(models.BudgetProject.id.in_(sorted(parent_ids)))
            .all()
        )
        for parent in parent_rows:
            pid = int(parent.id)
            parent_payload_by_id[pid] = {
                "id": pid,
                "name": parent.name or "",
                "code": parent.code or "",
                "project_type": _project_type_code_or_empty(parent.project_type),
                "project_type_label": _project_type_label(parent.project_type),
            }

    output: list[dict] = []
    for project in projects:
        project_id = int(project.id)
        current = current_versions.get(project_id)

        equipment_names: list[str] = []
        if current is not None:
            equipments = equipments_by_version_id.get(int(current.id), [])
            totals = summarize_costs(equipments)
            seen_equipment_names: set[str] = set()
            for item in equipments:
                name = (item.equipment_name or "").strip()
                if not name:
                    continue
                key = name.lower()
                if key in seen_equipment_names:
                    continue
                seen_equipment_names.add(key)
                equipment_names.append(name)
            detail_payload = parse_detail_payload(current.budget_detail_json or "")
            executed_summary = summarize_executed_costs_from_detail(detail_payload)
            current_version_id: Optional[int] = int(current.id)
        else:
            totals = summarize_costs([])
            executed_summary = summarize_executed_costs_from_detail(default_detail_payload())
            current_version_id = None

        monitoring = _build_monitoring_payload(project, totals, executed_summary=executed_summary)
        manager = None
        manager_user_id = _project_manager_user_id(project)
        if manager_user_id is not None:
            manager = user_map.get(int(manager_user_id))
        owner = None
        if project.created_by_user_id is not None:
            owner = user_map.get(int(project.created_by_user_id))
        manager_name = _user_display_name(manager, empty_label="담당자 미지정")
        custom_cover_image_url = (project.cover_image_url or "").strip()
        generated_cover_image_url = _build_generated_cover_image(project)
        custom_milestones = _parse_custom_milestones(project.summary_milestones_json)
        summary_milestones = custom_milestones or _build_default_milestones(project)
        parent_project_id = int(project.parent_project_id) if project.parent_project_id is not None else None
        parent_project_payload = parent_payload_by_id.get(parent_project_id or 0)

        output.append(
            {
                "id": project_id,
                "name": project.name,
                "code": project.code or "",
                "description": project.description or "",
                "project_type": _project_type_code_or_empty(project.project_type),
                "project_type_label": _project_type_label(project.project_type),
                "parent_project_id": parent_project_id,
                "parent_project": parent_project_payload,
                "customer_name": project.customer_name or "",
                "installation_site": project.installation_site or "",
                "equipment_names": equipment_names,
                "business_trip_distance_km": to_number(project.business_trip_distance_km),
                "cover_image_url": custom_cover_image_url,
                "cover_image_fallback_url": generated_cover_image_url,
                "cover_image_display_url": custom_cover_image_url or generated_cover_image_url,
                "summary_milestones": summary_milestones,
                "schedule_detail_note": "상세 일정 작성은 추후 구현 예정입니다.",
                "current_stage": project.current_stage,
                "current_stage_label": stage_label(project.current_stage),
                "current_version_id": current_version_id,
                "version_count": int(version_count_map.get(project_id, 0)),
                "manager_user_id": _project_manager_user_id(project),
                "manager_name": manager_name,
                "author_name": manager_name,  # backward compatibility
                "created_by_name": _user_display_name(owner, empty_label="생성자 미지정"),
                "can_edit": _project_can_edit(project, user),
                "is_mine": _is_my_project(project, user),
                "totals": totals,
                "monitoring": monitoring,
                "created_at": project.created_at,
                "updated_at": project.updated_at,
            }
        )

    return output


def _require_project_edit_permission(project: models.BudgetProject, user: models.User) -> None:
    if project.created_by_user_id is None:
        project.created_by_user_id = int(user.id)
    if project.manager_user_id is None:
        project.manager_user_id = int(project.created_by_user_id)
        project.updated_at = to_iso(utcnow())

    if int(project.manager_user_id) != int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No edit permission for this project.")


def _require_version_edit_permission(version: models.BudgetVersion, user: models.User, db: Session) -> models.BudgetProject:
    project = _get_project_or_404(version.project_id, db)
    _require_project_edit_permission(project, user)
    return project


def _budget_lock_signature(detail_payload: dict) -> dict[str, list[tuple]]:
    def _normalize_expense_type(raw_value: Any) -> str:
        normalized = str(raw_value or "").strip()
        return "외주" if normalized == "외주" else "자체"

    def _normalize_staffing_type(raw_value: Any) -> str:
        normalized = str(raw_value or "").strip()
        return "외주" if normalized == "외주" else "자체"

    signature = {
        "material_items": [],
        "labor_items": [],
        "expense_items": [],
    }

    for item in detail_payload.get("material_items", []):
        signature["material_items"].append(
            (
                (item.get("equipment_name") or "").strip(),
                (item.get("unit_name") or "").strip(),
                (item.get("part_name") or "").strip(),
                (item.get("spec") or "").strip(),
                to_number(item.get("quantity")),
                to_number(item.get("unit_price")),
                normalize_phase(item.get("phase") or "fabrication"),
            )
        )

    for item in detail_payload.get("labor_items", []):
        signature["labor_items"].append(
            (
                (item.get("equipment_name") or "").strip(),
                (item.get("task_name") or "").strip(),
                _normalize_staffing_type(item.get("staffing_type")),
                (item.get("worker_type") or "").strip(),
                (item.get("unit") or "H").strip().upper(),
                to_number(item.get("quantity")),
                to_number(item.get("headcount")) or 1.0,
                (item.get("location_type") or "domestic").strip().lower(),
                to_number(item.get("hourly_rate")),
                normalize_phase(item.get("phase") or "fabrication"),
            )
        )

    for item in detail_payload.get("expense_items", []):
        signature["expense_items"].append(
            (
                (item.get("equipment_name") or "").strip(),
                _normalize_expense_type(item.get("expense_type")),
                (item.get("expense_name") or "").strip(),
                (item.get("basis") or "").strip(),
                to_number(item.get("quantity")),
                to_number(item.get("amount")),
                normalize_phase(item.get("phase") or "fabrication"),
            )
        )

    signature["material_items"].sort()
    signature["labor_items"].sort()
    signature["expense_items"].sort()
    return signature


def _serialize_project(
    project: models.BudgetProject,
    db: Session,
    user: Optional[models.User] = None,
    current_version: Optional[models.BudgetVersion] = None,
) -> dict:
    current = current_version or _get_current_version_for_project(project, db)
    equipment_names: list[str] = []
    if current:
        equipments = _version_equipments(current.id, db)
        totals = summarize_costs(equipments)
        seen_equipment_names: set[str] = set()
        for item in equipments:
            name = (item.equipment_name or "").strip()
            if not name or name in seen_equipment_names:
                continue
            seen_equipment_names.add(name)
            equipment_names.append(name)
        detail_payload = parse_detail_payload(current.budget_detail_json or "")
        executed_summary = summarize_executed_costs_from_detail(detail_payload)
        current_version_id = int(current.id)
    else:
        totals = summarize_costs([])
        executed_summary = summarize_executed_costs_from_detail(default_detail_payload())
        current_version_id = None

    monitoring = _build_monitoring_payload(project, totals, executed_summary=executed_summary)
    manager = _project_manager(project, db)
    owner = _project_owner(project, db)
    manager_name = _user_display_name(manager, empty_label="담당자 미지정")
    custom_cover_image_url = (project.cover_image_url or "").strip()
    generated_cover_image_url = _build_generated_cover_image(project)
    custom_milestones = _parse_custom_milestones(project.summary_milestones_json)
    summary_milestones = custom_milestones or _build_default_milestones(project)

    parent_project_id: Optional[int] = int(project.parent_project_id) if project.parent_project_id is not None else None
    parent_project_payload = None
    if parent_project_id:
        parent_project = db.query(models.BudgetProject).filter(models.BudgetProject.id == parent_project_id).first()
        if parent_project is not None:
            parent_project_payload = {
                "id": int(parent_project.id),
                "name": parent_project.name or "",
                "code": parent_project.code or "",
                "project_type": _project_type_code_or_empty(parent_project.project_type),
                "project_type_label": _project_type_label(parent_project.project_type),
            }

    version_count = (
        db.query(func.count(models.BudgetVersion.id))
        .filter(models.BudgetVersion.project_id == project.id)
        .scalar()
        or 0
    )

    return {
        "id": int(project.id),
        "name": project.name,
        "code": project.code or "",
        "description": project.description or "",
        "project_type": _project_type_code_or_empty(project.project_type),
        "project_type_label": _project_type_label(project.project_type),
        "parent_project_id": parent_project_id,
        "parent_project": parent_project_payload,
        "customer_name": project.customer_name or "",
        "installation_site": project.installation_site or "",
        "equipment_names": equipment_names,
        "business_trip_distance_km": to_number(project.business_trip_distance_km),
        "cover_image_url": custom_cover_image_url,
        "cover_image_fallback_url": generated_cover_image_url,
        "cover_image_display_url": custom_cover_image_url or generated_cover_image_url,
        "summary_milestones": summary_milestones,
        "schedule_detail_note": "상세 일정 작성은 추후 구현 예정입니다.",
        "current_stage": project.current_stage,
        "current_stage_label": stage_label(project.current_stage),
        "current_version_id": current_version_id,
        "version_count": int(version_count),
        "manager_user_id": _project_manager_user_id(project),
        "manager_name": manager_name,
        "author_name": manager_name,  # backward compatibility
        "created_by_name": _user_display_name(owner, empty_label="생성자 미지정"),
        "can_edit": _project_can_edit(project, user),
        "is_mine": _is_my_project(project, user),
        "totals": totals,
        "monitoring": monitoring,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def _matches_project_filters(
    project_payload: dict,
    project_name: Optional[str],
    project_code: Optional[str],
    project_types: set[str],
    stages: set[str],
    customer_name: Optional[str],
    manager_name: Optional[str],
    min_total: Optional[float],
    max_total: Optional[float],
) -> bool:
    name_filter = (project_name or "").strip().lower()
    if name_filter:
        if name_filter not in (project_payload.get("name") or "").lower():
            return False

    code_filter = (project_code or "").strip().lower()
    if code_filter:
        if code_filter not in (project_payload.get("code") or "").lower():
            return False

    if project_types:
        if (project_payload.get("project_type") or "") not in project_types:
            return False

    if stages:
        try:
            normalized_stage = normalize_stage(project_payload.get("current_stage") or "")
        except ValueError:
            normalized_stage = (project_payload.get("current_stage") or "").strip().lower()
        if normalized_stage not in stages:
            return False

    customer_filter = (customer_name or "").strip().lower()
    if customer_filter:
        if customer_filter not in (project_payload.get("customer_name") or "").lower():
            return False

    manager_filter = (manager_name or "").strip().lower()
    if manager_filter:
        if manager_filter not in (project_payload.get("manager_name") or "").lower():
            return False

    grand_total = to_number((project_payload.get("totals") or {}).get("grand_total"))
    if min_total is not None and grand_total < to_number(min_total):
        return False
    if max_total is not None and grand_total > to_number(max_total):
        return False
    return True


def _tokenize_search_query(query: str) -> list[str]:
    raw_query = (query or "").strip()
    if not raw_query:
        return []
    tokens = []
    seen = set()
    for token in _SEARCH_TOKEN_PATTERN.findall(raw_query):
        lowered = token.strip().lower()
        if len(lowered) < 2 or lowered in seen:
            continue
        seen.add(lowered)
        tokens.append(lowered)
    cleaned = [token for token in tokens if token not in _SEARCH_STOPWORDS]
    return cleaned or tokens


def _project_search_score(project_payload: dict, query: str, tokens: list[str]) -> float:
    name = (project_payload.get("name") or "").strip()
    description = (project_payload.get("description") or "").strip()
    code = (project_payload.get("code") or "").strip()
    customer_name = (project_payload.get("customer_name") or "").strip()
    manager_name = (project_payload.get("manager_name") or "").strip()
    installation_site = (project_payload.get("installation_site") or "").strip()
    equipment_names = project_payload.get("equipment_names") or []
    equipment_name_text = " ".join(
        (str(item or "").strip() for item in equipment_names if str(item or "").strip())
    ).strip()

    query_lower = (query or "").strip().lower()
    name_lower = name.lower()
    description_lower = description.lower()
    code_lower = code.lower()
    customer_lower = customer_name.lower()
    manager_lower = manager_name.lower()
    installation_site_lower = installation_site.lower()
    equipment_name_lower = equipment_name_text.lower()

    haystack = " ".join(
        part
        for part in (
            name,
            description,
            code,
            customer_name,
            manager_name,
            installation_site,
            equipment_name_text,
        )
        if part
    ).lower()
    if not haystack:
        return 0.0

    matched_tokens = 0
    for token in tokens:
        if token in haystack:
            matched_tokens += 1

    score = 0.0
    exact_phrase_match = False
    if query_lower:
        if query_lower in name_lower:
            score += 4.0
            exact_phrase_match = True
        if query_lower in code_lower:
            score += 3.5
            exact_phrase_match = True
        if query_lower in customer_lower:
            score += 2.8
            exact_phrase_match = True
        if query_lower in manager_lower:
            score += 2.2
            exact_phrase_match = True
        if query_lower in installation_site_lower:
            score += 1.9
            exact_phrase_match = True
        if query_lower in equipment_name_lower:
            score += 2.6
            exact_phrase_match = True
        if query_lower in description_lower:
            score += 2.0
            exact_phrase_match = True
        if query_lower in haystack:
            score += 1.0
            exact_phrase_match = True

    for token in tokens:
        if token in name_lower:
            score += 1.5
        if token in code_lower:
            score += 1.2
        if token in customer_lower:
            score += 1.0
        if token in manager_lower:
            score += 0.9
        if token in installation_site_lower:
            score += 0.8
        if token in equipment_name_lower:
            score += 1.1
        if token in description_lower:
            score += 0.8

    if not exact_phrase_match and len(tokens) >= 2:
        required_token_matches = 2 if len(tokens) <= 3 else 3
        if matched_tokens < required_token_matches:
            return 0.0

    return score


def _collapse_snippet_whitespace(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


def _extract_snippet(text: str, query_lower: str, tokens: list[str], max_len: int = 180) -> str:
    cleaned = _collapse_snippet_whitespace(text)
    if not cleaned:
        return ""

    if len(cleaned) <= max_len:
        return cleaned

    lowered = cleaned.lower()
    match_start = -1
    match_len = 0

    if query_lower:
        idx = lowered.find(query_lower)
        if idx >= 0:
            match_start = idx
            match_len = len(query_lower)

    if match_start < 0:
        for token in tokens:
            idx = lowered.find(token)
            if idx >= 0:
                match_start = idx
                match_len = len(token)
                break

    if match_start < 0:
        return cleaned[: max_len - 3].rstrip() + "..."

    context = max(24, int(max_len * 0.45))
    start = max(0, match_start - context)
    end = min(len(cleaned), match_start + match_len + context)
    snippet = cleaned[start:end].strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(cleaned):
        snippet = snippet + "..."
    return snippet


def _project_search_explain(project_payload: dict, query: str, tokens: list[str]) -> dict:
    query_lower = (query or "").strip().lower()

    name = _collapse_snippet_whitespace(project_payload.get("name") or "")
    description = _collapse_snippet_whitespace(project_payload.get("description") or "")
    code = _collapse_snippet_whitespace(project_payload.get("code") or "")
    customer_name = _collapse_snippet_whitespace(project_payload.get("customer_name") or "")
    manager_name = _collapse_snippet_whitespace(project_payload.get("manager_name") or "")
    installation_site = _collapse_snippet_whitespace(project_payload.get("installation_site") or "")
    equipment_names = project_payload.get("equipment_names") or []
    equipment_name_text = _collapse_snippet_whitespace(
        " ".join(str(item or "").strip() for item in equipment_names if str(item or "").strip())
    )

    field_values = [
        ("name", name),
        ("code", code),
        ("customer_name", customer_name),
        ("installation_site", installation_site),
        ("manager_name", manager_name),
        ("equipment_names", equipment_name_text),
        ("description", description),
    ]

    match_fields: list[str] = []
    matched_terms: set[str] = set()
    for field, value in field_values:
        if not value:
            continue
        lowered = value.lower()
        field_matched = False
        if query_lower and query_lower in lowered:
            field_matched = True
        for token in tokens:
            if token and token in lowered:
                field_matched = True
                matched_terms.add(token)
        if field_matched:
            match_fields.append(field)

    # Pick a snippet field that both reads well and tends to include the query.
    snippet_field = ""
    snippet_source = ""
    for field, value in (
        ("description", description),
        ("installation_site", installation_site),
        ("customer_name", customer_name),
        ("equipment_names", equipment_name_text),
        ("manager_name", manager_name),
        ("code", code),
    ):
        if not value:
            continue
        lowered = value.lower()
        if (query_lower and query_lower in lowered) or any(token in lowered for token in tokens):
            snippet_field = field
            snippet_source = value
            break

    if not snippet_source:
        if description:
            snippet_field = "description"
            snippet_source = description
        elif installation_site:
            snippet_field = "installation_site"
            snippet_source = installation_site
        elif customer_name:
            snippet_field = "customer_name"
            snippet_source = customer_name
        elif name:
            snippet_field = "name"
            snippet_source = name

    ordered_terms = [token for token in tokens if token in matched_terms]
    snippet = _extract_snippet(snippet_source, query_lower, tokens)
    return {
        "match_fields": match_fields,
        "matched_terms": ordered_terms,
        "snippet_field": snippet_field,
        "snippet": snippet,
    }


@router.get("/projects")
def list_projects(
    project_name: Optional[str] = Query(default=None, max_length=120),
    project_code: Optional[str] = Query(default=None, max_length=64),
    project_type: Optional[str] = Query(default=None, max_length=32),
    project_types: Optional[str] = Query(default=None, max_length=255),
    stages: Optional[str] = Query(default=None, max_length=255),
    customer_name: Optional[str] = Query(default=None, max_length=180),
    manager_name: Optional[str] = Query(default=None, max_length=180),
    author_name: Optional[str] = Query(default=None, max_length=180),
    min_total: Optional[float] = Query(default=None),
    max_total: Optional[float] = Query(default=None),
    sort_by: Optional[str] = Query(default=_DEFAULT_PROJECT_SORT, max_length=32),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if min_total is not None and max_total is not None and to_number(min_total) > to_number(max_total):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="min_total cannot exceed max_total.")

    try:
        selected_project_types = _collect_project_type_filters(
            project_type=project_type,
            project_types=project_types,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        selected_stages = _collect_stage_filters(stages=stages)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        normalized_sort = _normalize_project_sort(sort_by)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    manager_filter_value = (manager_name or author_name or "").strip()
    use_slow_path = bool(manager_filter_value) or (min_total is not None) or (max_total is not None)

    if not use_slow_path:
        query_builder = db.query(models.BudgetProject)
        visibility_clause = _project_visibility_clause(user)
        if visibility_clause is not None:
            query_builder = query_builder.filter(visibility_clause)

        name_filter = (project_name or "").strip()
        if name_filter:
            query_builder = query_builder.filter(models.BudgetProject.name.ilike(f"%{name_filter}%"))

        code_filter = (project_code or "").strip()
        if code_filter:
            query_builder = query_builder.filter(models.BudgetProject.code.ilike(f"%{code_filter}%"))

        customer_filter = (customer_name or "").strip()
        if customer_filter:
            query_builder = query_builder.filter(models.BudgetProject.customer_name.ilike(f"%{customer_filter}%"))

        if selected_project_types:
            # Match legacy normalization: null/empty project_type behaves like "equipment".
            project_type_expr = func.coalesce(func.nullif(models.BudgetProject.project_type, ""), "equipment")
            query_builder = query_builder.filter(project_type_expr.in_(selected_project_types))

        if selected_stages:
            query_builder = query_builder.filter(models.BudgetProject.current_stage.in_(selected_stages))

        total = int(query_builder.order_by(None).count())

        if normalized_sort == "updated_asc":
            query_builder = query_builder.order_by(models.BudgetProject.updated_at.asc(), models.BudgetProject.id.asc())
        elif normalized_sort == "name_desc":
            query_builder = query_builder.order_by(func.lower(models.BudgetProject.name).desc(), models.BudgetProject.id.desc())
        elif normalized_sort == "name_asc":
            query_builder = query_builder.order_by(func.lower(models.BudgetProject.name).asc(), models.BudgetProject.id.asc())
        else:
            query_builder = query_builder.order_by(models.BudgetProject.updated_at.desc(), models.BudgetProject.id.desc())

        start = (page - 1) * page_size
        projects_page = query_builder.offset(start).limit(page_size).all()
        current_versions = _get_current_versions_for_projects(projects_page, db)
        items = _serialize_projects_bulk(projects_page, db, user=user, current_versions=current_versions)
        return {
            "items": items,
            "page": page,
            "page_size": page_size,
            "total": total,
        }

    all_projects = (
        db.query(models.BudgetProject)
        .order_by(models.BudgetProject.updated_at.desc(), models.BudgetProject.id.desc())
        .all()
    )
    visible_projects = []
    for project in all_projects:
        current_version = _get_current_version_for_project(project, db)
        if not _is_project_visible_to_user(project, current_version=current_version, user=user):
            continue
        payload = _serialize_project(project, db, user=user, current_version=current_version)
        if not _matches_project_filters(
            payload,
            project_name=project_name,
            project_code=project_code,
            project_types=selected_project_types,
            stages=selected_stages,
            customer_name=customer_name,
            manager_name=manager_filter_value,
            min_total=min_total,
            max_total=max_total,
        ):
            continue
        visible_projects.append(payload)
    sorted_projects = _sort_project_payloads(visible_projects, sort_by=normalized_sort)
    total = len(sorted_projects)
    start = (page - 1) * page_size
    end = start + page_size
    items = sorted_projects[start:end]
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/projects/search")
def search_projects(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = (q or "").strip()
    if not query:
        return []

    tokens = _tokenize_search_query(query)
    query_builder = db.query(models.BudgetProject)
    visibility_clause = _project_visibility_clause(user)
    if visibility_clause is not None:
        query_builder = query_builder.filter(visibility_clause)

    candidate_limit = max(int(limit) * 20, 200)

    # Coarse prefilter to avoid scoring every project.
    token_conditions = []
    needle = query.strip()
    if needle:
        token_conditions.append(models.BudgetProject.name.ilike(f"%{needle}%"))
        token_conditions.append(models.BudgetProject.code.ilike(f"%{needle}%"))
        token_conditions.append(models.BudgetProject.customer_name.ilike(f"%{needle}%"))
        token_conditions.append(models.BudgetProject.installation_site.ilike(f"%{needle}%"))
        token_conditions.append(models.BudgetProject.description.ilike(f"%{needle}%"))
    for token in tokens:
        token_conditions.append(models.BudgetProject.name.ilike(f"%{token}%"))
        token_conditions.append(models.BudgetProject.code.ilike(f"%{token}%"))
        token_conditions.append(models.BudgetProject.customer_name.ilike(f"%{token}%"))
        token_conditions.append(models.BudgetProject.installation_site.ilike(f"%{token}%"))
        token_conditions.append(models.BudgetProject.description.ilike(f"%{token}%"))

    # Include manager name/email matches in candidate selection (manager is stored on the related User row).
    user_conditions = []
    if needle:
        user_conditions.append(models.User.full_name.ilike(f"%{needle}%"))
        user_conditions.append(models.User.email.ilike(f"%{needle}%"))
    for token in tokens:
        user_conditions.append(models.User.full_name.ilike(f"%{token}%"))
        user_conditions.append(models.User.email.ilike(f"%{token}%"))
    if user_conditions:
        manager_rows = (
            db.query(models.User.id)
            .filter(
                models.User.is_active.is_(True),
                models.User.email_verified.is_(True),
            )
            .filter(or_(*user_conditions))
            .limit(200)
            .all()
        )
        manager_ids = {int(row[0]) for row in manager_rows if row and row[0]}
        if manager_ids:
            token_conditions.append(models.BudgetProject.manager_user_id.in_(sorted(manager_ids)))

    # Include current-version equipment name matches in candidate selection.
    equipment_conditions = []
    if needle:
        equipment_conditions.append(models.BudgetEquipment.equipment_name.ilike(f"%{needle}%"))
    for token in tokens:
        equipment_conditions.append(models.BudgetEquipment.equipment_name.ilike(f"%{token}%"))
    if equipment_conditions:
        project_rows = (
            db.query(models.BudgetVersion.project_id)
            .join(models.BudgetEquipment, models.BudgetEquipment.version_id == models.BudgetVersion.id)
            .filter(models.BudgetVersion.is_current.is_(True))
            .filter(or_(*equipment_conditions))
            .distinct()
            .limit(candidate_limit * 10)
            .all()
        )
        equipment_project_ids = {int(row[0]) for row in project_rows if row and row[0]}
        if equipment_project_ids:
            token_conditions.append(models.BudgetProject.id.in_(sorted(equipment_project_ids)))
    if token_conditions:
        query_builder = query_builder.filter(or_(*token_conditions))

    candidates = (
        query_builder
        .order_by(models.BudgetProject.updated_at.desc(), models.BudgetProject.id.desc())
        .limit(candidate_limit)
        .all()
    )
    if not candidates:
        return []

    current_versions = _get_current_versions_for_projects(candidates, db)
    version_ids = [int(item.id) for item in current_versions.values() if item is not None]
    equipment_names_by_version_id: dict[int, list[str]] = {}
    if version_ids:
        equipment_rows = (
            db.query(
                models.BudgetEquipment.version_id,
                models.BudgetEquipment.equipment_name,
            )
            .filter(models.BudgetEquipment.version_id.in_(version_ids))
            .order_by(
                models.BudgetEquipment.version_id.asc(),
                models.BudgetEquipment.sort_order.asc(),
                models.BudgetEquipment.id.asc(),
            )
            .all()
        )
        seen_by_version: dict[int, set[str]] = {}
        for version_id, equipment_name in equipment_rows:
            vid = int(version_id)
            name = (equipment_name or "").strip()
            if not name:
                continue
            key = name.lower()
            if vid not in seen_by_version:
                seen_by_version[vid] = set()
            if key in seen_by_version[vid]:
                continue
            seen_by_version[vid].add(key)
            equipment_names_by_version_id.setdefault(vid, []).append(name)

    user_ids = set()
    for project in candidates:
        manager_id = _project_manager_user_id(project)
        if manager_id is not None:
            user_ids.add(int(manager_id))
    user_map: dict[int, models.User] = {}
    if user_ids:
        users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        user_map = {int(item.id): item for item in users}

    scored_results: list[dict] = []
    for project in candidates:
        project_id = int(project.id)
        current_version = current_versions.get(project_id)
        version_id = int(current_version.id) if current_version is not None else None
        manager_id = _project_manager_user_id(project)
        manager = user_map.get(int(manager_id)) if manager_id is not None else None
        manager_name = _user_display_name(manager, empty_label="담당자 미지정")

        score_payload = {
            "name": project.name,
            "description": project.description or "",
            "code": project.code or "",
            "customer_name": project.customer_name or "",
            "manager_name": manager_name,
            "installation_site": project.installation_site or "",
            "equipment_names": equipment_names_by_version_id.get(version_id or 0, []),
        }
        score = _project_search_score(score_payload, query, tokens)
        if score <= 0:
            continue

        explain = _project_search_explain(score_payload, query, tokens)

        scored_results.append(
            {
                "project_id": project_id,
                "name": project.name or "",
                "code": project.code or "",
                "description": project.description or "",
                "customer_name": project.customer_name or "",
                "installation_site": project.installation_site or "",
                "manager_name": manager_name or "",
                "project_type": _project_type_code_or_empty(project.project_type),
                "project_type_label": _project_type_label(project.project_type),
                "current_stage": project.current_stage or "",
                "current_stage_label": stage_label(project.current_stage),
                "score": score,
                "match_fields": explain.get("match_fields") or [],
                "matched_terms": explain.get("matched_terms") or [],
                "snippet_field": explain.get("snippet_field") or "",
                "snippet": explain.get("snippet") or "",
            }
        )

    scored_results.sort(key=lambda item: (item.get("score") or 0.0), reverse=True)
    return scored_results[:limit]


@router.post("/projects")
def create_project(
    payload: BudgetProjectCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    code = (payload.code or "").strip() or None
    if code:
        exists = db.query(models.BudgetProject).filter(models.BudgetProject.code == code).first()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project code already exists.")
    try:
        project_type = _normalize_project_type(payload.project_type)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    parent_project_id = int(payload.parent_project_id) if payload.parent_project_id is not None else None
    parent_project = None
    if project_type == "as":
        if not parent_project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AS 프로젝트는 소속 설비 프로젝트를 선택해야 합니다.",
            )
        parent_project = db.query(models.BudgetProject).filter(models.BudgetProject.id == parent_project_id).first()
        if not parent_project:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid parent_project_id.")
        parent_type = _project_type_code_or_empty(parent_project.project_type) or "equipment"
        if parent_type != "equipment":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AS 프로젝트는 설비 프로젝트에만 종속될 수 있습니다.",
            )
    elif parent_project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="parent_project_id is only allowed for AS projects.",
        )

    manager_user_id = int(payload.manager_user_id) if payload.manager_user_id is not None else int(user.id)
    manager = db.query(models.User).filter(models.User.id == manager_user_id).first()
    if not manager or not manager.is_active or not manager.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid manager_user_id.")

    customer_name = (payload.customer_name or "").strip() or None
    installation_site = (payload.installation_site or "").strip() or None
    if project_type == "as" and parent_project is not None:
        if not customer_name:
            customer_name = (parent_project.customer_name or "").strip() or None
        if not installation_site:
            installation_site = (parent_project.installation_site or "").strip() or None

    now_iso = to_iso(utcnow())
    project = models.BudgetProject(
        name=(payload.name or "").strip(),
        code=code,
        description=(payload.description or "").strip() or None,
        project_type=project_type,
        parent_project_id=parent_project_id,
        customer_name=customer_name,
        installation_site=installation_site,
        business_trip_distance_km=to_number(payload.business_trip_distance_km),
        created_by_user_id=int(user.id),
        manager_user_id=manager_user_id,
        current_stage="review",
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _serialize_project(project, db, user=user)


@router.put("/projects/{project_id}")
def update_project(
    project_id: int,
    payload: BudgetProjectUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    _require_project_edit_permission(project, user)
    fields_set = payload.model_fields_set
    if not fields_set:
        return _serialize_project(project, db, user=user)

    changed = False

    if "name" in fields_set and payload.name is not None:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project name is required.")
        if name != (project.name or ""):
            project.name = name
            changed = True

    if "code" in fields_set:
        code = (payload.code or "").strip() or None
        if code != (project.code or None):
            if code:
                conflict = (
                    db.query(models.BudgetProject)
                    .filter(
                        models.BudgetProject.code == code,
                        models.BudgetProject.id != project.id,
                    )
                    .first()
                )
                if conflict:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project code already exists.")
            project.code = code
            changed = True

    if "description" in fields_set:
        description = (payload.description or "").strip() or None
        if description != (project.description or None):
            project.description = description
            changed = True

    if "project_type" in fields_set and payload.project_type is not None:
        try:
            normalized_type = _normalize_project_type(payload.project_type)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if normalized_type != (project.project_type or ""):
            project.project_type = normalized_type
            changed = True

    if "parent_project_id" in fields_set:
        parent_project_id = int(payload.parent_project_id) if payload.parent_project_id is not None else None
        current_parent_project_id = int(project.parent_project_id) if project.parent_project_id is not None else None
        if parent_project_id != current_parent_project_id:
            project.parent_project_id = parent_project_id
            changed = True

    if "current_stage" in fields_set and payload.current_stage is not None:
        try:
            normalized_stage = normalize_stage(payload.current_stage)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if normalized_stage != (project.current_stage or ""):
            project.current_stage = normalized_stage
            changed = True

    if "customer_name" in fields_set:
        customer_name = (payload.customer_name or "").strip() or None
        if customer_name != (project.customer_name or None):
            project.customer_name = customer_name
            changed = True

    if "installation_site" in fields_set:
        installation_site = (payload.installation_site or "").strip() or None
        if installation_site != (project.installation_site or None):
            project.installation_site = installation_site
            changed = True

    if "business_trip_distance_km" in fields_set:
        business_trip_distance_km = to_number(payload.business_trip_distance_km)
        if business_trip_distance_km != to_number(project.business_trip_distance_km):
            project.business_trip_distance_km = business_trip_distance_km
            changed = True

    if "cover_image_url" in fields_set:
        cover_image_url = (payload.cover_image_url or "").strip() or None
        if cover_image_url != (project.cover_image_url or None):
            project.cover_image_url = cover_image_url
            changed = True

    if "manager_user_id" in fields_set and payload.manager_user_id is not None:
        manager_user_id = int(payload.manager_user_id)
        manager = db.query(models.User).filter(models.User.id == manager_user_id).first()
        if not manager or not manager.is_active or not manager.email_verified:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid manager_user_id.")
        if manager_user_id != int(_project_manager_user_id(project) or 0):
            project.manager_user_id = manager_user_id
            changed = True

    final_project_type = _project_type_code_or_empty(project.project_type) or "equipment"
    if final_project_type == "as":
        if not project.parent_project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AS 프로젝트는 소속 설비 프로젝트를 선택해야 합니다.",
            )
        parent_project = db.query(models.BudgetProject).filter(models.BudgetProject.id == project.parent_project_id).first()
        if not parent_project:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid parent_project_id.")
        parent_type = _project_type_code_or_empty(parent_project.project_type) or "equipment"
        if parent_type != "equipment":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AS 프로젝트는 설비 프로젝트에만 종속될 수 있습니다.",
            )
    else:
        if "parent_project_id" in fields_set and payload.parent_project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="parent_project_id is only allowed for AS projects.",
            )
        if project.parent_project_id is not None:
            project.parent_project_id = None
            changed = True

    if changed:
        project.updated_at = to_iso(utcnow())
        db.commit()
        db.refresh(project)

    return _serialize_project(project, db, user=user)


@router.get("/projects/{project_id}/schedule")
def get_project_schedule(
    project_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    schedule_payload = _parse_schedule_wbs_payload(project.schedule_wbs_json)
    return {
        "project": _serialize_project(project, db, user=user),
        "schedule": schedule_payload,
    }


@router.put("/projects/{project_id}/schedule")
def upsert_project_schedule(
    project_id: int,
    payload: BudgetProjectSchedulePayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    _require_project_edit_permission(project, user)
    project_type = _project_type_code_or_empty(project.project_type) or "equipment"
    if project_type == "as":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AS 프로젝트는 일정 입력이 필요하지 않습니다.",
        )

    try:
        normalized = _normalize_schedule_wbs_payload(payload.model_dump(), strict_anchor=True)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    now_iso = to_iso(utcnow())
    normalized["updated_at"] = now_iso
    project.schedule_wbs_json = json.dumps(normalized, ensure_ascii=False)
    project.updated_at = now_iso

    db.commit()
    db.refresh(project)

    return {
        "project": _serialize_project(project, db, user=user),
        "schedule": normalized,
    }


@router.get("/projects/{project_id}/versions")
def list_versions(
    project_id: int,
    stage: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    query = db.query(models.BudgetVersion).filter(models.BudgetVersion.project_id == project.id)
    if stage:
        try:
            normalized_stage = normalize_stage(stage)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        query = query.filter(models.BudgetVersion.stage == normalized_stage)

    versions = query.order_by(models.BudgetVersion.created_at.desc(), models.BudgetVersion.id.desc()).all()
    return {
        "project": _serialize_project(project, db, user=user),
        "versions": [_serialize_version(version, db) for version in versions],
    }


@router.post("/projects/{project_id}/versions")
def create_version(
    project_id: int,
    payload: BudgetVersionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    _require_project_edit_permission(project, user)
    try:
        stage = normalize_stage(payload.stage or project.current_stage)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    max_version_no = (
        db.query(func.max(models.BudgetVersion.version_no))
        .filter(
            models.BudgetVersion.project_id == project.id,
            models.BudgetVersion.stage == stage,
        )
        .scalar()
    )
    next_version_no = int(max_version_no or 0) + 1
    now_iso = to_iso(utcnow())

    (
        db.query(models.BudgetVersion)
        .filter(
            models.BudgetVersion.project_id == project.id,
            models.BudgetVersion.stage == stage,
            models.BudgetVersion.is_current.is_(True),
        )
        .update({"is_current": False, "updated_at": now_iso}, synchronize_session=False)
    )

    version = models.BudgetVersion(
        project_id=project.id,
        stage=stage,
        status="draft",
        version_no=next_version_no,
        revision_no=0,
        parent_version_id=None,
        change_reason="",
        budget_detail_json=detail_payload_to_json(default_detail_payload()),
        is_current=True,
        confirmed_at=None,
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(version)

    project.current_stage = stage
    project.updated_at = now_iso
    db.commit()
    db.refresh(version)
    return _serialize_version(version, db)


@router.post("/versions/{version_id}/confirm")
def confirm_version(
    version_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    version = _get_version_or_404(version_id, db)
    _require_version_edit_permission(version, user, db)
    if version.status == "confirmed":
        return {"message": "이미 확정된 버전입니다.", "version": _serialize_version(version, db)}
    if version.status not in {"draft", "revision"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft/revision can be confirmed.")

    now_iso = to_iso(utcnow())
    version.status = "confirmed"
    version.confirmed_at = now_iso
    version.updated_at = now_iso
    db.commit()
    db.refresh(version)
    return {"message": "버전이 확정되었습니다.", "version": _serialize_version(version, db)}


@router.post("/versions/{version_id}/confirm-cancel")
def cancel_confirm_version(
    version_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    version = _get_version_or_404(version_id, db)
    _require_version_edit_permission(version, user, db)
    if version.status != "confirmed":
        return {"message": "확정 상태가 아닙니다.", "version": _serialize_version(version, db)}

    now_iso = to_iso(utcnow())
    restore_status = "revision" if int(version.revision_no or 0) > 0 or version.parent_version_id else "draft"
    version.status = restore_status
    version.confirmed_at = None
    version.updated_at = now_iso
    db.commit()
    db.refresh(version)
    return {"message": "버전 확정을 취소했습니다.", "version": _serialize_version(version, db)}


@router.post("/versions/{version_id}/revision")
def create_revision(
    version_id: int,
    payload: BudgetRevisionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    source = _get_version_or_404(version_id, db)
    project = _require_version_edit_permission(source, user, db)
    current_stage = _effective_stage_for_project(project, source)
    if current_stage in _EXECUTION_ONLY_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제작/설치/워런티/종료 단계에서는 예산 리비전을 생성할 수 없습니다. 집행금액만 입력해 주세요.",
        )
    if source.status != "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only confirmed version can create revision.")

    reason = (payload.change_reason or "").strip()
    if len(reason) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Change reason is required.")

    now_iso = to_iso(utcnow())
    (
        db.query(models.BudgetVersion)
        .filter(
            models.BudgetVersion.project_id == source.project_id,
            models.BudgetVersion.stage == source.stage,
            models.BudgetVersion.is_current.is_(True),
        )
        .update({"is_current": False, "updated_at": now_iso}, synchronize_session=False)
    )

    revision = models.BudgetVersion(
        project_id=source.project_id,
        stage=source.stage,
        status="revision",
        version_no=source.version_no,
        revision_no=int(source.revision_no or 0) + 1,
        parent_version_id=source.id,
        change_reason=reason,
        budget_detail_json=source.budget_detail_json or detail_payload_to_json(default_detail_payload()),
        is_current=True,
        confirmed_at=None,
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(revision)
    db.flush()

    source_items = _version_equipments(source.id, db)
    for order, item in enumerate(source_items):
        db.add(
            models.BudgetEquipment(
                version_id=revision.id,
                equipment_name=item.equipment_name,
                material_fab_cost=to_number(item.material_fab_cost),
                material_install_cost=to_number(item.material_install_cost),
                labor_fab_cost=to_number(item.labor_fab_cost),
                labor_install_cost=to_number(item.labor_install_cost),
                expense_fab_cost=to_number(item.expense_fab_cost),
                expense_install_cost=to_number(item.expense_install_cost),
                currency=item.currency or "KRW",
                sort_order=order,
                created_at=now_iso,
                updated_at=now_iso,
            )
        )

    project.current_stage = source.stage
    project.updated_at = now_iso

    db.commit()
    db.refresh(revision)
    return {"message": "리비전이 생성되었습니다.", "version": _serialize_version(revision, db)}


@router.get("/versions/{version_id}/equipments")
def list_equipments(
    version_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    version = _get_version_or_404(version_id, db)
    items = _version_equipments(version.id, db)
    totals = summarize_costs(items)
    return {
        "version": _serialize_version(version, db),
        "items": [
            {
                "id": int(item.id),
                "equipment_name": item.equipment_name,
                "material_fab_cost": to_number(item.material_fab_cost),
                "material_install_cost": to_number(item.material_install_cost),
                "labor_fab_cost": to_number(item.labor_fab_cost),
                "labor_install_cost": to_number(item.labor_install_cost),
                "expense_fab_cost": to_number(item.expense_fab_cost),
                "expense_install_cost": to_number(item.expense_install_cost),
                "currency": item.currency or "KRW",
                "sort_order": int(item.sort_order or 0),
            }
            for item in items
        ],
        "totals": totals,
    }


@router.put("/versions/{version_id}/equipments")
def replace_equipments(
    version_id: int,
    payload: EquipmentBulkPayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    version = _get_version_or_404(version_id, db)
    project = _require_version_edit_permission(version, user, db)
    current_stage = _effective_stage_for_project(project, version)
    if current_stage in _EXECUTION_ONLY_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제작/설치/워런티/종료 단계에서는 예산(설비/항목)을 수정할 수 없습니다. 집행금액만 입력해 주세요.",
        )
    if version.status == "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Confirmed version cannot be edited.")

    now_iso = to_iso(utcnow())
    equipment_names: list[str] = []
    seen_names: set[str] = set()
    for item in payload.items:
        name = (item.equipment_name or "").strip()
        if not name or name in seen_names:
            continue
        seen_names.add(name)
        equipment_names.append(name)

    detail_dict = parse_detail_payload(version.budget_detail_json or "")
    synced_detail = _sync_detail_with_equipment_names(detail_dict, equipment_names)
    version.budget_detail_json = detail_payload_to_json(synced_detail)

    aggregated_by_name = {
        (item.get("equipment_name") or "").strip(): item
        for item in aggregate_equipment_costs_from_detail(synced_detail)
    }
    aggregated_items = []
    for index, name in enumerate(equipment_names):
        source = aggregated_by_name.get(name) or {}
        aggregated_items.append(
            {
                "equipment_name": name,
                "material_fab_cost": to_number(source.get("material_fab_cost")),
                "material_install_cost": to_number(source.get("material_install_cost")),
                "labor_fab_cost": to_number(source.get("labor_fab_cost")),
                "labor_install_cost": to_number(source.get("labor_install_cost")),
                "expense_fab_cost": to_number(source.get("expense_fab_cost")),
                "expense_install_cost": to_number(source.get("expense_install_cost")),
                "currency": (source.get("currency") or "KRW").strip() or "KRW",
                "sort_order": index,
            }
        )

    _replace_equipments_from_aggregate(version, aggregated_items=aggregated_items, db=db, now_iso=now_iso)

    version.updated_at = now_iso
    db.commit()
    return list_equipments(version_id=version.id, db=db, _=user)


@router.get("/versions/{version_id}/details")
def get_version_details(
    version_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    version = _get_version_or_404(version_id, db)
    payload = parse_detail_payload(version.budget_detail_json or "")
    totals = summarize_costs(_version_equipments(version.id, db))
    project = _get_project_or_404(version.project_id, db)
    current_stage = _effective_stage_for_project(project, version)
    if current_stage == _REVIEW_STAGE:
        sanitized = {
            **payload,
            "material_items": [{**row, "executed_amount": 0.0} for row in (payload.get("material_items") or []) if isinstance(row, dict)],
            "labor_items": [{**row, "executed_amount": 0.0} for row in (payload.get("labor_items") or []) if isinstance(row, dict)],
            "expense_items": [{**row, "executed_amount": 0.0} for row in (payload.get("expense_items") or []) if isinstance(row, dict)],
            "execution_material_items": [],
            "execution_labor_items": [],
            "execution_expense_items": [],
        }
        payload = sanitized
    return {
        "version": _serialize_version(version, db),
        "project": _serialize_project(project, db, user=user),
        "details": payload,
        "totals": totals,
    }


@router.put("/versions/{version_id}/details")
def upsert_version_details(
    version_id: int,
    payload: BudgetDetailPayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    version = _get_version_or_404(version_id, db)
    project = _require_version_edit_permission(version, user, db)
    detail_dict = {
        "material_items": [item.model_dump() for item in payload.material_items],
        "labor_items": [item.model_dump() for item in payload.labor_items],
        "expense_items": [item.model_dump() for item in payload.expense_items],
        "execution_material_items": [item.model_dump() for item in payload.execution_material_items],
        "execution_labor_items": [item.model_dump() for item in payload.execution_labor_items],
        "execution_expense_items": [item.model_dump() for item in payload.execution_expense_items],
        "budget_settings": dict(payload.budget_settings or {}),
    }

    current_stage = _effective_stage_for_project(project, version)
    if current_stage == _REVIEW_STAGE:
        for key in ("material_items", "labor_items", "expense_items"):
            for row in detail_dict.get(key, []):
                if not isinstance(row, dict):
                    continue
                row["executed_amount"] = 0.0

        # Review stage: budget input only. Always strip executions to keep data consistent.
        detail_dict["execution_material_items"] = []
        detail_dict["execution_labor_items"] = []
        detail_dict["execution_expense_items"] = []
    elif current_stage in _EXECUTION_ONLY_STAGES:
        existing_detail = parse_detail_payload(version.budget_detail_json or "")
        # Execution-only stages: keep budget + settings fixed, only accept execution rows.
        detail_dict = {
            "material_items": list(existing_detail.get("material_items", []) or []),
            "labor_items": list(existing_detail.get("labor_items", []) or []),
            "expense_items": list(existing_detail.get("expense_items", []) or []),
            "execution_material_items": detail_dict.get("execution_material_items", []) or [],
            "execution_labor_items": detail_dict.get("execution_labor_items", []) or [],
            "execution_expense_items": detail_dict.get("execution_expense_items", []) or [],
            "budget_settings": dict(existing_detail.get("budget_settings") or {}),
        }

    if version.status == "confirmed":
        existing_detail = parse_detail_payload(version.budget_detail_json or "")
        if _budget_lock_signature(existing_detail) != _budget_lock_signature(detail_dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="확정 버전에서는 예산 항목을 변경할 수 없습니다. 예산 변경 버튼으로 리비전을 생성해 주세요.",
            )

    now_iso = to_iso(utcnow())
    version.budget_detail_json = detail_payload_to_json(detail_dict)
    aggregated = aggregate_equipment_costs_from_detail(detail_dict)
    _replace_equipments_from_aggregate(version, aggregated_items=aggregated, db=db, now_iso=now_iso)

    version.updated_at = now_iso
    db.commit()
    db.refresh(version)
    return get_version_details(version_id=version.id, db=db, user=user)


@router.get("/projects/{project_id}/summary")
def project_summary(
    project_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    stage_summaries = {}

    for stage_code in ("review", "design", "fabrication", "installation", "warranty", "closure"):
        current_version = (
            db.query(models.BudgetVersion)
            .filter(
                models.BudgetVersion.project_id == project.id,
                models.BudgetVersion.stage == stage_code,
                models.BudgetVersion.is_current.is_(True),
            )
            .order_by(models.BudgetVersion.updated_at.desc(), models.BudgetVersion.id.desc())
            .first()
        )
        if not current_version:
            stage_summaries[stage_code] = {
                "stage_label": stage_label(stage_code),
                "version_id": None,
                "totals": summarize_costs([]),
            }
            continue

        totals = summarize_costs(_version_equipments(current_version.id, db))
        stage_summaries[stage_code] = {
            "stage_label": stage_label(stage_code),
            "version_id": int(current_version.id),
            "totals": totals,
        }

    return {
        "project": _serialize_project(project, db, user=user),
        "stages": stage_summaries,
    }
