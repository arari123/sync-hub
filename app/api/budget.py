from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..core.auth_utils import to_iso, utcnow
from ..core.budget_logic import (
    aggregate_equipment_costs_from_detail,
    default_detail_payload,
    detail_payload_to_json,
    normalize_stage,
    parse_detail_payload,
    stage_label,
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


class BudgetProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    project_type: Optional[str] = Field(default="equipment", max_length=32)
    customer_name: Optional[str] = Field(default=None, max_length=180)
    installation_site: Optional[str] = Field(default=None, max_length=180)


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
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class LaborDetailItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    task_name: str = Field(default="", max_length=180)
    worker_type: str = Field(default="", max_length=120)
    unit: str = Field(default="H", max_length=8)
    quantity: float = 0.0
    hourly_rate: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class ExpenseDetailItem(BaseModel):
    equipment_name: str = Field(..., min_length=1, max_length=180)
    expense_name: str = Field(default="", max_length=180)
    basis: str = Field(default="", max_length=180)
    amount: float = 0.0
    phase: str = Field(default="fabrication", max_length=32)
    memo: str = Field(default="", max_length=300)


class BudgetDetailPayload(BaseModel):
    material_items: list[MaterialDetailItem] = Field(default_factory=list)
    labor_items: list[LaborDetailItem] = Field(default_factory=list)
    expense_items: list[ExpenseDetailItem] = Field(default_factory=list)


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
        "totals": totals,
    }


def _user_display_name(user: Optional[models.User]) -> str:
    if not user:
        return "작성자 미지정"
    full_name = (user.full_name or "").strip()
    return full_name or user.email


def _project_owner(project: models.BudgetProject, db: Session) -> Optional[models.User]:
    if not project.created_by_user_id:
        return None
    return db.query(models.User).filter(models.User.id == project.created_by_user_id).first()


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


def _project_can_edit(project: models.BudgetProject, user: Optional[models.User]) -> bool:
    if not user:
        return False
    if project.created_by_user_id is None:
        return True
    return int(project.created_by_user_id) == int(user.id)


def _is_my_project(project: models.BudgetProject, user: Optional[models.User]) -> bool:
    if not user or project.created_by_user_id is None:
        return False
    return int(project.created_by_user_id) == int(user.id)


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
        project.updated_at = to_iso(utcnow())
        return
    if int(project.created_by_user_id) != int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No edit permission for this project.")


def _require_version_edit_permission(version: models.BudgetVersion, user: models.User, db: Session) -> models.BudgetProject:
    project = _get_project_or_404(version.project_id, db)
    _require_project_edit_permission(project, user)
    return project


def _serialize_project(
    project: models.BudgetProject,
    db: Session,
    user: Optional[models.User] = None,
    current_version: Optional[models.BudgetVersion] = None,
) -> dict:
    current = current_version or _get_current_version_for_project(project, db)
    if current:
        totals = summarize_costs(_version_equipments(current.id, db))
        current_version_id = int(current.id)
    else:
        totals = summarize_costs([])
        current_version_id = None

    monitoring = {
        "confirmed_budget_total": totals.get("grand_total", 0.0),
        "actual_spent_total": None,
        "variance_total": None,
    }
    owner = _project_owner(project, db)

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
        "current_stage": project.current_stage,
        "current_stage_label": stage_label(project.current_stage),
        "current_version_id": current_version_id,
        "version_count": int(version_count),
        "author_name": _user_display_name(owner),
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
    project_type: Optional[str],
    customer_name: Optional[str],
    author_name: Optional[str],
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

    if project_type:
        normalized_filter = _normalize_project_type(project_type)
        if (project_payload.get("project_type") or "") != normalized_filter:
            return False

    customer_filter = (customer_name or "").strip().lower()
    if customer_filter:
        if customer_filter not in (project_payload.get("customer_name") or "").lower():
            return False

    author_filter = (author_name or "").strip().lower()
    if author_filter:
        if author_filter not in (project_payload.get("author_name") or "").lower():
            return False

    grand_total = to_number((project_payload.get("totals") or {}).get("grand_total"))
    if min_total is not None and grand_total < to_number(min_total):
        return False
    if max_total is not None and grand_total > to_number(max_total):
        return False
    return True


@router.get("/projects")
def list_projects(
    project_name: Optional[str] = Query(default=None, max_length=120),
    project_code: Optional[str] = Query(default=None, max_length=64),
    project_type: Optional[str] = Query(default=None, max_length=32),
    customer_name: Optional[str] = Query(default=None, max_length=180),
    author_name: Optional[str] = Query(default=None, max_length=180),
    min_total: Optional[float] = Query(default=None),
    max_total: Optional[float] = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if min_total is not None and max_total is not None and to_number(min_total) > to_number(max_total):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="min_total cannot exceed max_total.")

    if project_type:
        try:
            _normalize_project_type(project_type)
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
            project_type=project_type,
            customer_name=customer_name,
            author_name=author_name,
            min_total=min_total,
            max_total=max_total,
        ):
            continue
        visible_projects.append(payload)
    return visible_projects


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

    now_iso = to_iso(utcnow())
    project = models.BudgetProject(
        name=(payload.name or "").strip(),
        code=code,
        description=(payload.description or "").strip() or None,
        project_type=project_type,
        customer_name=(payload.customer_name or "").strip() or None,
        installation_site=(payload.installation_site or "").strip() or None,
        created_by_user_id=int(user.id),
        current_stage="review",
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(project)
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
    if version.status == "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Confirmed version cannot be edited.")

    now_iso = to_iso(utcnow())
    detail_dict = {
        "material_items": [item.model_dump() for item in payload.material_items],
        "labor_items": [item.model_dump() for item in payload.labor_items],
        "expense_items": [item.model_dump() for item in payload.expense_items],
    }
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

    for stage_code in ("review", "progress", "closure"):
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
