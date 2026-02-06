from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..core.dedup.service import set_cluster_primary, set_document_ignored
from ..database import get_db


router = APIRouter(prefix="/api/admin/dedup", tags=["admin-dedup"])


def _preview(text: str, limit: int = 200) -> str:
    body = (text or "").replace("\n", " ").strip()
    if len(body) <= limit:
        return body
    return f"{body[:limit].strip()}..."


@router.get("/clusters")
def list_dedup_clusters(status: str = "all", limit: int = 20, db: Session = Depends(get_db)):
    status_value = (status or "all").strip().lower()
    if status_value not in {"all", "near_dup", "exact_dup"}:
        raise HTTPException(status_code=400, detail="status must be all|near_dup|exact_dup")

    limit = max(1, min(limit, 100))

    query = db.query(models.DedupCluster).order_by(models.DedupCluster.updated_at.desc())

    if status_value == "near_dup":
        query = query.filter(models.DedupCluster.method.in_(["minhash", "doc_embedding", "hybrid"]))
    elif status_value == "exact_dup":
        query = query.filter(models.DedupCluster.method == "exact")

    clusters = query.limit(limit).all()
    output = []

    for cluster in clusters:
        member_count = (
            db.query(models.DedupClusterMember)
            .filter(models.DedupClusterMember.cluster_id == cluster.id)
            .count()
        )

        primary_doc = None
        if cluster.primary_doc_id:
            primary_doc = (
                db.query(models.Document)
                .filter(models.Document.id == cluster.primary_doc_id)
                .first()
            )

        output.append(
            {
                "cluster_id": cluster.id,
                "method": cluster.method,
                "primary_doc_id": cluster.primary_doc_id,
                "primary_filename": primary_doc.filename if primary_doc else None,
                "member_count": member_count,
                "threshold_used": cluster.threshold_used,
                "created_at": cluster.created_at,
                "updated_at": cluster.updated_at,
                "notes": cluster.notes,
            }
        )

    return output


@router.get("/clusters/{cluster_id}")
def get_dedup_cluster(cluster_id: int, db: Session = Depends(get_db)):
    cluster = db.query(models.DedupCluster).filter(models.DedupCluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    members = (
        db.query(models.DedupClusterMember)
        .filter(models.DedupClusterMember.cluster_id == cluster.id)
        .order_by(models.DedupClusterMember.is_primary.desc(), models.DedupClusterMember.doc_id.asc())
        .all()
    )

    member_docs = {
        document.id: document
        for document in db.query(models.Document).filter(
            models.Document.id.in_([member.doc_id for member in members])
        ).all()
    }

    items = []
    for member in members:
        document = member_docs.get(member.doc_id)
        items.append(
            {
                "doc_id": member.doc_id,
                "filename": document.filename if document else None,
                "status": document.status if document else None,
                "dedup_status": document.dedup_status if document else None,
                "similarity_score": member.similarity_score,
                "is_primary": member.is_primary,
                "created_at": document.created_at if document else None,
                "preview": _preview(document.content_text if document else "", limit=220),
            }
        )

    return {
        "cluster_id": cluster.id,
        "method": cluster.method,
        "primary_doc_id": cluster.primary_doc_id,
        "threshold_used": cluster.threshold_used,
        "notes": cluster.notes,
        "created_at": cluster.created_at,
        "updated_at": cluster.updated_at,
        "members": items,
    }


@router.post("/clusters/{cluster_id}/set_primary")
def set_dedup_cluster_primary(
    cluster_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    cluster = db.query(models.DedupCluster).filter(models.DedupCluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    if "primary_doc_id" not in payload:
        raise HTTPException(status_code=400, detail="primary_doc_id is required")

    try:
        primary_doc_id = int(payload["primary_doc_id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="primary_doc_id must be an integer")

    try:
        result = set_cluster_primary(db, cluster, primary_doc_id=primary_doc_id, actor="admin_api")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    db.commit()
    return result


@router.post("/documents/{doc_id}/ignore")
def ignore_dedup_document(doc_id: int, db: Session = Depends(get_db)):
    document = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    result = set_document_ignored(db, document, actor="admin_api")
    db.commit()
    return result


@router.get("/audit")
def list_dedup_audit_logs(limit: int = 50, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 200))
    logs = (
        db.query(models.DedupAuditLog)
        .order_by(models.DedupAuditLog.created_at.desc(), models.DedupAuditLog.id.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": item.id,
            "action": item.action,
            "actor": item.actor,
            "cluster_id": item.cluster_id,
            "doc_id": item.doc_id,
            "previous_primary_doc_id": item.previous_primary_doc_id,
            "new_primary_doc_id": item.new_primary_doc_id,
            "detail_json": item.detail_json,
            "created_at": item.created_at,
        }
        for item in logs
    ]
