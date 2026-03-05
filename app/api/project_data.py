from __future__ import annotations

import os
import re
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..core.auth_utils import to_iso, utcnow
from ..core.vector_store import vector_store
from ..database import get_db
from .auth import get_current_user
from .documents import _safe_original_filename, upload_document_impl

router = APIRouter(prefix="/budget", tags=["project-data"])

ROOT_FOLDER_NAME = "기본 폴더"
SEARCH_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")
SEARCH_STOPWORDS = {
    "파일",
    "문서",
    "자료",
    "코멘트",
    "업로드",
    "이름",
}
UPLOADS_ROOT_ABS = os.path.abspath("uploads")


class FolderCreatePayload(BaseModel):
    parent_folder_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=180)


class FolderUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    parent_folder_id: int | None = Field(default=None, ge=1)


class FileUpdatePayload(BaseModel):
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    folder_id: int | None = Field(default=None, ge=1)
    comment: str | None = Field(default=None, max_length=500)


def _remove_file_if_under_uploads(file_path: str) -> None:
    abs_path = os.path.abspath(file_path or "")
    if not abs_path:
        return
    try:
        if os.path.commonpath([abs_path, UPLOADS_ROOT_ABS]) != UPLOADS_ROOT_ABS:
            return
    except ValueError:
        return

    if not os.path.isfile(abs_path):
        return
    try:
        os.remove(abs_path)
    except Exception:  # noqa: BLE001
        pass


def _get_project_or_404(project_id: int, db: Session) -> models.BudgetProject:
    project = db.query(models.BudgetProject).filter(models.BudgetProject.id == int(project_id)).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


def _normalize_folder_name(value: str) -> str:
    return str(value or "").strip()


