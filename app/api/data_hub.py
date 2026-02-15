from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..core.admin_access import is_admin_user
from ..core.data_hub_ai import (
    TTLCache,
    build_answer_prompt,
    build_rag_context,
    contexts_fingerprint,
    normalize_query,
)
from ..core.gemini_client import GeminiClient
from ..core.pipeline import EMBEDDING_BACKEND, model
from ..core.vector_store import vector_store
from ..database import get_db
from .auth import get_current_admin_user, get_current_user
from .documents import upload_document as upload_document_impl


router = APIRouter(prefix="/data-hub", tags=["data-hub"])

DATA_HUB_AI_ENABLED = os.getenv("DATA_HUB_AI_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
# NOTE: Gemini Developer API(v1beta) currently provides 2.x/2.5 flash models.
# Keep the model configurable via env, but default to an actually-available Flash model.
GEMINI_MODEL = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()
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
    _: models.User = Depends(get_current_admin_user),
):
    filename = (file.filename or "").strip().lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    return await upload_document_impl(file=file, db=db)


@router.post("/ask")
def ask_data_hub(
    payload: DataHubAskPayload,
    user: models.User = Depends(get_current_user),
):
    # Keep auth barrier explicit (page is temporary but still should be protected).
    _ = user

    query = normalize_query(payload.q)
    if not query:
        raise HTTPException(status_code=400, detail="q is required")

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

    fingerprint = contexts_fingerprint(query, contexts)
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
