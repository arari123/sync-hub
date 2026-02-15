from __future__ import annotations

import html
import json
import mimetypes
import os
import re
import shutil
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, or_
from sqlalchemy.orm import Session

from .. import models
from ..core.auth_utils import parse_iso, to_iso, utcnow
from ..database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/agenda", tags=["agenda"])

THREAD_KIND_GENERAL = "general"
THREAD_KIND_WORK_REPORT = "work_report"

ENTRY_KIND_ROOT = "root"
ENTRY_KIND_REPLY = "reply"
ENTRY_KIND_ADDITIONAL_WORK = "additional_work"

RECORD_STATUS_DRAFT = "draft"
RECORD_STATUS_PUBLISHED = "published"

PROGRESS_STATUS_IN_PROGRESS = "in_progress"
PROGRESS_STATUS_COMPLETED = "completed"

SEARCH_FIELD_ALL = "all"
SEARCH_FIELD_TITLE = "title"
SEARCH_FIELD_TITLE_CONTENT = "title_content"
SEARCH_FIELD_CONTENT = "content"
SEARCH_FIELD_AUTHOR = "author"
SEARCH_FIELD_REQUESTER = "requester"
SEARCH_FIELD_RESPONDER_WORKER = "responder_worker"

_ALLOWED_PER_PAGE = {3, 5, 10, 30, 50}

_QUERY_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")
_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE_RE = re.compile(r"\s+")
_IMAGE_SRC_RE = re.compile(r"<img[^>]*src=[\"']([^\"']+)[\"'][^>]*>", re.IGNORECASE)
_SAFE_FILE_RE = re.compile(r"[^A-Za-z0-9._-]+")
_AGENDA_SEARCH_STOPWORDS = {
    # Field-hint tokens that users often prepend (e.g., "작성자 이용호").
    "담당자",
    "담당",
    "작성자",
    "요청자",
    "응답자",
    "작업자",
    "work",
    "report",
}

AGENDA_UPLOAD_DIR = os.getenv("AGENDA_UPLOAD_DIR", "uploads/agendas")
os.makedirs(AGENDA_UPLOAD_DIR, exist_ok=True)

_DEFAULT_THUMBNAIL_IMAGE = (
    "data:image/svg+xml;utf8,"
    "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='124' viewBox='0 0 220 124'>"
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
    "<stop offset='0%' stop-color='%23e2e8f0'/><stop offset='100%' stop-color='%23cbd5e1'/>"
    "</linearGradient></defs>"
    "<rect width='220' height='124' fill='url(%23g)'/>"
    "<text x='110' y='68' fill='%2364748b' font-size='12' text-anchor='middle' font-family='sans-serif'>"
    "No Image"
    "</text></svg>"
)


class AgendaWorkerPayload(BaseModel):
    worker_name: str = Field(default="", max_length=120)
    worker_affiliation: str = Field(default="", max_length=120)
    work_hours: float = Field(default=0, ge=0)


class AgendaPartPayload(BaseModel):
    part_name: str = Field(default="", max_length=180)
    manufacturer: str = Field(default="", max_length=180)
    model_name: str = Field(default="", max_length=180)
    quantity: float = Field(default=0, ge=0)


class AgendaReportSectionsPayload(BaseModel):
    symptom: str = Field(default="", max_length=4000)
    cause: str = Field(default="", max_length=4000)
    interim_action: str = Field(default="", max_length=4000)
    final_action: str = Field(default="", max_length=4000)


class AgendaThreadCreatePayload(BaseModel):
    thread_kind: str = Field(default=THREAD_KIND_GENERAL, max_length=32)
    save_mode: str = Field(default=RECORD_STATUS_PUBLISHED, max_length=16)

    title: str = Field(..., min_length=1, max_length=240)
    content_html: str = Field(default="", max_length=300000)
    content_plain: Optional[str] = Field(default=None, max_length=300000)

    requester_name: Optional[str] = Field(default=None, max_length=120)
    requester_org: Optional[str] = Field(default=None, max_length=120)
    responder_name: Optional[str] = Field(default=None, max_length=120)
    responder_org: Optional[str] = Field(default=None, max_length=120)

    progress_status: str = Field(default=PROGRESS_STATUS_IN_PROGRESS, max_length=16)

    request_date: Optional[str] = Field(default=None, max_length=40)
    work_date_start: Optional[str] = Field(default=None, max_length=40)
    work_date_end: Optional[str] = Field(default=None, max_length=40)
    work_location: Optional[str] = Field(default=None, max_length=180)
    target_equipments: list[str] = Field(default_factory=list)

    workers: list[AgendaWorkerPayload] = Field(default_factory=list)
    parts: list[AgendaPartPayload] = Field(default_factory=list)
    report_sections: AgendaReportSectionsPayload = Field(default_factory=AgendaReportSectionsPayload)

    source_thread_id: Optional[int] = Field(default=None, ge=1)


class AgendaDraftUpdatePayload(AgendaThreadCreatePayload):
    pass


class AgendaReplyCreatePayload(BaseModel):
    entry_kind: str = Field(default=ENTRY_KIND_REPLY, max_length=32)

    title: str = Field(..., min_length=1, max_length=240)
    content_html: str = Field(default="", max_length=300000)
    content_plain: Optional[str] = Field(default=None, max_length=300000)

    requester_name: Optional[str] = Field(default=None, max_length=120)
    requester_org: Optional[str] = Field(default=None, max_length=120)
    responder_name: Optional[str] = Field(default=None, max_length=120)
    responder_org: Optional[str] = Field(default=None, max_length=120)

    request_date: Optional[str] = Field(default=None, max_length=40)
    work_date_start: Optional[str] = Field(default=None, max_length=40)
    work_date_end: Optional[str] = Field(default=None, max_length=40)
    work_location: Optional[str] = Field(default=None, max_length=180)
    target_equipments: list[str] = Field(default_factory=list)

    workers: list[AgendaWorkerPayload] = Field(default_factory=list)
    parts: list[AgendaPartPayload] = Field(default_factory=list)
    report_sections: AgendaReportSectionsPayload = Field(default_factory=AgendaReportSectionsPayload)


class AgendaCommentCreatePayload(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class AgendaStatusUpdatePayload(BaseModel):
    progress_status: str = Field(..., max_length=16)


def _normalize_thread_kind(value: Optional[str]) -> str:
    token = str(value or "").strip().lower()
    if token in {"general", "agenda", "issue", "q&a", "qa", "todo"}:
        return THREAD_KIND_GENERAL
    if token in {"work_report", "report", "작업보고서"}:
        return THREAD_KIND_WORK_REPORT
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported thread_kind.")


def _normalize_entry_kind(value: Optional[str], thread_kind: str) -> str:
    token = str(value or "").strip().lower()
    if token in {"", "reply"}:
        return ENTRY_KIND_REPLY
    if token in {"additional_work", "additional", "추가작업"}:
        if thread_kind != THREAD_KIND_WORK_REPORT:
            return ENTRY_KIND_REPLY
        return ENTRY_KIND_ADDITIONAL_WORK
    return ENTRY_KIND_REPLY


def _normalize_record_status(value: Optional[str]) -> str:
    token = str(value or "").strip().lower()
    if token in {RECORD_STATUS_DRAFT, "temp", "temporary"}:
        return RECORD_STATUS_DRAFT
    return RECORD_STATUS_PUBLISHED


def _normalize_progress_status(value: Optional[str]) -> str:
    token = str(value or "").strip().lower()
    if token in {"completed", "done", "완료"}:
        return PROGRESS_STATUS_COMPLETED
    return PROGRESS_STATUS_IN_PROGRESS


def _normalize_text(value: Optional[str], *, max_length: int = 0) -> str:
    text = str(value or "").strip()
    if max_length > 0:
        return text[:max_length]
    return text


def _extract_plain_text_from_html(raw_html: Optional[str]) -> str:
    unescaped = html.unescape(str(raw_html or ""))
    without_tags = _TAG_RE.sub(" ", unescaped)
    normalized = _MULTI_SPACE_RE.sub(" ", without_tags)
    return normalized.strip()


def _first_image_src_from_html(raw_html: Optional[str]) -> str:
    content = str(raw_html or "")
    match = _IMAGE_SRC_RE.search(content)
    if not match:
        return ""
    return match.group(1).strip()


def _safe_filename(original_name: str) -> str:
    base_name = os.path.basename(str(original_name or "").strip())
    if not base_name:
        base_name = "file"
    cleaned = _SAFE_FILE_RE.sub("_", base_name)
    cleaned = cleaned.strip("._")
    return cleaned or "file"


def _is_image_file(filename: str, mime_type: Optional[str]) -> bool:
    lowered = str(filename or "").lower()
    ext = os.path.splitext(lowered)[1]
    if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}:
        return True
    mime_token = str(mime_type or "").lower()
    return mime_token.startswith("image/")