def _ensure_root_folder(project_id: int, db: Session) -> models.DocumentFolder:
    root = (
        db.query(models.DocumentFolder)
        .filter(
            models.DocumentFolder.project_id == int(project_id),
            models.DocumentFolder.is_system_root.is_(True),
        )
        .order_by(models.DocumentFolder.id.asc())
        .first()
    )
    if root is not None:
        return root

    now_iso = to_iso(utcnow())
    root = models.DocumentFolder(
        project_id=int(project_id),
        parent_folder_id=None,
        name=ROOT_FOLDER_NAME,
        sort_order=0,
        is_system_root=True,
        created_by_user_id=None,
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(root)
    db.commit()
    db.refresh(root)
    return root


def _get_project_folder_or_404(project_id: int, folder_id: int, db: Session) -> models.DocumentFolder:
    folder = (
        db.query(models.DocumentFolder)
        .filter(
            models.DocumentFolder.id == int(folder_id),
            models.DocumentFolder.project_id == int(project_id),
        )
        .first()
    )
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")
    return folder


def _build_folder_tree(project_id: int, db: Session) -> tuple[models.DocumentFolder, list[dict[str, Any]]]:
    root = _ensure_root_folder(project_id, db)

    folders = (
        db.query(models.DocumentFolder)
        .filter(models.DocumentFolder.project_id == int(project_id))
        .order_by(models.DocumentFolder.sort_order.asc(), models.DocumentFolder.id.asc())
        .all()
    )
    file_count_by_folder: dict[int, int] = {}
    for folder_id, count in (
        db.query(models.Document.folder_id, models.Document.id)
        .filter(
            models.Document.project_id == int(project_id),
            models.Document.folder_id.isnot(None),
        )
        .all()
    ):
        if folder_id is None:
            continue
        file_count_by_folder[int(folder_id)] = file_count_by_folder.get(int(folder_id), 0) + 1

    node_map: dict[int, dict[str, Any]] = {}
    for folder in folders:
        node_map[int(folder.id)] = {
            "id": int(folder.id),
            "project_id": int(folder.project_id),
            "parent_folder_id": int(folder.parent_folder_id) if folder.parent_folder_id is not None else None,
            "name": folder.name,
            "sort_order": int(folder.sort_order or 0),
            "is_system_root": bool(folder.is_system_root),
            "created_at": folder.created_at,
            "updated_at": folder.updated_at,
            "file_count": int(file_count_by_folder.get(int(folder.id), 0)),
            "children": [],
        }

    roots: list[dict[str, Any]] = []
    for folder in folders:
        node = node_map[int(folder.id)]
        parent_id = int(folder.parent_folder_id) if folder.parent_folder_id is not None else None
        if parent_id is None or parent_id not in node_map:
            roots.append(node)
            continue
        node_map[parent_id]["children"].append(node)

    return root, roots


def _collect_folder_descendants(
    project_id: int,
    folder_id: int,
    db: Session,
) -> list[int]:
    folders = (
        db.query(models.DocumentFolder.id, models.DocumentFolder.parent_folder_id)
        .filter(models.DocumentFolder.project_id == int(project_id))
        .all()
    )
    by_parent: dict[int | None, list[int]] = {}
    for child_id, parent_id in folders:
        parent_key = int(parent_id) if parent_id is not None else None
        by_parent.setdefault(parent_key, []).append(int(child_id))

    ordered: list[int] = []
    queue = [int(folder_id)]
    seen = set()
    while queue:
        current = int(queue.pop(0))
        if current in seen:
            continue
        seen.add(current)
        ordered.append(current)
        queue.extend(by_parent.get(current, []))
    return ordered


def _collect_folder_parent_map(project_id: int, db: Session) -> dict[int, int | None]:
    return {
        int(folder_id): (int(parent_id) if parent_id is not None else None)
        for folder_id, parent_id in (
            db.query(models.DocumentFolder.id, models.DocumentFolder.parent_folder_id)
            .filter(models.DocumentFolder.project_id == int(project_id))
            .all()
        )
    }


def _is_cycle_move(folder_id: int, new_parent_id: int | None, parent_map: dict[int, int | None]) -> bool:
    current = int(new_parent_id) if new_parent_id is not None else None
    target = int(folder_id)
    while current is not None:
        if current == target:
            return True
        current = parent_map.get(current)
    return False


def _delete_documents_completely(document_ids: list[int], db: Session) -> None:
    doc_ids = sorted({int(doc_id) for doc_id in document_ids if int(doc_id) > 0})
    if not doc_ids:
        return

    documents = (
        db.query(models.Document)
        .filter(models.Document.id.in_(doc_ids))
        .all()
    )
    for item in documents:
        _remove_file_if_under_uploads(item.file_path or "")
        try:
            vector_store.delete_document(int(item.id))
        except Exception:  # noqa: BLE001
            pass

    affected_cluster_ids = set()
    for cluster_id, in (
        db.query(models.DedupClusterMember.cluster_id)
        .filter(models.DedupClusterMember.doc_id.in_(doc_ids))
        .distinct()
        .all()
    ):
        if cluster_id is not None:
            affected_cluster_ids.add(int(cluster_id))
    for cluster_id, in (
        db.query(models.Document.dedup_cluster_id)
        .filter(models.Document.id.in_(doc_ids))
        .distinct()
        .all()
    ):
        if cluster_id is not None:
            affected_cluster_ids.add(int(cluster_id))

    (
        db.query(models.DedupAuditLog)
        .filter(models.DedupAuditLog.doc_id.in_(doc_ids))
        .delete(synchronize_session=False)
    )
    (
        db.query(models.DedupClusterMember)
        .filter(models.DedupClusterMember.doc_id.in_(doc_ids))
        .delete(synchronize_session=False)
    )
    (
        db.query(models.Document)
        .filter(models.Document.id.in_(doc_ids))
        .delete(synchronize_session=False)
    )

    now_iso = to_iso(utcnow())
    for cluster_id in sorted(affected_cluster_ids):
        members = (
            db.query(models.DedupClusterMember)
            .filter(models.DedupClusterMember.cluster_id == int(cluster_id))
            .order_by(models.DedupClusterMember.is_primary.desc(), models.DedupClusterMember.doc_id.asc())
            .all()
        )
        cluster = db.query(models.DedupCluster).filter(models.DedupCluster.id == int(cluster_id)).first()
        if cluster is None:
            continue

        if not members:
            (
                db.query(models.DedupAuditLog)
                .filter(models.DedupAuditLog.cluster_id == int(cluster_id))
                .delete(synchronize_session=False)
            )
            (
                db.query(models.Document)
                .filter(models.Document.dedup_cluster_id == int(cluster_id))
                .update(
                    {
                        models.Document.dedup_cluster_id: None,
                        models.Document.dedup_primary_doc_id: None,
                        models.Document.dedup_status: "unique",
                    },
                    synchronize_session=False,
                )
            )
            db.delete(cluster)
            continue

        primary_doc_id = int(members[0].doc_id)
        cluster.primary_doc_id = primary_doc_id
        cluster.updated_at = now_iso
        for index, member in enumerate(members):
            member.is_primary = index == 0
        (
            db.query(models.Document)
            .filter(models.Document.dedup_cluster_id == int(cluster_id))
            .update(
                {
                    models.Document.dedup_primary_doc_id: primary_doc_id,
                    models.Document.dedup_status: "duplicate",
                },
                synchronize_session=False,
            )
        )


def _normalize_search_tokens(query: str) -> list[str]:
    raw_query = str(query or "").strip()
    if not raw_query:
        return []

    tokens: list[str] = []
    seen: set[str] = set()

    parts = re.split(r"\s+", raw_query)
    parts.extend(SEARCH_TOKEN_PATTERN.findall(raw_query))

    for part in parts:
        token = str(part or "").strip()
        if len(token) < 2:
            continue
        lowered = token.lower()
        if lowered in SEARCH_STOPWORDS or lowered in seen:
            continue
        seen.add(lowered)
        tokens.append(token)
    return tokens


def _score_project_file_document(doc: models.Document, query: str, tokens: list[str]) -> tuple[float, list[str]]:
    query_lower = str(query or "").strip().lower()
    token_lowers = [str(token).lower() for token in tokens if str(token).strip()]

    filename = str(doc.filename or "").lower()
    ai_title = str(doc.ai_title or "").lower()
    ai_summary = str(doc.ai_summary_short or "").lower()
    content = str(doc.content_text or "").lower()
    comment = str(doc.upload_comment or "").lower()
    haystack = " ".join([filename, ai_title, ai_summary, content, comment])

    if not haystack.strip():
        return 0.0, []

    phrase_hit = 1 if query_lower and query_lower in haystack else 0
    matched_terms: list[str] = []
    matched_terms_lower: set[str] = set()

    def _add_match(token: str, target: str, weight: float) -> float:
        token_lower = token.lower()
        if not token_lower or token_lower not in target:
            return 0.0
        if token_lower not in matched_terms_lower:
            matched_terms_lower.add(token_lower)
            matched_terms.append(token)
        return weight

    score = 0.0
    for token in tokens:
        score += _add_match(token, filename, 1.5)
        score += _add_match(token, ai_title, 1.2)
        score += _add_match(token, comment, 1.1)
        score += _add_match(token, ai_summary, 0.9)
        score += _add_match(token, content, 0.5)

    if phrase_hit:
        score += 2.4

    if not phrase_hit and len(token_lowers) >= 2:
        required_matches = 2 if len(token_lowers) <= 3 else 3
        if len(matched_terms) < required_matches:
            return 0.0, []

    return score, matched_terms


@router.get("/projects/{project_id}/data/folders")
def list_project_data_folders(
    project_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _ = user
    _get_project_or_404(project_id, db)
    root, tree = _build_folder_tree(project_id, db)
    return {
        "root_folder_id": int(root.id),
        "items": tree,
    }


@router.post("/projects/{project_id}/data/folders")
def create_project_data_folder(
    project_id: int,
    payload: FolderCreatePayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _get_project_or_404(project_id, db)
    parent = _get_project_folder_or_404(project_id, payload.parent_folder_id, db)

    normalized_name = _normalize_folder_name(payload.name)
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Folder name is required.")

    duplicate = (
        db.query(models.DocumentFolder)
        .filter(
            models.DocumentFolder.project_id == int(project_id),
            models.DocumentFolder.parent_folder_id == int(parent.id),
            models.DocumentFolder.name == normalized_name,
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Folder name already exists in selected parent.")

    sort_order = (
        db.query(models.DocumentFolder)
        .filter(
            models.DocumentFolder.project_id == int(project_id),
            models.DocumentFolder.parent_folder_id == int(parent.id),
        )
        .count()
    )
    now_iso = to_iso(utcnow())
    folder = models.DocumentFolder(
        project_id=int(project_id),
        parent_folder_id=int(parent.id),
        name=normalized_name,
        sort_order=int(sort_order),
        is_system_root=False,
        created_by_user_id=int(user.id),
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {
        "id": int(folder.id),
        "name": folder.name,
        "parent_folder_id": int(folder.parent_folder_id) if folder.parent_folder_id is not None else None,
        "project_id": int(folder.project_id),
    }


@router.patch("/projects/{project_id}/data/folders/{folder_id}")
def update_project_data_folder(
    project_id: int,
    folder_id: int,
    payload: FolderUpdatePayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _ = user
    _get_project_or_404(project_id, db)
    folder = _get_project_folder_or_404(project_id, folder_id, db)
    if folder.is_system_root:
        raise HTTPException(status_code=400, detail="System root folder cannot be edited.")

    fields_set = payload.model_fields_set
    if "name" in fields_set:
        normalized_name = _normalize_folder_name(payload.name or "")
        if not normalized_name:
            raise HTTPException(status_code=400, detail="Folder name is required.")
        duplicate = (
            db.query(models.DocumentFolder)
            .filter(
                models.DocumentFolder.project_id == int(project_id),
                models.DocumentFolder.parent_folder_id == folder.parent_folder_id,
                models.DocumentFolder.name == normalized_name,
                models.DocumentFolder.id != int(folder.id),
            )
            .first()
        )
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="Folder name already exists in selected parent.")
        folder.name = normalized_name

    if "parent_folder_id" in fields_set:
        next_parent_id = int(payload.parent_folder_id) if payload.parent_folder_id is not None else None
        if next_parent_id is None:
            root = _ensure_root_folder(project_id, db)
            next_parent_id = int(root.id)
        parent = _get_project_folder_or_404(project_id, next_parent_id, db)
        if parent.is_system_root and int(parent.id) == int(folder.id):
            raise HTTPException(status_code=400, detail="Invalid folder move target.")

        parent_map = _collect_folder_parent_map(project_id, db)
        if _is_cycle_move(folder_id=int(folder.id), new_parent_id=int(parent.id), parent_map=parent_map):
            raise HTTPException(status_code=400, detail="Folder cannot be moved to its descendant.")
        folder.parent_folder_id = int(parent.id)

    folder.updated_at = to_iso(utcnow())
    db.commit()
    db.refresh(folder)
    return {
        "id": int(folder.id),
        "name": folder.name,
        "parent_folder_id": int(folder.parent_folder_id) if folder.parent_folder_id is not None else None,
        "project_id": int(folder.project_id),
    }


@router.delete("/projects/{project_id}/data/folders/{folder_id}")
def delete_project_data_folder(
    project_id: int,
    folder_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _ = user
    _get_project_or_404(project_id, db)
    folder = _get_project_folder_or_404(project_id, folder_id, db)
    if folder.is_system_root:
        raise HTTPException(status_code=400, detail="System root folder cannot be deleted.")

    folder_ids = _collect_folder_descendants(project_id=project_id, folder_id=int(folder.id), db=db)
    doc_ids = [
        int(doc_id)
        for doc_id, in (
            db.query(models.Document.id)
            .filter(
                models.Document.project_id == int(project_id),
                models.Document.folder_id.in_(folder_ids),
            )
            .all()
        )
    ]
    _delete_documents_completely(doc_ids, db)

    for target_id in reversed(folder_ids):
        (
            db.query(models.DocumentFolder)
            .filter(
                models.DocumentFolder.project_id == int(project_id),
                models.DocumentFolder.id == int(target_id),
            )
            .delete(synchronize_session=False)
        )
    db.commit()
    return {
        "message": "Folder and descendants deleted.",
        "deleted_folder_ids": folder_ids,
        "deleted_document_ids": doc_ids,
    }


@router.get("/projects/{project_id}/data/files")
def list_project_data_files(
    project_id: int,
    folder_id: int | None = None,
    q: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _ = user
    project = _get_project_or_404(project_id, db)
    root = _ensure_root_folder(project_id, db)
    selected_folder_id = int(folder_id) if folder_id is not None else int(root.id)
    _get_project_folder_or_404(project_id, selected_folder_id, db)

    query = str(q or "").strip()
    tokens = _normalize_search_tokens(query)

    documents = (
        db.query(models.Document)
        .filter(models.Document.project_id == int(project_id))
        .all()
    )

    rows: list[dict[str, Any]] = []
    if query:
        for doc in documents:
            score, matched_terms = _score_project_file_document(doc, query, tokens)
            if score <= 0:
                continue
            rows.append({
                "doc": doc,
                "score": score,
                "matched_terms": matched_terms,
            })
        rows.sort(
            key=lambda item: (
                float(item["score"]),
                str(item["doc"].updated_at or item["doc"].created_at or ""),
                int(item["doc"].id),
            ),
            reverse=True,
        )
    else:
        for doc in documents:
            doc_folder_id = int(doc.folder_id) if doc.folder_id is not None else None
            if doc_folder_id != int(selected_folder_id):
                continue
            rows.append({
                "doc": doc,
                "score": 0.0,
                "matched_terms": [],
            })
        rows.sort(
            key=lambda item: (
                str(item["doc"].updated_at or item["doc"].created_at or ""),
                int(item["doc"].id),
            ),
            reverse=True,
        )

    folder_map = {
        int(folder.id): folder
        for folder in (
            db.query(models.DocumentFolder)
            .filter(models.DocumentFolder.project_id == int(project_id))
            .all()
        )
    }
    uploader_ids = {
        int(item["doc"].uploaded_by_user_id)
        for item in rows
        if item["doc"].uploaded_by_user_id is not None
    }
    uploader_map = {}
    if uploader_ids:
        users = (
            db.query(models.User)
            .filter(models.User.id.in_(sorted(uploader_ids)))
            .all()
        )
        uploader_map = {int(item.id): item for item in users}

    total = len(rows)
    start = (int(page) - 1) * int(page_size)
    end = start + int(page_size)
    paged = rows[start:end]

    items = []
    for item in paged:
        doc = item["doc"]
        folder = folder_map.get(int(doc.folder_id)) if doc.folder_id is not None else None
        uploader = uploader_map.get(int(doc.uploaded_by_user_id)) if doc.uploaded_by_user_id is not None else None
        uploader_name = (
            (uploader.full_name or "").strip()
            or (uploader.email if uploader else "")
            or "알 수 없음"
        )
        filename = doc.filename or ""
        _, ext = os.path.splitext(filename)
        items.append({
            "doc_id": int(doc.id),
            "filename": filename,
            "extension": ext.lower(),
            "status": doc.status or "pending",
            "folder_id": int(doc.folder_id) if doc.folder_id is not None else None,
            "folder_name": folder.name if folder else "",
            "uploaded_by_user_id": int(doc.uploaded_by_user_id) if doc.uploaded_by_user_id is not None else None,
            "uploaded_by_name": uploader_name,
            "upload_comment": doc.upload_comment or "",
            "created_at": doc.created_at,
            "updated_at": doc.updated_at or doc.created_at,
            "score": float(item["score"]),
            "matched_terms": item["matched_terms"],
            "project_id": int(project.id),
            "project_code": project.code or "",
            "project_name": project.name or "",
        })

    return {
        "items": items,
        "page": int(page),
        "page_size": int(page_size),
        "total": int(total),
        "query": query,
        "scope_folder_id": int(selected_folder_id),
        "search_mode": bool(query),
    }


@router.post("/projects/{project_id}/data/files/upload")
async def upload_project_data_file(
    project_id: int,
    file: UploadFile = File(...),
    folder_id: int | None = Form(default=None),
    comment: str = Form(..., max_length=500),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _get_project_or_404(project_id, db)
    normalized_comment = str(comment or "").strip()
    if not normalized_comment:
        raise HTTPException(status_code=400, detail="Comment is required.")

    root = _ensure_root_folder(project_id, db)
    resolved_folder_id = int(folder_id) if folder_id is not None else int(root.id)
    _get_project_folder_or_404(project_id, resolved_folder_id, db)

    return await upload_document_impl(
        file=file,
        db=db,
        project_id=int(project_id),
        folder_id=int(resolved_folder_id),
        upload_comment=normalized_comment,
        uploaded_by_user_id=int(user.id),
    )


@router.patch("/projects/{project_id}/data/files/{doc_id}")
def update_project_data_file(
    project_id: int,
    doc_id: int,
    payload: FileUpdatePayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _ = user
    _get_project_or_404(project_id, db)
    doc = (
        db.query(models.Document)
        .filter(
            models.Document.id == int(doc_id),
            models.Document.project_id == int(project_id),
        )
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    fields_set = payload.model_fields_set
    if "filename" in fields_set:
        normalized_filename = _safe_original_filename(payload.filename or "")
        if not normalized_filename:
            raise HTTPException(status_code=400, detail="Filename is required.")
        doc.filename = normalized_filename

    if "folder_id" in fields_set:
        if payload.folder_id is None:
            root = _ensure_root_folder(project_id, db)
            doc.folder_id = int(root.id)
        else:
            folder = _get_project_folder_or_404(project_id, int(payload.folder_id), db)
            doc.folder_id = int(folder.id)

    if "comment" in fields_set:
        normalized_comment = str(payload.comment or "").strip()
        doc.upload_comment = normalized_comment or None

    doc.updated_at = to_iso(utcnow())
    db.commit()
    db.refresh(doc)
    return {
        "doc_id": int(doc.id),
        "filename": doc.filename or "",
        "folder_id": int(doc.folder_id) if doc.folder_id is not None else None,
        "upload_comment": doc.upload_comment or "",
        "updated_at": doc.updated_at or doc.created_at,
    }


@router.delete("/projects/{project_id}/data/files/{doc_id}")
def delete_project_data_file(
    project_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _ = user
    _get_project_or_404(project_id, db)
    doc = (
        db.query(models.Document)
        .filter(
            models.Document.id == int(doc_id),
            models.Document.project_id == int(project_id),
        )
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    _delete_documents_completely([int(doc.id)], db)
    db.commit()
    return {
        "message": "Document deleted.",
        "doc_id": int(doc_id),
    }
