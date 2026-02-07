from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..core.auth_utils import to_iso, utcnow
from ..core.budget_logic import normalize_stage, stage_label, summarize_costs, to_number
from ..database import get_db

router = APIRouter(prefix="/budget", tags=["budget"])


class BudgetProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)


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


def _serialize_version(version: models.BudgetVersion, db: Session) -> dict:
    equipments = _version_equipments(version.id, db)
    totals = summarize_costs(equipments)
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
        "totals": totals,
    }


def _serialize_project(project: models.BudgetProject, db: Session) -> dict:
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

    if current_version:
        totals = summarize_costs(_version_equipments(current_version.id, db))
        current_version_id = int(current_version.id)
    else:
        totals = summarize_costs([])
        current_version_id = None

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
        "current_stage": project.current_stage,
        "current_stage_label": stage_label(project.current_stage),
        "current_version_id": current_version_id,
        "version_count": int(version_count),
        "totals": totals,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


@router.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    projects = (
        db.query(models.BudgetProject)
        .order_by(models.BudgetProject.updated_at.desc(), models.BudgetProject.id.desc())
        .all()
    )
    return [_serialize_project(project, db) for project in projects]


@router.post("/projects")
def create_project(payload: BudgetProjectCreate, db: Session = Depends(get_db)):
    code = (payload.code or "").strip() or None
    if code:
        exists = db.query(models.BudgetProject).filter(models.BudgetProject.code == code).first()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project code already exists.")

    now_iso = to_iso(utcnow())
    project = models.BudgetProject(
        name=(payload.name or "").strip(),
        code=code,
        description=(payload.description or "").strip() or None,
        current_stage="review",
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _serialize_project(project, db)


@router.get("/projects/{project_id}/versions")
def list_versions(
    project_id: int,
    stage: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
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
        "project": _serialize_project(project, db),
        "versions": [_serialize_version(version, db) for version in versions],
    }


@router.post("/projects/{project_id}/versions")
def create_version(project_id: int, payload: BudgetVersionCreate, db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
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
def confirm_version(version_id: int, db: Session = Depends(get_db)):
    version = _get_version_or_404(version_id, db)
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
def create_revision(version_id: int, payload: BudgetRevisionCreate, db: Session = Depends(get_db)):
    source = _get_version_or_404(version_id, db)
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

    project = _get_project_or_404(source.project_id, db)
    project.current_stage = source.stage
    project.updated_at = now_iso

    db.commit()
    db.refresh(revision)
    return {"message": "리비전이 생성되었습니다.", "version": _serialize_version(revision, db)}


@router.get("/versions/{version_id}/equipments")
def list_equipments(version_id: int, db: Session = Depends(get_db)):
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
def replace_equipments(version_id: int, payload: EquipmentBulkPayload, db: Session = Depends(get_db)):
    version = _get_version_or_404(version_id, db)
    if version.status == "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Confirmed version cannot be edited.")

    now_iso = to_iso(utcnow())
    (
        db.query(models.BudgetEquipment)
        .filter(models.BudgetEquipment.version_id == version.id)
        .delete(synchronize_session=False)
    )

    for index, item in enumerate(payload.items):
        name = (item.equipment_name or "").strip()
        if not name:
            continue
        db.add(
            models.BudgetEquipment(
                version_id=version.id,
                equipment_name=name,
                material_fab_cost=to_number(item.material_fab_cost),
                material_install_cost=to_number(item.material_install_cost),
                labor_fab_cost=to_number(item.labor_fab_cost),
                labor_install_cost=to_number(item.labor_install_cost),
                expense_fab_cost=to_number(item.expense_fab_cost),
                expense_install_cost=to_number(item.expense_install_cost),
                currency=(item.currency or "KRW").strip() or "KRW",
                sort_order=index,
                created_at=now_iso,
                updated_at=now_iso,
            )
        )

    version.updated_at = now_iso
    db.commit()
    return list_equipments(version_id=version.id, db=db)


@router.get("/projects/{project_id}/summary")
def project_summary(project_id: int, db: Session = Depends(get_db)):
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
        "project": _serialize_project(project, db),
        "stages": stage_summaries,
    }
