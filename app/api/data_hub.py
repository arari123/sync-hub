from __future__ import annotations

import hashlib
import json
import os
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..core.admin_access import is_admin_user
from ..core.data_hub_ai import (
    TTLCache,
    build_agenda_summary_prompt,
    build_answer_prompt,
    build_rag_context,
    contexts_fingerprint,
    is_agenda_code,
    normalize_query,
)
from ..core.gemini_client import GeminiClient
from ..core.pipeline import EMBEDDING_BACKEND, model
from ..core.vector_store import vector_store
from ..database import get_db
from .auth import get_current_admin_user, get_current_user
from .documents import upload_document_impl


router = APIRouter(prefix="/data-hub", tags=["data-hub"])

DATA_HUB_AI_ENABLED = os.getenv("DATA_HUB_AI_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
# NOTE: Gemini Developer API(v1beta) currently provides 2.x/2.5 flash models.
# Keep the model configurable via env, but default to an actually-available Flash model.
#
# Important:
# - `gemini-2.5-flash` may spend most of `maxOutputTokens` on "thoughts", resulting in a very short visible answer.
# - Prefer a Flash model without that behavior by default.
GEMINI_MODEL = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash-lite").strip()
GEMINI_BASE_URL = (os.getenv("GEMINI_BASE_URL") or "").strip() or None
GEMINI_MAX_OUTPUT_TOKENS = max(64, int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "600")))

DATA_HUB_CONTEXT_MAX_CHUNKS = max(1, int(os.getenv("DATA_HUB_CONTEXT_MAX_CHUNKS", "8")))
DATA_HUB_CONTEXT_MAX_CHARS_PER_CHUNK = max(200, int(os.getenv("DATA_HUB_CONTEXT_MAX_CHARS_PER_CHUNK", "900")))
DATA_HUB_CONTEXT_MAX_TOTAL_CHARS = max(800, int(os.getenv("DATA_HUB_CONTEXT_MAX_TOTAL_CHARS", "6000")))
DATA_HUB_CACHE_TTL_SECONDS = max(60, int(os.getenv("DATA_HUB_CACHE_TTL_SECONDS", str(24 * 3600))))
DATA_HUB_CACHE_MAX_ITEMS = max(16, int(os.getenv("DATA_HUB_CACHE_MAX_ITEMS", "256")))


_answer_cache = TTLCache(ttl_seconds=DATA_HUB_CACHE_TTL_SECONDS, max_items=DATA_HUB_CACHE_MAX_ITEMS)


class DataHubAskPayload(BaseModel):
    q: str = Field(..., min_length=1, max_length=600)
    top_k: int = Field(default=DATA_HUB_CONTEXT_MAX_CHUNKS, ge=1, le=20)


def _gemini_enabled() -> bool:
    return DATA_HUB_AI_ENABLED and bool(GEMINI_API_KEY) and bool(GEMINI_MODEL)


def _gemini_client() -> GeminiClient:
    if not _gemini_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI feature is not configured.",
        )
    return GeminiClient(
        api_key=GEMINI_API_KEY,
        model=GEMINI_MODEL,
        base_url=GEMINI_BASE_URL,
    )


@router.get("/permissions")
def get_permissions(user: models.User = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "can_upload": bool(is_admin_user(user)),
        "can_use_ai": bool(_gemini_enabled()),
    }


@router.post("/documents/upload")
async def upload_data_hub_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_admin_user),
):
    filename = (file.filename or "").strip().lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    return await upload_document_impl(
        file=file,
        db=db,
        uploaded_by_user_id=int(user.id),
    )


def _can_read_agenda_thread(thread: models.AgendaThread, user: models.User) -> bool:
    if (thread.record_status or "").strip().lower() == "published":
        return True
    return int(thread.created_by_user_id) == int(user.id)


def _agenda_not_found_response(query: str) -> dict[str, Any]:
    code = normalize_query(query)
    return {
        "mode": "agenda_not_found",
        "agenda": {
            "agenda_code": code,
        }
        if code
        else None,
        "answer": "해당 안건 코드를 찾지 못했습니다. 코드가 정확한지 확인해 주세요.",
        "sources": [],
        "cache_hit": False,
        "usage": {},
    }


