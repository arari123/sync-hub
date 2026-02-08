from __future__ import annotations

import json
import os
import re
from datetime import timedelta
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
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
    "as": "as",
}

_SEARCH_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")
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


class BudgetProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    project_type: Optional[str] = Field(default="equipment", max_length=32)
    customer_name: Optional[str] = Field(default=None, max_length=180)
    installation_site: Optional[str] = Field(default=None, max_length=180)
    manager_user_id: Optional[int] = Field(default=None, ge=1)


class BudgetProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    project_type: Optional[str] = Field(default=None, max_length=32)
    customer_name: Optional[str] = Field(default=None, max_length=180)
    installation_site: Optional[str] = Field(default=None, max_length=180)
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
    expense_name: str = Field(default="", max_length=180)
    basis: str = Field(default="", max_length=180)
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
    worker_type: str = Field(default="", max_length=120)
    executed_amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class ExpenseExecutionItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
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
        "fabrication": 1,
        "installation": 2,
        "warranty": 3,
        "closure": 4,
    }
    return order.get((stage or "").strip().lower(), 0)


def _project_spent_ratio(stage: Optional[str], project_id: int) -> float:
    base = {
        "review": 0.12,
        "fabrication": 0.48,
        "installation": 0.82,
        "warranty": 0.94,
        "closure": 1.0,
    }.get((stage or "").strip().lower(), 0.12)
    variation = ((int(project_id) % 9) - 4) * 0.015
    return max(0.0, min(1.15, base + variation))


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

    if executed_total > 0:
        actual_spent_material = round(executed_material, 2)
        actual_spent_labor = round(executed_labor, 2)
        actual_spent_expense = round(executed_expense, 2)
        actual_spent_total = round(executed_total, 2)
    elif confirmed_budget_total > 0:
        spent_ratio = _project_spent_ratio(project.current_stage, int(project.id or 0))
        actual_spent_material = round(confirmed_material * spent_ratio, 2)
        actual_spent_labor = round(confirmed_labor * spent_ratio, 2)
        actual_spent_expense = round(confirmed_expense * spent_ratio, 2)
        actual_spent_total = round(confirmed_budget_total * spent_ratio, 2)
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

    stage_rank = _project_stage_rank(project.current_stage)
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
                (item.get("expense_name") or "").strip(),
                (item.get("basis") or "").strip(),
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
    if current:
        totals = summarize_costs(_version_equipments(current.id, db))
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
        "customer_name": project.customer_name or "",
        "installation_site": project.installation_site or "",
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
    return tokens


def _project_search_score(project_payload: dict, query: str, tokens: list[str]) -> float:
    name = (project_payload.get("name") or "").strip()
    description = (project_payload.get("description") or "").strip()
    code = (project_payload.get("code") or "").strip()
    customer_name = (project_payload.get("customer_name") or "").strip()
    manager_name = (project_payload.get("manager_name") or "").strip()

    query_lower = (query or "").strip().lower()
    name_lower = name.lower()
    description_lower = description.lower()
    code_lower = code.lower()
    customer_lower = customer_name.lower()
    manager_lower = manager_name.lower()

    haystack = " ".join(
        part for part in (name, description, code, customer_name, manager_name) if part
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
        if token in description_lower:
            score += 0.8

    if not exact_phrase_match and len(tokens) >= 2:
        required_token_matches = 2 if len(tokens) <= 3 else 3
        if matched_tokens < required_token_matches:
            return 0.0

    return score


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
            manager_name=(manager_name or author_name),
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
    all_projects = (
        db.query(models.BudgetProject)
        .order_by(models.BudgetProject.updated_at.desc(), models.BudgetProject.id.desc())
        .all()
    )

    scored_results: list[dict] = []
    for project in all_projects:
        current_version = _get_current_version_for_project(project, db)
        if not _is_project_visible_to_user(project, current_version=current_version, user=user):
            continue

        payload = _serialize_project(project, db, user=user, current_version=current_version)
        score = _project_search_score(payload, query, tokens)
        if score <= 0:
            continue

        scored_results.append(
            {
                "project_id": payload.get("id"),
                "name": payload.get("name") or "",
                "description": payload.get("description") or "",
                "customer_name": payload.get("customer_name") or "",
                "manager_name": payload.get("manager_name") or "",
                "current_stage": payload.get("current_stage") or "",
                "current_stage_label": payload.get("current_stage_label") or "",
                "score": score,
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

    manager_user_id = int(payload.manager_user_id) if payload.manager_user_id is not None else int(user.id)
    manager = db.query(models.User).filter(models.User.id == manager_user_id).first()
    if not manager or not manager.is_active or not manager.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid manager_user_id.")

    now_iso = to_iso(utcnow())
    project = models.BudgetProject(
        name=(payload.name or "").strip(),
        code=code,
        description=(payload.description or "").strip() or None,
        project_type=project_type,
        customer_name=(payload.customer_name or "").strip() or None,
        installation_site=(payload.installation_site or "").strip() or None,
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

    if changed:
        project.updated_at = to_iso(utcnow())
        db.commit()
        db.refresh(project)

    return _serialize_project(project, db, user=user)


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


@router.post("/versions/{version_id}/revision")
def create_revision(
    version_id: int,
    payload: BudgetRevisionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    source = _get_version_or_404(version_id, db)
    project = _require_version_edit_permission(source, user, db)
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
    _require_version_edit_permission(version, user, db)
    if version.status == "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Confirmed version cannot be edited.")

    now_iso = to_iso(utcnow())
    aggregated_items = []
    for index, item in enumerate(payload.items):
        name = (item.equipment_name or "").strip()
        if not name:
            continue
        aggregated_items.append(
            {
                "equipment_name": name,
                "material_fab_cost": to_number(item.material_fab_cost),
                "material_install_cost": to_number(item.material_install_cost),
                "labor_fab_cost": to_number(item.labor_fab_cost),
                "labor_install_cost": to_number(item.labor_install_cost),
                "expense_fab_cost": to_number(item.expense_fab_cost),
                "expense_install_cost": to_number(item.expense_install_cost),
                "currency": (item.currency or "KRW").strip() or "KRW",
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
    _require_version_edit_permission(version, user, db)
    detail_dict = {
        "material_items": [item.model_dump() for item in payload.material_items],
        "labor_items": [item.model_dump() for item in payload.labor_items],
        "expense_items": [item.model_dump() for item in payload.expense_items],
        "execution_material_items": [item.model_dump() for item in payload.execution_material_items],
        "execution_labor_items": [item.model_dump() for item in payload.execution_labor_items],
        "execution_expense_items": [item.model_dump() for item in payload.execution_expense_items],
        "budget_settings": dict(payload.budget_settings or {}),
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

    for stage_code in ("review", "fabrication", "installation", "warranty", "closure"):
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