def _normalize_report_payload(
    payload: AgendaThreadCreatePayload | AgendaReplyCreatePayload,
    project: models.BudgetProject,
    user: models.User,
) -> dict[str, Any]:
    workers = []
    for worker in payload.workers:
        name = _normalize_text(worker.worker_name, max_length=120)
        if not name:
            continue
        workers.append(
            {
                "worker_name": name,
                "worker_affiliation": _normalize_text(worker.worker_affiliation, max_length=120) or "자사",
                "work_hours": float(worker.work_hours or 0),
            }
        )

    parts = []
    for part in payload.parts:
        name = _normalize_text(part.part_name, max_length=180)
        if not name:
            continue
        parts.append(
            {
                "part_name": name,
                "manufacturer": _normalize_text(part.manufacturer, max_length=180),
                "model_name": _normalize_text(part.model_name, max_length=180),
                "quantity": float(part.quantity or 0),
            }
        )

    target_equipments = []
    seen = set()
    for equipment in payload.target_equipments:
        name = _normalize_text(equipment, max_length=180)
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        target_equipments.append(name)

    report_sections = {
        "symptom": _normalize_text(payload.report_sections.symptom, max_length=4000),
        "cause": _normalize_text(payload.report_sections.cause, max_length=4000),
        "interim_action": _normalize_text(payload.report_sections.interim_action, max_length=4000),
        "final_action": _normalize_text(payload.report_sections.final_action, max_length=4000),
    }

    return {
        "request_date": _normalize_text(payload.request_date, max_length=40),
        "work_date_start": _normalize_text(payload.work_date_start, max_length=40),
        "work_date_end": _normalize_text(payload.work_date_end, max_length=40),
        "work_location": _normalize_text(payload.work_location, max_length=180)
        or _normalize_text(project.installation_site, max_length=180),
        "target_equipments": target_equipments,
        "workers": workers,
        "parts": parts,
        "report_sections": report_sections,
        "default_customer_name": _normalize_text(project.customer_name, max_length=180),
        "default_installation_site": _normalize_text(project.installation_site, max_length=180),
        "author_name": _display_user_name(user),
    }


def _display_user_name(user: Optional[models.User]) -> str:
    if not user:
        return "사용자"
    full_name = _normalize_text(user.full_name, max_length=120)
    if full_name:
        return full_name
    return user.email


def _user_map_by_ids(user_ids: set[int], db: Session) -> dict[int, models.User]:
    normalized = {int(user_id) for user_id in user_ids if user_id}
    if not normalized:
        return {}
    users = db.query(models.User).filter(models.User.id.in_(normalized)).all()
    return {int(user.id): user for user in users}


def _format_worker_summary(report_payload: dict[str, Any]) -> tuple[str, float]:
    workers = report_payload.get("workers") or []
    if not isinstance(workers, list) or not workers:
        return "", 0.0
    first_name = _normalize_text((workers[0] or {}).get("worker_name"), max_length=120)
    count = len(workers)
    total_hours = 0.0
    for item in workers:
        try:
            total_hours += float((item or {}).get("work_hours") or 0)
        except Exception:  # noqa: BLE001
            continue

    if count <= 1:
        return first_name, total_hours
    return f"{first_name} 외 {count - 1}명", total_hours


def _format_work_date_label(report_payload: dict[str, Any]) -> str:
    start = _normalize_text(report_payload.get("work_date_start"), max_length=40)
    end = _normalize_text(report_payload.get("work_date_end"), max_length=40)
    if start and end and start != end:
        return f"{start} ~ {end}"
    if start:
        return start
    if end:
        return end
    return ""


def _agenda_code_for_thread(thread_id: int, created_at_iso: str) -> str:
    try:
        year = parse_iso(created_at_iso).year
    except Exception:  # noqa: BLE001
        year = utcnow().year
    return f"AG-{year}-{int(thread_id):06d}"