def _ask_agenda_summary(query: str, *, db: Session, user: models.User) -> dict[str, Any]:
    normalized = normalize_query(query)
    if not normalized:
        return _agenda_not_found_response(query)

    thread = (
        db.query(models.AgendaThread)
        .filter(func.lower(models.AgendaThread.agenda_code) == normalized.lower())
        .first()
    )
    if not thread or not _can_read_agenda_thread(thread, user):
        return _agenda_not_found_response(normalized)

    project = (
        db.query(models.BudgetProject)
        .filter(models.BudgetProject.id == int(thread.project_id))
        .first()
    )

    entries = (
        db.query(models.AgendaEntry)
        .filter(models.AgendaEntry.thread_id == int(thread.id))
        .order_by(models.AgendaEntry.created_at.asc(), models.AgendaEntry.id.asc())
        .all()
    )
    if not entries:
        return _agenda_not_found_response(normalized)

    root_entry = None
    for entry in entries:
        if (entry.entry_kind or "").strip().lower() == "root":
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
    selected_middle = middle_entries[-4:]

    selected_entries = [root_entry, *selected_middle]
    if int(latest_entry.id) != int(root_entry.id):
        selected_entries.append(latest_entry)

    report_payload: dict[str, Any] = {}
    if thread.report_payload_json:
        try:
            parsed = json.loads(thread.report_payload_json)
            if isinstance(parsed, dict):
                report_payload = parsed
        except Exception:  # noqa: BLE001
            report_payload = {}

    agenda_prompt_payload: dict[str, Any] = {
        "agenda_code": thread.agenda_code,
        "title": thread.title,
        "thread_kind": thread.thread_kind,
        "record_status": thread.record_status,
        "progress_status": thread.progress_status,
        "project_name": project.name if project else "",
        "project_code": project.code if project else "",
        "requester_name": thread.requester_name or "",
        "requester_org": thread.requester_org or "",
        "responder_name": thread.responder_name or "",
        "responder_org": thread.responder_org or "",
        "created_at": thread.created_at,
        "last_updated_at": thread.last_updated_at,
        "entries": [
            {
                "entry_kind": entry.entry_kind,
                "title": entry.title,
                "content": entry.content_plain or entry.content_html or "",
                "created_at": entry.created_at,
            }
            for entry in selected_entries
        ],
        "report_payload": report_payload,
    }

    fp_payload = {
        "mode": "agenda_summary",
        "thread_id": int(thread.id),
        "agenda_code": thread.agenda_code,
        "last_updated_at": str(thread.last_updated_at or ""),
        "model": GEMINI_MODEL,
        "max_out": int(GEMINI_MAX_OUTPUT_TOKENS),
        "prompt": "agenda_v1",
    }
    fingerprint = hashlib.sha256(
        json.dumps(fp_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    cached = _answer_cache.get(fingerprint)
    if isinstance(cached, dict):
        return {
            **cached,
            "cache_hit": True,
        }

    prompt = build_agenda_summary_prompt(agenda_prompt_payload)
    client = _gemini_client()
    try:
        result = client.generate(
            prompt=prompt,
            max_output_tokens=GEMINI_MAX_OUTPUT_TOKENS,
            temperature=0.2,
            top_p=0.95,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    response = {
        "mode": "agenda_summary",
        "agenda": {
            "thread_id": int(thread.id),
            "project_id": int(thread.project_id),
            "agenda_code": thread.agenda_code,
            "title": thread.title,
            "thread_kind": thread.thread_kind,
            "progress_status": thread.progress_status,
            "last_updated_at": thread.last_updated_at,
        },
        "answer": result.text or "AI 요약을 생성하지 못했습니다.",
        "sources": [],
        "usage": result.usage,
        "cache_hit": False,
    }
    _answer_cache.set(fingerprint, response)
    return response


@router.post("/ask")
def ask_data_hub(
    payload: DataHubAskPayload,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # Keep auth barrier explicit (page is temporary but still should be protected).
    _ = user

    query = normalize_query(payload.q)
    if not query:
        raise HTTPException(status_code=400, detail="q is required")

    # 0) Agenda code shortcut: summarize agenda content only when exact code matches.
    if is_agenda_code(query):
        return _ask_agenda_summary(query, db=db, user=user)

    # 1) Retrieve candidate chunks from ES (keyword + optional vector).
    query_vector = []
    if EMBEDDING_BACKEND != "fallback":
        try:
            query_vector = model.encode(query)
            if hasattr(query_vector, "tolist"):
                query_vector = query_vector.tolist()
        except Exception:  # noqa: BLE001
            query_vector = []

    candidate_k = max(int(payload.top_k) * 6, 30)
    debug_payload = vector_store.debug_search(query, query_vector, top_k=candidate_k)
    fused_hits = debug_payload.get("fused_hits", []) or []

    contexts = build_rag_context(
        fused_hits,
        query,
        max_chunks=min(int(payload.top_k), 20),
        max_chars_per_chunk=DATA_HUB_CONTEXT_MAX_CHARS_PER_CHUNK,
        max_total_chars=DATA_HUB_CONTEXT_MAX_TOTAL_CHARS,
    )

    fingerprint = contexts_fingerprint(
        query,
        contexts,
        # Avoid serving stale cached answers when changing model/prompt behavior.
        extra=f"model={GEMINI_MODEL};max_out={GEMINI_MAX_OUTPUT_TOKENS};prompt=v2",
    )
    cached = _answer_cache.get(fingerprint)
    if isinstance(cached, dict):
        return {
            **cached,
            "cache_hit": True,
        }

    if not contexts:
        return {
            "answer": "관련 근거를 찾지 못했습니다. 검색어를 더 구체화해 주세요.",
            "sources": [],
            "cache_hit": False,
            "usage": {},
        }

    prompt = build_answer_prompt(query, contexts)
    client = _gemini_client()
    try:
        result = client.generate(
            prompt=prompt,
            max_output_tokens=GEMINI_MAX_OUTPUT_TOKENS,
            temperature=0.2,
            top_p=0.95,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    sources = [
        {
            "doc_id": item.doc_id,
            "chunk_id": item.chunk_id,
            "page": item.page,
            "filename": item.filename,
            "score": item.score,
        }
        for item in contexts
    ]

    response = {
        "answer": result.text or "AI 답변을 생성하지 못했습니다.",
        "sources": sources,
        "usage": result.usage,
        "cache_hit": False,
    }
    _answer_cache.set(fingerprint, response)
    return response