def _get_project_or_404(project_id: int, db: Session) -> models.BudgetProject:
    project = db.query(models.BudgetProject).filter(models.BudgetProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


def _get_thread_or_404(thread_id: int, db: Session) -> models.AgendaThread:
    thread = db.query(models.AgendaThread).filter(models.AgendaThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agenda thread not found.")
    return thread


def _get_entry_or_404(entry_id: int, thread_id: int, db: Session) -> models.AgendaEntry:
    entry = (
        db.query(models.AgendaEntry)
        .filter(
            models.AgendaEntry.id == entry_id,
            models.AgendaEntry.thread_id == thread_id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agenda entry not found.")
    return entry


def _parse_form_payload(model_class: type[BaseModel], payload: str) -> BaseModel:
    try:
        raw = json.loads(payload or "{}")
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload JSON.")
    try:
        return model_class(**raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid payload: {exc}")


def _serialize_attachment(attachment: models.AgendaAttachment) -> dict[str, Any]:
    return {
        "id": int(attachment.id),
        "original_filename": attachment.original_filename,
        "mime_type": attachment.mime_type or "",
        "file_size": int(attachment.file_size or 0),
        "is_image": bool(attachment.is_image),
        "download_url": f"/agenda/attachments/{int(attachment.id)}/download",
        "preview_url": f"/agenda/attachments/{int(attachment.id)}/download",
        "created_at": attachment.created_at,
    }


def _serialize_comment(comment: models.AgendaComment, user_map: dict[int, models.User]) -> dict[str, Any]:
    author = user_map.get(int(comment.created_by_user_id))
    return {
        "id": int(comment.id),
        "thread_id": int(comment.thread_id),
        "project_id": int(comment.project_id),
        "author_user_id": int(comment.created_by_user_id),
        "author_name": _display_user_name(author),
        "body": comment.body,
        "created_at": comment.created_at,
    }


def _serialize_entry(
    entry: models.AgendaEntry,
    user_map: dict[int, models.User],
    attachments_by_entry: dict[int, list[models.AgendaAttachment]],
) -> dict[str, Any]:
    author = user_map.get(int(entry.created_by_user_id))
    payload = {}
    if entry.entry_payload_json:
        try:
            payload = json.loads(entry.entry_payload_json)
        except Exception:  # noqa: BLE001
            payload = {}

    attachments = attachments_by_entry.get(int(entry.id), [])

    return {
        "id": int(entry.id),
        "thread_id": int(entry.thread_id),
        "project_id": int(entry.project_id),
        "parent_entry_id": int(entry.parent_entry_id) if entry.parent_entry_id else None,
        "entry_kind": entry.entry_kind,
        "record_status": entry.record_status,
        "title": entry.title,
        "content_html": entry.content_html or "",
        "content_plain": entry.content_plain or "",
        "requester_name": entry.requester_name or "",
        "requester_org": entry.requester_org or "",
        "responder_name": entry.responder_name or "",
        "responder_org": entry.responder_org or "",
        "attachment_count": int(entry.attachment_count or 0),
        "attachments": [_serialize_attachment(item) for item in attachments],
        "author_user_id": int(entry.created_by_user_id),
        "author_name": _display_user_name(author),
        "payload": payload,
        "created_at": entry.created_at,
        "published_at": entry.published_at,
        "updated_at": entry.updated_at,
    }


def _serialize_thread(
    thread: models.AgendaThread,
    root_entry: Optional[models.AgendaEntry],
    latest_entry: Optional[models.AgendaEntry],
    user_map: dict[int, models.User],
    first_image_by_entry_id: dict[int, str],
) -> dict[str, Any]:
    root_payload = {}
    latest_payload = {}
    if root_entry and root_entry.entry_payload_json:
        try:
            root_payload = json.loads(root_entry.entry_payload_json)
        except Exception:  # noqa: BLE001
            root_payload = {}
    if latest_entry and latest_entry.entry_payload_json:
        try:
            latest_payload = json.loads(latest_entry.entry_payload_json)
        except Exception:  # noqa: BLE001
            latest_payload = {}

    def resolve_thumbnail_url(entry: Optional[models.AgendaEntry]) -> str:
        if not entry:
            return ""
        src = _first_image_src_from_html(entry.content_html)
        if not src:
            src = first_image_by_entry_id.get(int(entry.id), "")
        return str(src or "").strip()

    root_thumbnail_url = resolve_thumbnail_url(root_entry) or _DEFAULT_THUMBNAIL_IMAGE
    latest_thumbnail_url = resolve_thumbnail_url(latest_entry) or root_thumbnail_url or _DEFAULT_THUMBNAIL_IMAGE
    thumbnail_url = latest_thumbnail_url or root_thumbnail_url or _DEFAULT_THUMBNAIL_IMAGE

    root_author = user_map.get(int(root_entry.created_by_user_id)) if root_entry else None
    latest_author = user_map.get(int(latest_entry.created_by_user_id)) if latest_entry else None

    worker_summary = ""
    total_work_hours = 0.0
    work_date_label = ""
    if thread.thread_kind == THREAD_KIND_WORK_REPORT:
        payload_source = latest_payload if latest_payload else root_payload
        worker_summary, total_work_hours = _format_worker_summary(payload_source)
        work_date_label = _format_work_date_label(payload_source)

    root_summary_plain = ""
    if root_entry and root_entry.content_plain:
        root_summary_plain = _collapse_snippet_whitespace(root_entry.content_plain)
    if not root_summary_plain:
        root_summary_plain = _collapse_snippet_whitespace(thread.summary_plain or "")

    latest_summary_plain = ""
    if latest_entry and latest_entry.content_plain:
        latest_summary_plain = _collapse_snippet_whitespace(latest_entry.content_plain)
    if not latest_summary_plain:
        latest_summary_plain = _collapse_snippet_whitespace(thread.summary_plain or "")

    root_responder_name = (root_entry.responder_name if root_entry else "") or ""
    root_responder_org = (root_entry.responder_org if root_entry else "") or ""

    return {
        "id": int(thread.id),
        "project_id": int(thread.project_id),
        "thread_kind": thread.thread_kind,
        "record_status": thread.record_status,
        "progress_status": thread.progress_status,
        "agenda_code": thread.agenda_code,
        "title": thread.title,
        "root_title": root_entry.title if root_entry else thread.title,
        "latest_title": latest_entry.title if latest_entry else thread.title,
        "summary_plain": thread.summary_plain or "",
        "root_summary_plain": root_summary_plain[:600],
        "latest_summary_plain": latest_summary_plain[:600],
        "requester_name": thread.requester_name or "",
        "requester_org": thread.requester_org or "",
        "responder_name": (latest_entry.responder_name if latest_entry else "") or thread.responder_name or "",
        "responder_org": (latest_entry.responder_org if latest_entry else "") or thread.responder_org or "",
        "root_responder_name": root_responder_name,
        "root_responder_org": root_responder_org,
        "author_name": _display_user_name(root_author),
        "latest_author_name": _display_user_name(latest_author),
        "reply_count": int(thread.reply_count or 0),
        "comment_count": int(thread.comment_count or 0),
        "attachment_count": int(thread.attachment_count or 0),
        "root_thumbnail_url": root_thumbnail_url,
        "latest_thumbnail_url": latest_thumbnail_url,
        "thumbnail_url": thumbnail_url,
        "worker_summary": worker_summary,
        "total_work_hours": total_work_hours,
        "work_date_label": work_date_label,
        "created_at": thread.created_at,
        "published_at": thread.published_at,
        "last_updated_at": thread.last_updated_at,
        "updated_at": thread.updated_at,
    }


def _remove_entry_attachments(entry_id: int, db: Session) -> None:
    attachments = db.query(models.AgendaAttachment).filter(models.AgendaAttachment.entry_id == entry_id).all()
    for item in attachments:
        try:
            if item.file_path and os.path.exists(item.file_path):
                os.remove(item.file_path)
        except Exception:  # noqa: BLE001
            pass
        db.delete(item)


def _save_attachments(
    files: list[UploadFile],
    project_id: int,
    thread_id: int,
    entry_id: int,
    user_id: int,
    now_iso: str,
    db: Session,
) -> int:
    if not files:
        return 0

    thread_dir = os.path.join(AGENDA_UPLOAD_DIR, str(project_id), str(thread_id))
    os.makedirs(thread_dir, exist_ok=True)

    saved_count = 0
    for file in files:
        if not file:
            continue
        original_filename = _safe_filename(file.filename or "file")
        extension = os.path.splitext(original_filename)[1].lower()
        stored_filename = f"{entry_id}-{uuid.uuid4().hex}{extension}"
        target_path = os.path.join(thread_dir, stored_filename)

        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        mime_type = file.content_type or mimetypes.guess_type(original_filename)[0] or "application/octet-stream"
        file_size = 0
        try:
            file_size = os.path.getsize(target_path)
        except Exception:  # noqa: BLE001
            file_size = 0

        db.add(
            models.AgendaAttachment(
                project_id=project_id,
                thread_id=thread_id,
                entry_id=entry_id,
                uploaded_by_user_id=user_id,
                original_filename=original_filename,
                stored_filename=stored_filename,
                file_path=target_path,
                mime_type=mime_type,
                file_ext=extension,
                file_size=file_size,
                is_image=_is_image_file(original_filename, mime_type),
                created_at=now_iso,
            )
        )
        saved_count += 1

    return saved_count


def _attachment_count_for_thread(thread_id: int, db: Session) -> int:
    return int(
        db.query(models.AgendaAttachment)
        .filter(models.AgendaAttachment.thread_id == thread_id)
        .count()
    )


def _published_reply_count_for_thread(thread_id: int, db: Session) -> int:
    return int(
        db.query(models.AgendaEntry)
        .filter(
            models.AgendaEntry.thread_id == thread_id,
            models.AgendaEntry.entry_kind != ENTRY_KIND_ROOT,
            models.AgendaEntry.record_status == RECORD_STATUS_PUBLISHED,
        )
        .count()
    )


def _entry_attachment_map(entry_ids: list[int], db: Session) -> dict[int, list[models.AgendaAttachment]]:
    normalized = [int(entry_id) for entry_id in entry_ids if entry_id]
    if not normalized:
        return {}
    rows = (
        db.query(models.AgendaAttachment)
        .filter(models.AgendaAttachment.entry_id.in_(normalized))
        .order_by(models.AgendaAttachment.id.asc())
        .all()
    )
    result: dict[int, list[models.AgendaAttachment]] = {}
    for row in rows:
        key = int(row.entry_id)
        result.setdefault(key, []).append(row)
    return result


def _first_image_attachment_map(entry_ids: list[int], db: Session) -> dict[int, str]:
    normalized = [int(entry_id) for entry_id in entry_ids if entry_id]
    if not normalized:
        return {}

    rows = (
        db.query(models.AgendaAttachment)
        .filter(
            models.AgendaAttachment.entry_id.in_(normalized),
            models.AgendaAttachment.is_image.is_(True),
        )
        .order_by(models.AgendaAttachment.entry_id.asc(), models.AgendaAttachment.id.asc())
        .all()
    )

    result: dict[int, str] = {}
    for row in rows:
        key = int(row.entry_id)
        if key in result:
            continue
        result[key] = f"/agenda/attachments/{int(row.id)}/download"
    return result


def _update_thread_counters_and_timestamps(
    thread: models.AgendaThread,
    *,
    now_iso: str,
    db: Session,
    update_last: bool = True,
) -> None:
    thread.reply_count = _published_reply_count_for_thread(int(thread.id), db)
    thread.attachment_count = _attachment_count_for_thread(int(thread.id), db)
    if update_last:
        thread.last_updated_at = now_iso
    thread.updated_at = now_iso


def _ensure_can_read_thread(thread: models.AgendaThread, user: models.User) -> None:
    if thread.record_status == RECORD_STATUS_PUBLISHED:
        return
    if int(thread.created_by_user_id) != int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Draft thread is private.")


def _serialize_thread_detail(thread: models.AgendaThread, user: models.User, db: Session) -> dict[str, Any]:
    entries = (
        db.query(models.AgendaEntry)
        .filter(models.AgendaEntry.thread_id == thread.id)
        .order_by(models.AgendaEntry.created_at.asc(), models.AgendaEntry.id.asc())
        .all()
    )

    if not entries:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No entries found for thread.")

    root_entry = None
    for entry in entries:
        if entry.entry_kind == ENTRY_KIND_ROOT:
            root_entry = entry
            break
    if root_entry is None:
        root_entry = entries[0]

    latest_entry = entries[-1]
    middle_entries = [
        entry
        for entry in entries
        if int(entry.id) not in {int(root_entry.id), int(latest_entry.id)}
    ]

    entry_ids = [int(entry.id) for entry in entries]
    attachments_by_entry = _entry_attachment_map(entry_ids, db)

    user_ids = {int(entry.created_by_user_id) for entry in entries}
    comments = (
        db.query(models.AgendaComment)
        .filter(models.AgendaComment.thread_id == thread.id)
        .order_by(models.AgendaComment.created_at.desc(), models.AgendaComment.id.desc())
        .all()
    )
    user_ids.update(int(comment.created_by_user_id) for comment in comments)
    user_map = _user_map_by_ids(user_ids, db)

    first_image_map = _first_image_attachment_map(entry_ids, db)

    serialized_root = _serialize_entry(root_entry, user_map, attachments_by_entry)
    serialized_latest = _serialize_entry(latest_entry, user_map, attachments_by_entry)
    serialized_middle = [_serialize_entry(entry, user_map, attachments_by_entry) for entry in middle_entries]

    thread_payload = _serialize_thread(thread, root_entry, latest_entry, user_map, first_image_map)

    return {
        "thread": thread_payload,
        "root_entry": serialized_root,
        "latest_entry": serialized_latest,
        "middle_entries": serialized_middle,
        "entry_count": len(entries),
        "comments": [_serialize_comment(comment, user_map) for comment in comments],
        "can_change_status": int(thread.created_by_user_id) == int(user.id) and thread.record_status == RECORD_STATUS_PUBLISHED,
        "can_reply": thread.record_status == RECORD_STATUS_PUBLISHED,
        "is_owner": int(thread.created_by_user_id) == int(user.id),
    }


def _sanitize_query_tokens(query: str) -> list[str]:
    tokens: list[str] = []
    seen = set()

    raw_query = str(query or "").strip()
    if not raw_query:
        return []

    parts = re.split(r"[\s,]+", raw_query)
    parts.extend(_QUERY_TOKEN_PATTERN.findall(raw_query))

    for part in parts:
        token = part.strip()
        if len(token) < 2:
            continue
        lowered = token.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        tokens.append(token)
    return tokens


def _match_in_order(haystack_lower: str, token_lowers: list[str]) -> bool:
    if not token_lowers:
        return False
    start_at = 0
    for token in token_lowers:
        position = haystack_lower.find(token, start_at)
        if position < 0:
            return False
        start_at = position + len(token)
    return True


def _agenda_match_score_tuple(haystack: str, query: str, tokens: list[str]) -> tuple[int, int, int, int]:
    lowered_haystack = str(haystack or "").lower()
    query_lower = str(query or "").strip().lower()
    token_lowers = [str(token).lower() for token in tokens]

    if not query_lower and not token_lowers:
        return (0, 0, 0, 0)

    match_count = sum(1 for token in token_lowers if token in lowered_haystack)
    if match_count <= 0:
        return (0, 0, 0, 0)

    has_phrase = 1 if query_lower and query_lower in lowered_haystack else 0
    all_match = 1 if token_lowers and match_count == len(token_lowers) else 0
    in_order = 1 if token_lowers and _match_in_order(lowered_haystack, token_lowers) else 0
    return (in_order, all_match, match_count, has_phrase)


def _collapse_snippet_whitespace(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


def _extract_snippet(text: str, query_lower: str, token_lowers: list[str], max_len: int = 180) -> str:
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
        for token in token_lowers:
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


def _agenda_search_score_and_explain(
    *,
    thread_payload: dict[str, Any],
    root_entry: Optional[models.AgendaEntry],
    latest_entry: Optional[models.AgendaEntry],
    project_name: str,
    project_code: str,
    query: str,
    tokens: list[str],
) -> tuple[float, dict[str, Any]]:
    query_lower = (query or "").strip().lower()
    token_lowers = [str(token).lower() for token in tokens if str(token).strip()]
    if not query_lower and not token_lowers:
        return 0.0, {}

    root_content = (root_entry.content_plain if root_entry else "") or ""
    latest_content = (latest_entry.content_plain if latest_entry else "") or ""
    content_text = "\n".join(part for part in (root_content, latest_content) if str(part).strip()).strip()

    title_text = " ".join(
        part
        for part in (
            thread_payload.get("title") or "",
            thread_payload.get("root_title") or "",
            thread_payload.get("latest_title") or "",
        )
        if str(part).strip()
    ).strip()
    agenda_code = str(thread_payload.get("agenda_code") or "").strip()
    summary_plain = str(thread_payload.get("summary_plain") or "").strip()
    requester_text = " ".join(
        part
        for part in (
            thread_payload.get("requester_name") or "",
            thread_payload.get("requester_org") or "",
        )
        if str(part).strip()
    ).strip()
    responder_text = " ".join(
        part
        for part in (
            thread_payload.get("responder_name") or "",
            thread_payload.get("responder_org") or "",
        )
        if str(part).strip()
    ).strip()
    author_text = " ".join(
        part
        for part in (
            thread_payload.get("author_name") or "",
            thread_payload.get("latest_author_name") or "",
        )
        if str(part).strip()
    ).strip()
    worker_text = str(thread_payload.get("worker_summary") or "").strip()
    project_text = " ".join(part for part in (project_name or "", project_code or "") if str(part).strip()).strip()

    field_map = {
        "title": title_text,
        "agenda_code": agenda_code,
        "project": project_text,
        "summary_plain": summary_plain,
        "content": content_text,
        "requester": requester_text,
        "responder": responder_text,
        "author": author_text,
        "worker_summary": worker_text,
    }
    lowered_fields = {key: value.lower() for key, value in field_map.items() if value}
    haystack = " ".join(lowered_fields.values()).strip()
    if not haystack:
        return 0.0, {}

    matched_tokens = 0
    for token in token_lowers:
        if token and token in haystack:
            matched_tokens += 1

    score = 0.0
    exact_phrase_match = False
    match_fields: set[str] = set()
    matched_terms_lower: set[str] = set()

    def add_phrase(field_key: str, weight: float) -> None:
        nonlocal score, exact_phrase_match
        target = lowered_fields.get(field_key, "")
        if query_lower and query_lower in target:
            score += float(weight)
            exact_phrase_match = True
            match_fields.add(field_key)

    def add_token(field_key: str, token: str, weight: float) -> None:
        nonlocal score
        if not token:
            return
        target = lowered_fields.get(field_key, "")
        if token in target:
            score += float(weight)
            match_fields.add(field_key)
            matched_terms_lower.add(token)

    add_phrase("title", 4.0)
    add_phrase("agenda_code", 3.3)
    add_phrase("project", 2.4)
    add_phrase("requester", 2.0)
    add_phrase("responder", 1.9)
    add_phrase("worker_summary", 1.7)
    add_phrase("summary_plain", 1.5)
    add_phrase("content", 1.1)
    add_phrase("author", 1.0)

    for token in token_lowers:
        add_token("title", token, 1.5)
        add_token("agenda_code", token, 1.2)
        add_token("project", token, 0.9)
        add_token("requester", token, 0.9)
        add_token("responder", token, 0.9)
        add_token("worker_summary", token, 0.8)
        add_token("summary_plain", token, 0.7)
        add_token("content", token, 0.5)
        add_token("author", token, 0.4)

    if not exact_phrase_match and len(token_lowers) >= 2:
        required_token_matches = 2 if len(token_lowers) <= 3 else 3
        if matched_tokens < required_token_matches:
            return 0.0, {}

    if score <= 0.0:
        return 0.0, {}

    matched_terms = [
        str(token)
        for token in tokens
        if str(token).strip() and str(token).lower() in matched_terms_lower
    ]

    snippet_field = ""
    snippet = ""
    for field_key in (
        "title",
        "summary_plain",
        "content",
        "project",
        "agenda_code",
        "worker_summary",
        "requester",
        "responder",
        "author",
    ):
        raw = field_map.get(field_key) or ""
        lowered = raw.lower()
        if query_lower and query_lower in lowered:
            snippet_field = field_key
            snippet = _extract_snippet(raw, query_lower=query_lower, token_lowers=token_lowers)
            break
        if any(token in lowered for token in token_lowers):
            snippet_field = field_key
            snippet = _extract_snippet(raw, query_lower=query_lower, token_lowers=token_lowers)
            break

    if not snippet_field:
        snippet_field = "summary_plain" if summary_plain else "title"
        snippet = _extract_snippet(field_map.get(snippet_field) or "", query_lower=query_lower, token_lowers=token_lowers)

    return score, {
        "match_fields": sorted(match_fields),
        "matched_terms": matched_terms,
        "snippet_field": snippet_field,
        "snippet": snippet,
    }


def _tokenize_agenda_search_query(query: str) -> list[str]:
    tokens = _sanitize_query_tokens(query)
    cleaned = [token for token in tokens if token.lower() not in _AGENDA_SEARCH_STOPWORDS]
    return cleaned or tokens


def _collect_search_haystack(
    *,
    search_field: str,
    thread_payload: dict[str, Any],
    root_entry: Optional[models.AgendaEntry],
    latest_entry: Optional[models.AgendaEntry],
    root_author_name: str,
    latest_author_name: str,
) -> str:
    pieces: list[str] = []

    root_content = (root_entry.content_plain if root_entry else "") or ""
    latest_content = (latest_entry.content_plain if latest_entry else "") or ""

    if search_field == SEARCH_FIELD_TITLE:
        pieces.extend([
            thread_payload.get("root_title") or "",
            thread_payload.get("latest_title") or "",
        ])
    elif search_field == SEARCH_FIELD_TITLE_CONTENT:
        pieces.extend([
            thread_payload.get("root_title") or "",
            thread_payload.get("latest_title") or "",
            root_content,
            latest_content,
        ])
    elif search_field == SEARCH_FIELD_CONTENT:
        pieces.extend([root_content, latest_content])
    elif search_field == SEARCH_FIELD_AUTHOR:
        pieces.extend([root_author_name, latest_author_name])
    elif search_field == SEARCH_FIELD_REQUESTER:
        pieces.extend([
            thread_payload.get("requester_name") or "",
            thread_payload.get("requester_org") or "",
            (root_entry.requester_name if root_entry else "") or "",
            (root_entry.requester_org if root_entry else "") or "",
        ])
    elif search_field == SEARCH_FIELD_RESPONDER_WORKER:
        pieces.extend([
            thread_payload.get("responder_name") or "",
            thread_payload.get("responder_org") or "",
            thread_payload.get("worker_summary") or "",
        ])
    else:
        pieces.extend([
            thread_payload.get("root_title") or "",
            thread_payload.get("latest_title") or "",
            root_content,
            latest_content,
            root_author_name,
            latest_author_name,
            thread_payload.get("requester_name") or "",
            thread_payload.get("requester_org") or "",
            thread_payload.get("responder_name") or "",
            thread_payload.get("responder_org") or "",
            thread_payload.get("worker_summary") or "",
        ])

    return " ".join(str(piece) for piece in pieces if str(piece).strip())


def _thread_sort_priority(thread: models.AgendaThread) -> int:
    return 0 if thread.progress_status == PROGRESS_STATUS_IN_PROGRESS else 1


@router.get("/projects/{project_id}/meta")
def get_project_agenda_meta(
    project_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)

    users = (
        db.query(models.User)
        .filter(
            models.User.is_active.is_(True),
            models.User.email_verified.is_(True),
        )
        .order_by(models.User.full_name.asc(), models.User.email.asc())
        .all()
    )

    current_version = (
        db.query(models.BudgetVersion)
        .filter(models.BudgetVersion.project_id == project_id)
        .order_by(models.BudgetVersion.is_current.desc(), models.BudgetVersion.id.desc())
        .first()
    )
    equipments = []
    if current_version:
        rows = (
            db.query(models.BudgetEquipment)
            .filter(models.BudgetEquipment.version_id == current_version.id)
            .order_by(models.BudgetEquipment.sort_order.asc(), models.BudgetEquipment.id.asc())
            .all()
        )
        seen = set()
        for row in rows:
            name = _normalize_text(row.equipment_name, max_length=180)
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            equipments.append(name)

    return {
        "project": {
            "id": int(project.id),
            "name": project.name,
            "code": project.code or "",
            "customer_name": project.customer_name or "",
            "installation_site": project.installation_site or "",
        },
        "current_user": {
            "id": int(user.id),
            "name": _display_user_name(user),
            "email": user.email,
        },
        "users": [
            {
                "id": int(item.id),
                "name": _display_user_name(item),
                "email": item.email,
            }
            for item in users
        ],
        "equipments": equipments,
    }


@router.post("/projects/{project_id}/threads")
async def create_agenda_thread(
    project_id: int,
    payload: str = Form(...),
    files: list[UploadFile] = File(default_factory=list),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    parsed = _parse_form_payload(AgendaThreadCreatePayload, payload)

    thread_kind = _normalize_thread_kind(parsed.thread_kind)
    save_mode = _normalize_record_status(parsed.save_mode)
    progress_status = _normalize_progress_status(parsed.progress_status)

    now_iso = to_iso(utcnow())
    author_name = _display_user_name(user)

    requester_name = _normalize_text(parsed.requester_name, max_length=120)
    requester_org = _normalize_text(parsed.requester_org, max_length=120)
    responder_name = _normalize_text(parsed.responder_name, max_length=120)
    responder_org = _normalize_text(parsed.responder_org, max_length=120)

    if thread_kind == THREAD_KIND_GENERAL:
        if not requester_name:
            requester_name = author_name
    else:
        if not requester_name:
            requester_name = _normalize_text(project.customer_name, max_length=120)
        if not requester_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작업보고서는 요청자가 필수입니다.")
        if not requester_org:
            requester_org = _normalize_text(project.customer_name, max_length=120)

    if responder_name and not responder_org:
        responder_org = "자사"

    content_plain = _normalize_text(parsed.content_plain, max_length=300000)
    if not content_plain:
        content_plain = _extract_plain_text_from_html(parsed.content_html)

    report_payload = {}
    if thread_kind == THREAD_KIND_WORK_REPORT:
        report_payload = _normalize_report_payload(parsed, project, user)
        if save_mode == RECORD_STATUS_PUBLISHED:
            sections = report_payload.get("report_sections") or {}
            if not _normalize_text(sections.get("symptom"), max_length=4000):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작업보고서의 현상은 필수입니다.")
            if not _normalize_text(sections.get("final_action"), max_length=4000):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작업보고서의 최종 조치사항은 필수입니다.")

    thread = models.AgendaThread(
        project_id=project_id,
        thread_kind=thread_kind,
        record_status=save_mode,
        progress_status=progress_status,
        agenda_code=f"TMP-{uuid.uuid4().hex[:12]}",
        created_by_user_id=int(user.id),
        source_thread_id=parsed.source_thread_id,
        title=parsed.title.strip(),
        summary_plain=content_plain[:1200],
        requester_name=requester_name or None,
        requester_org=requester_org or None,
        responder_name=responder_name or None,
        responder_org=responder_org or None,
        report_payload_json=json.dumps(report_payload, ensure_ascii=False) if report_payload else None,
        created_at=now_iso,
        published_at=now_iso if save_mode == RECORD_STATUS_PUBLISHED else None,
        last_updated_at=now_iso,
        updated_at=now_iso,
    )
    db.add(thread)
    db.flush()

    thread.agenda_code = _agenda_code_for_thread(int(thread.id), thread.created_at)

    entry_payload = report_payload if report_payload else {}
    root_entry = models.AgendaEntry(
        thread_id=int(thread.id),
        project_id=project_id,
        parent_entry_id=None,
        entry_kind=ENTRY_KIND_ROOT,
        record_status=save_mode,
        created_by_user_id=int(user.id),
        title=parsed.title.strip(),
        content_html=parsed.content_html,
        content_plain=content_plain,
        requester_name=requester_name or None,
        requester_org=requester_org or None,
        responder_name=responder_name or None,
        responder_org=responder_org or None,
        entry_payload_json=json.dumps(entry_payload, ensure_ascii=False) if entry_payload else None,
        attachment_count=0,
        created_at=now_iso,
        published_at=now_iso if save_mode == RECORD_STATUS_PUBLISHED else None,
        updated_at=now_iso,
    )
    db.add(root_entry)
    db.flush()

    attachment_count = _save_attachments(
        files=files,
        project_id=project_id,
        thread_id=int(thread.id),
        entry_id=int(root_entry.id),
        user_id=int(user.id),
        now_iso=now_iso,
        db=db,
    )

    root_entry.attachment_count = attachment_count

    thread.root_entry_id = int(root_entry.id)
    thread.latest_entry_id = int(root_entry.id)
    thread.reply_count = 0
    thread.comment_count = 0
    thread.attachment_count = attachment_count

    db.commit()

    return {
        "thread_id": int(thread.id),
        "entry_id": int(root_entry.id),
        "agenda_code": thread.agenda_code,
        "record_status": thread.record_status,
        "message": "임시 저장되었습니다." if thread.record_status == RECORD_STATUS_DRAFT else "안건이 등록되었습니다.",
    }


@router.put("/threads/{thread_id}/draft")
async def update_draft_thread(
    thread_id: int,
    payload: str = Form(...),
    files: list[UploadFile] = File(default_factory=list),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)
    if thread.record_status != RECORD_STATUS_DRAFT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft thread can be updated.")
    if int(thread.created_by_user_id) != int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Draft can only be updated by author.")

    parsed = _parse_form_payload(AgendaDraftUpdatePayload, payload)
    project = _get_project_or_404(int(thread.project_id), db)

    now_iso = to_iso(utcnow())
    thread_kind = _normalize_thread_kind(parsed.thread_kind)
    save_mode = _normalize_record_status(parsed.save_mode)

    root_entry = (
        db.query(models.AgendaEntry)
        .filter(
            models.AgendaEntry.thread_id == thread.id,
            models.AgendaEntry.entry_kind == ENTRY_KIND_ROOT,
        )
        .order_by(models.AgendaEntry.id.asc())
        .first()
    )
    if not root_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Root entry not found.")

    author_name = _display_user_name(user)

    requester_name = _normalize_text(parsed.requester_name, max_length=120)
    requester_org = _normalize_text(parsed.requester_org, max_length=120)
    responder_name = _normalize_text(parsed.responder_name, max_length=120)
    responder_org = _normalize_text(parsed.responder_org, max_length=120)

    if thread_kind == THREAD_KIND_GENERAL:
        if not requester_name:
            requester_name = author_name
    else:
        if not requester_name:
            requester_name = _normalize_text(project.customer_name, max_length=120)
        if not requester_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작업보고서는 요청자가 필수입니다.")
        if not requester_org:
            requester_org = _normalize_text(project.customer_name, max_length=120)

    if responder_name and not responder_org:
        responder_org = "자사"

    content_plain = _normalize_text(parsed.content_plain, max_length=300000)
    if not content_plain:
        content_plain = _extract_plain_text_from_html(parsed.content_html)

    report_payload = {}
    if thread_kind == THREAD_KIND_WORK_REPORT:
        report_payload = _normalize_report_payload(parsed, project, user)
        if save_mode == RECORD_STATUS_PUBLISHED:
            sections = report_payload.get("report_sections") or {}
            if not _normalize_text(sections.get("symptom"), max_length=4000):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작업보고서의 현상은 필수입니다.")
            if not _normalize_text(sections.get("final_action"), max_length=4000):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작업보고서의 최종 조치사항은 필수입니다.")

    attachment_count = int(root_entry.attachment_count or 0)
    if files:
        _remove_entry_attachments(int(root_entry.id), db)
        attachment_count = _save_attachments(
            files=files,
            project_id=int(thread.project_id),
            thread_id=int(thread.id),
            entry_id=int(root_entry.id),
            user_id=int(user.id),
            now_iso=now_iso,
            db=db,
        )

    root_entry.title = parsed.title.strip()
    root_entry.content_html = parsed.content_html
    root_entry.content_plain = content_plain
    root_entry.requester_name = requester_name or None
    root_entry.requester_org = requester_org or None
    root_entry.responder_name = responder_name or None
    root_entry.responder_org = responder_org or None
    root_entry.entry_payload_json = json.dumps(report_payload, ensure_ascii=False) if report_payload else None
    root_entry.attachment_count = attachment_count
    root_entry.updated_at = now_iso

    thread.thread_kind = thread_kind
    thread.title = parsed.title.strip()
    thread.summary_plain = content_plain[:1200]
    thread.requester_name = requester_name or None
    thread.requester_org = requester_org or None
    thread.responder_name = responder_name or None
    thread.responder_org = responder_org or None
    thread.report_payload_json = json.dumps(report_payload, ensure_ascii=False) if report_payload else None
    thread.progress_status = _normalize_progress_status(parsed.progress_status)
    thread.record_status = save_mode
    if save_mode == RECORD_STATUS_PUBLISHED:
        thread.published_at = now_iso
        root_entry.record_status = RECORD_STATUS_PUBLISHED
        root_entry.published_at = now_iso
    else:
        thread.published_at = None
        root_entry.record_status = RECORD_STATUS_DRAFT
        root_entry.published_at = None

    _update_thread_counters_and_timestamps(thread, now_iso=now_iso, db=db)

    db.commit()

    return {
        "thread_id": int(thread.id),
        "entry_id": int(root_entry.id),
        "agenda_code": thread.agenda_code,
        "record_status": thread.record_status,
        "message": "임시 저장되었습니다." if thread.record_status == RECORD_STATUS_DRAFT else "안건이 등록되었습니다.",
    }


@router.post("/threads/{thread_id}/replies")
async def create_agenda_reply(
    thread_id: int,
    payload: str = Form(...),
    files: list[UploadFile] = File(default_factory=list),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)

    if thread.record_status != RECORD_STATUS_PUBLISHED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Replies can only be added to published threads.")

    parsed = _parse_form_payload(AgendaReplyCreatePayload, payload)
    now_iso = to_iso(utcnow())

    author_name = _display_user_name(user)

    requester_name = _normalize_text(parsed.requester_name, max_length=120) or _normalize_text(thread.requester_name, max_length=120)
    requester_org = _normalize_text(parsed.requester_org, max_length=120) or _normalize_text(thread.requester_org, max_length=120)

    responder_name = _normalize_text(parsed.responder_name, max_length=120)
    responder_org = _normalize_text(parsed.responder_org, max_length=120)

    if not responder_name:
        responder_name = author_name
    if responder_name and not responder_org:
        responder_org = "자사"

    content_plain = _normalize_text(parsed.content_plain, max_length=300000)
    if not content_plain:
        content_plain = _extract_plain_text_from_html(parsed.content_html)

    entry_payload = {}
    if thread.thread_kind == THREAD_KIND_WORK_REPORT:
        project = _get_project_or_404(int(thread.project_id), db)
        entry_payload = _normalize_report_payload(parsed, project, user)

    entry = models.AgendaEntry(
        thread_id=int(thread.id),
        project_id=int(thread.project_id),
        parent_entry_id=thread.latest_entry_id,
        entry_kind=_normalize_entry_kind(parsed.entry_kind, thread.thread_kind),
        record_status=RECORD_STATUS_PUBLISHED,
        created_by_user_id=int(user.id),
        title=parsed.title.strip(),
        content_html=parsed.content_html,
        content_plain=content_plain,
        requester_name=requester_name or None,
        requester_org=requester_org or None,
        responder_name=responder_name or None,
        responder_org=responder_org or None,
        entry_payload_json=json.dumps(entry_payload, ensure_ascii=False) if entry_payload else None,
        attachment_count=0,
        created_at=now_iso,
        published_at=now_iso,
        updated_at=now_iso,
    )
    db.add(entry)
    db.flush()

    attachment_count = _save_attachments(
        files=files,
        project_id=int(thread.project_id),
        thread_id=int(thread.id),
        entry_id=int(entry.id),
        user_id=int(user.id),
        now_iso=now_iso,
        db=db,
    )
    entry.attachment_count = attachment_count

    thread.latest_entry_id = int(entry.id)
    thread.title = (thread.title or "").strip() or parsed.title.strip()
    thread.summary_plain = content_plain[:1200]
    thread.responder_name = responder_name or None
    thread.responder_org = responder_org or None
    _update_thread_counters_and_timestamps(thread, now_iso=now_iso, db=db)

    db.commit()

    return {
        "thread_id": int(thread.id),
        "entry_id": int(entry.id),
        "message": "답변 안건이 등록되었습니다.",
    }


@router.get("/projects/{project_id}/drafts")
def list_my_drafts(
    project_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _get_project_or_404(project_id, db)
    drafts = (
        db.query(models.AgendaThread)
        .filter(
            models.AgendaThread.project_id == project_id,
            models.AgendaThread.record_status == RECORD_STATUS_DRAFT,
            models.AgendaThread.created_by_user_id == int(user.id),
        )
        .order_by(models.AgendaThread.updated_at.desc(), models.AgendaThread.id.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": int(item.id),
                "agenda_code": item.agenda_code,
                "title": item.title,
                "thread_kind": item.thread_kind,
                "updated_at": item.updated_at,
            }
            for item in drafts
        ]
    }


@router.get("/projects/{project_id}/threads")
def list_agenda_threads(
    project_id: int,
    q: str = Query(default=""),
    search_field: str = Query(default=SEARCH_FIELD_ALL),
    progress_status: str = Query(default="all"),
    thread_kind: str = Query(default="all"),
    include_drafts: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _get_project_or_404(project_id, db)

    if per_page not in _ALLOWED_PER_PAGE:
        per_page = 10

    query = db.query(models.AgendaThread).filter(models.AgendaThread.project_id == project_id)
    if include_drafts:
        query = query.filter(
            or_(
                models.AgendaThread.record_status == RECORD_STATUS_PUBLISHED,
                and_(
                    models.AgendaThread.record_status == RECORD_STATUS_DRAFT,
                    models.AgendaThread.created_by_user_id == int(user.id),
                ),
            )
        )
    else:
        query = query.filter(models.AgendaThread.record_status == RECORD_STATUS_PUBLISHED)

    kind_token = str(thread_kind or "all").strip().lower()
    if kind_token not in {"", "all"}:
        normalized_kind = _normalize_thread_kind(kind_token)
        query = query.filter(models.AgendaThread.thread_kind == normalized_kind)

    status_token = str(progress_status or "all").strip().lower()
    if status_token in {"in_progress", "진행중", "progress", "active"}:
        query = query.filter(models.AgendaThread.progress_status == PROGRESS_STATUS_IN_PROGRESS)
    elif status_token in {"completed", "완료", "done"}:
        query = query.filter(models.AgendaThread.progress_status == PROGRESS_STATUS_COMPLETED)

    query_text = str(q or "").strip()
    if not query_text:
        total = int(query.order_by(None).count())
        if total <= 0:
            return {
                "items": [],
                "page": page,
                "per_page": per_page,
                "total": 0,
                "total_pages": 0,
            }

        total_pages = (total + per_page - 1) // per_page if total > 0 else 0
        start = (page - 1) * per_page

        priority_clause = case(
            (models.AgendaThread.progress_status == PROGRESS_STATUS_IN_PROGRESS, 0),
            else_=1,
        )
        threads = (
            query
            .order_by(
                models.AgendaThread.last_updated_at.desc(),
                priority_clause.asc(),
                models.AgendaThread.id.desc(),
            )
            .offset(start)
            .limit(per_page)
            .all()
        )
        if not threads:
            return {
                "items": [],
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": total_pages,
            }

        root_entry_ids = [int(item.root_entry_id) for item in threads if item.root_entry_id]
        latest_entry_ids = [int(item.latest_entry_id) for item in threads if item.latest_entry_id]
        entry_ids = list({*root_entry_ids, *latest_entry_ids})

        entries = []
        if entry_ids:
            entries = (
                db.query(models.AgendaEntry)
                .filter(models.AgendaEntry.id.in_(entry_ids))
                .all()
            )
        entry_map = {int(item.id): item for item in entries}

        user_ids = {int(item.created_by_user_id) for item in entries}
        user_map = _user_map_by_ids(user_ids, db)

        first_image_map = _first_image_attachment_map(entry_ids, db)
        return {
            "items": [
                _serialize_thread(
                    thread,
                    entry_map.get(int(thread.root_entry_id)) if thread.root_entry_id else None,
                    entry_map.get(int(thread.latest_entry_id)) if thread.latest_entry_id else None,
                    user_map,
                    first_image_map,
                )
                for thread in threads
            ],
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
        }

    threads = query.all()
    if not threads:
        return {
            "items": [],
            "page": page,
            "per_page": per_page,
            "total": 0,
            "total_pages": 0,
        }

    root_entry_ids = [int(item.root_entry_id) for item in threads if item.root_entry_id]
    latest_entry_ids = [int(item.latest_entry_id) for item in threads if item.latest_entry_id]
    entry_ids = list({*root_entry_ids, *latest_entry_ids})

    entries = []
    if entry_ids:
        entries = (
            db.query(models.AgendaEntry)
            .filter(models.AgendaEntry.id.in_(entry_ids))
            .all()
        )
    entry_map = {int(item.id): item for item in entries}

    user_ids = set()
    for item in entries:
        user_ids.add(int(item.created_by_user_id))
    user_map = _user_map_by_ids(user_ids, db)

    first_image_map = _first_image_attachment_map(entry_ids, db)

    normalized_search_field = str(search_field or SEARCH_FIELD_ALL).strip().lower()
    if normalized_search_field not in {
        SEARCH_FIELD_ALL,
        SEARCH_FIELD_TITLE,
        SEARCH_FIELD_TITLE_CONTENT,
        SEARCH_FIELD_CONTENT,
        SEARCH_FIELD_AUTHOR,
        SEARCH_FIELD_REQUESTER,
        SEARCH_FIELD_RESPONDER_WORKER,
    }:
        normalized_search_field = SEARCH_FIELD_ALL

    tokens = _tokenize_agenda_search_query(query_text)

    candidate_rows = []
    for thread in threads:
        root_entry = entry_map.get(int(thread.root_entry_id)) if thread.root_entry_id else None
        latest_entry = entry_map.get(int(thread.latest_entry_id)) if thread.latest_entry_id else None

        root_author_name = _display_user_name(user_map.get(int(root_entry.created_by_user_id))) if root_entry else ""
        latest_author_name = _display_user_name(user_map.get(int(latest_entry.created_by_user_id))) if latest_entry else ""

        payload = _serialize_thread(thread, root_entry, latest_entry, user_map, first_image_map)

        haystack = _collect_search_haystack(
            search_field=normalized_search_field,
            thread_payload=payload,
            root_entry=root_entry,
            latest_entry=latest_entry,
            root_author_name=root_author_name,
            latest_author_name=latest_author_name,
        )
        match_tuple = _agenda_match_score_tuple(haystack, query_text, tokens)

        if query_text and match_tuple[2] <= 0:
            continue

        candidate_rows.append(
            {
                "thread": thread,
                "payload": payload,
                "match_tuple": match_tuple,
            }
        )

    candidate_rows.sort(
        key=lambda row: (
            _thread_sort_priority(row["thread"]),
            -row["match_tuple"][0],
            -row["match_tuple"][1],
            -row["match_tuple"][2],
            -row["match_tuple"][3],
            parse_iso(row["thread"].last_updated_at).timestamp() if row["thread"].last_updated_at else 0,
            int(row["thread"].id),
        )
    )

    total = len(candidate_rows)
    total_pages = (total + per_page - 1) // per_page if total > 0 else 0
    start = (page - 1) * per_page
    end = start + per_page
    paged_rows = candidate_rows[start:end]

    return {
        "items": [row["payload"] for row in paged_rows],
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": total_pages,
    }


@router.get("/threads/search")
def search_agenda_threads(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query_text = str(q or "").strip()
    if not query_text:
        return []

    tokens = _tokenize_agenda_search_query(query_text)

    query_builder = db.query(models.AgendaThread).filter(
        or_(
            models.AgendaThread.record_status == RECORD_STATUS_PUBLISHED,
            and_(
                models.AgendaThread.record_status == RECORD_STATUS_DRAFT,
                models.AgendaThread.created_by_user_id == int(user.id),
            ),
        )
    )

    candidate_limit = max(int(limit) * 30, 300)

    token_conditions = []
    needle = query_text.strip()
    fields = (
        models.AgendaThread.title,
        models.AgendaThread.agenda_code,
        models.AgendaThread.summary_plain,
        models.AgendaThread.requester_name,
        models.AgendaThread.requester_org,
        models.AgendaThread.responder_name,
        models.AgendaThread.responder_org,
    )
    if needle:
        token_conditions.extend(field.ilike(f"%{needle}%") for field in fields)
    for token in tokens:
        token_conditions.extend(field.ilike(f"%{token}%") for field in fields)

    # Author name/email matches are stored on the related User row; map those to created_by_user_id.
    user_conditions = []
    if needle:
        user_conditions.append(models.User.full_name.ilike(f"%{needle}%"))
        user_conditions.append(models.User.email.ilike(f"%{needle}%"))
    for token in tokens:
        user_conditions.append(models.User.full_name.ilike(f"%{token}%"))
        user_conditions.append(models.User.email.ilike(f"%{token}%"))
    if user_conditions:
        author_rows = (
            db.query(models.User.id)
            .filter(
                models.User.is_active.is_(True),
                models.User.email_verified.is_(True),
            )
            .filter(or_(*user_conditions))
            .limit(200)
            .all()
        )
        author_ids = {int(row[0]) for row in author_rows if row and row[0]}
        if author_ids:
            token_conditions.append(models.AgendaThread.created_by_user_id.in_(sorted(author_ids)))

    # Full-text candidates can live in AgendaEntry; preselect matching thread ids.
    entry_conditions = []
    if needle:
        entry_conditions.append(models.AgendaEntry.title.ilike(f"%{needle}%"))
        entry_conditions.append(models.AgendaEntry.content_plain.ilike(f"%{needle}%"))
    for token in tokens:
        entry_conditions.append(models.AgendaEntry.title.ilike(f"%{token}%"))
        entry_conditions.append(models.AgendaEntry.content_plain.ilike(f"%{token}%"))
    if entry_conditions:
        thread_rows = (
            db.query(models.AgendaEntry.thread_id)
            .filter(or_(*entry_conditions))
            .distinct()
            .limit(candidate_limit * 20)
            .all()
        )
        entry_thread_ids = {int(row[0]) for row in thread_rows if row and row[0]}
        if entry_thread_ids:
            token_conditions.append(models.AgendaThread.id.in_(sorted(entry_thread_ids)))
    if token_conditions:
        query_builder = query_builder.filter(or_(*token_conditions))

    candidates = (
        query_builder
        .order_by(models.AgendaThread.last_updated_at.desc(), models.AgendaThread.id.desc())
        .limit(candidate_limit)
        .all()
    )
    if not candidates:
        return []

    project_ids = {int(thread.project_id) for thread in candidates if thread.project_id}
    project_map: dict[int, models.BudgetProject] = {}
    if project_ids:
        projects = (
            db.query(models.BudgetProject)
            .filter(models.BudgetProject.id.in_(sorted(project_ids)))
            .all()
        )
        project_map = {int(project.id): project for project in projects}

    root_entry_ids = [int(item.root_entry_id) for item in candidates if item.root_entry_id]
    latest_entry_ids = [int(item.latest_entry_id) for item in candidates if item.latest_entry_id]
    entry_ids = list({*root_entry_ids, *latest_entry_ids})

    entries = []
    if entry_ids:
        entries = (
            db.query(models.AgendaEntry)
            .filter(models.AgendaEntry.id.in_(entry_ids))
            .all()
        )
    entry_map = {int(item.id): item for item in entries}

    user_ids = {int(item.created_by_user_id) for item in entries if item.created_by_user_id}
    user_map = _user_map_by_ids(user_ids, db)
    first_image_map = _first_image_attachment_map(entry_ids, db) if entry_ids else {}

    scored_results: list[dict[str, Any]] = []
    for thread in candidates:
        root_entry = entry_map.get(int(thread.root_entry_id)) if thread.root_entry_id else None
        latest_entry = entry_map.get(int(thread.latest_entry_id)) if thread.latest_entry_id else None
        payload = _serialize_thread(thread, root_entry, latest_entry, user_map, first_image_map)

        project = project_map.get(int(thread.project_id))
        project_name = (project.name if project else "") or ""
        project_code = (project.code if project else "") or ""

        score, explain = _agenda_search_score_and_explain(
            thread_payload=payload,
            root_entry=root_entry,
            latest_entry=latest_entry,
            project_name=project_name,
            project_code=project_code,
            query=query_text,
            tokens=tokens,
        )
        if score <= 0:
            continue

        scored_results.append(
            {
                "thread_id": int(thread.id),
                "project_id": int(thread.project_id),
                "project_name": project_name,
                "project_code": project_code,
                "agenda_code": payload.get("agenda_code") or "",
                "title": payload.get("title") or "",
                "thread_kind": payload.get("thread_kind") or "",
                "progress_status": payload.get("progress_status") or "",
                "last_updated_at": payload.get("last_updated_at") or "",
                "updated_at": payload.get("updated_at") or "",
                "score": float(score),
                "match_fields": explain.get("match_fields") or [],
                "matched_terms": explain.get("matched_terms") or [],
                "snippet_field": explain.get("snippet_field") or "",
                "snippet": explain.get("snippet") or "",
            }
        )

    def _safe_ts(value: str) -> float:
        try:
            return float(parse_iso(value).timestamp())
        except Exception:  # noqa: BLE001
            return 0.0

    scored_results.sort(
        key=lambda item: (
            float(item.get("score") or 0.0),
            _safe_ts(str(item.get("last_updated_at") or "")),
            int(item.get("thread_id") or 0),
        ),
        reverse=True,
    )

    return scored_results[: int(limit)]


@router.get("/threads/{thread_id}")
def get_agenda_thread_detail(
    thread_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)
    return _serialize_thread_detail(thread, user, db)


@router.get("/threads/{thread_id}/entries/{entry_id}")
def get_agenda_entry_detail(
    thread_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)
    entry = _get_entry_or_404(entry_id, thread_id, db)

    attachments_by_entry = _entry_attachment_map([int(entry.id)], db)
    user_map = _user_map_by_ids({int(entry.created_by_user_id)}, db)

    return _serialize_entry(entry, user_map, attachments_by_entry)


@router.post("/threads/{thread_id}/comments")
def create_agenda_comment(
    thread_id: int,
    payload: AgendaCommentCreatePayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)

    body_text = _normalize_text(payload.body, max_length=2000)
    if not body_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment body is required.")

    now_iso = to_iso(utcnow())
    comment = models.AgendaComment(
        project_id=int(thread.project_id),
        thread_id=int(thread.id),
        created_by_user_id=int(user.id),
        body=body_text,
        created_at=now_iso,
    )
    db.add(comment)

    thread.comment_count = int(thread.comment_count or 0) + 1
    thread.last_updated_at = now_iso
    thread.updated_at = now_iso

    db.commit()

    return {
        "id": int(comment.id),
        "thread_id": int(thread.id),
        "body": comment.body,
        "author_name": _display_user_name(user),
        "created_at": comment.created_at,
    }


@router.get("/threads/{thread_id}/comments")
def list_agenda_comments(
    thread_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)

    comments = (
        db.query(models.AgendaComment)
        .filter(models.AgendaComment.thread_id == thread_id)
        .order_by(models.AgendaComment.created_at.desc(), models.AgendaComment.id.desc())
        .limit(limit)
        .all()
    )

    user_ids = {int(item.created_by_user_id) for item in comments}
    user_map = _user_map_by_ids(user_ids, db)

    return {
        "items": [_serialize_comment(comment, user_map) for comment in comments],
    }


@router.patch("/threads/{thread_id}/status")
def update_agenda_status(
    thread_id: int,
    payload: AgendaStatusUpdatePayload = Body(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)

    if int(thread.created_by_user_id) != int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only original author can change status.")

    thread.progress_status = _normalize_progress_status(payload.progress_status)
    now_iso = to_iso(utcnow())
    thread.last_updated_at = now_iso
    thread.updated_at = now_iso

    db.commit()

    return {
        "thread_id": int(thread.id),
        "progress_status": thread.progress_status,
        "updated_at": thread.updated_at,
    }


@router.get("/threads/{thread_id}/reregister-payload")
def get_reregister_payload(
    thread_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    thread = _get_thread_or_404(thread_id, db)
    _ensure_can_read_thread(thread, user)

    root_entry = (
        db.query(models.AgendaEntry)
        .filter(
            models.AgendaEntry.thread_id == thread.id,
            models.AgendaEntry.entry_kind == ENTRY_KIND_ROOT,
        )
        .order_by(models.AgendaEntry.id.asc())
        .first()
    )
    if not root_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Root entry not found.")

    payload = {}
    if root_entry.entry_payload_json:
        try:
            payload = json.loads(root_entry.entry_payload_json)
        except Exception:  # noqa: BLE001
            payload = {}

    return {
        "thread_kind": thread.thread_kind,
        "title": root_entry.title,
        "content_html": root_entry.content_html or "",
        "content_plain": root_entry.content_plain or "",
        "requester_name": root_entry.requester_name or "",
        "requester_org": root_entry.requester_org or "",
        "responder_name": root_entry.responder_name or "",
        "responder_org": root_entry.responder_org or "",
        "progress_status": thread.progress_status,
        "report_payload": payload,
    }


@router.get("/attachments/{attachment_id}/download")
def download_agenda_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    attachment = db.query(models.AgendaAttachment).filter(models.AgendaAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")
    if not attachment.file_path or not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found.")

    media_type = attachment.mime_type or mimetypes.guess_type(attachment.original_filename)[0] or "application/octet-stream"
    return FileResponse(
        path=attachment.file_path,
        filename=attachment.original_filename,
        media_type=media_type,
    )
