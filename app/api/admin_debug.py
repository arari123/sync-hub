from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends

from ..core.pipeline import EMBEDDING_BACKEND, model
from ..core.vector_store import vector_store
from .auth import get_current_admin_user


router = APIRouter(
    prefix="/api/admin",
    tags=["admin-debug"],
    dependencies=[Depends(get_current_admin_user)],
)


def _preview(text: str, limit: int = 200) -> str:
    body = (text or "").replace("\n", " ").strip()
    if len(body) <= limit:
        return body
    return f"{body[:limit].strip()}..."


def _format_hits(hits: list[dict]) -> list[dict]:
    output = []
    for hit in hits:
        source = hit.get("_source", {})
        content = source.get("content") or ""

        output.append(
            {
                "score": float(hit.get("_score") or 0.0),
                "doc_id": source.get("doc_id"),
                "page": source.get("page"),
                "chunk_id": source.get("chunk_id"),
                "chunk_type": source.get("chunk_type"),
                "chunk_index": source.get("chunk_index"),
                "dedup_status": source.get("dedup_status"),
                "dedup_primary_doc_id": source.get("dedup_primary_doc_id"),
                "dedup_cluster_id": source.get("dedup_cluster_id"),
                "preview": _preview(content, limit=200),
                "filename": source.get("filename"),
            }
        )

    return output


@router.get("/search_debug")
def search_debug(q: str, limit: int = 10):
    query = (q or "").strip()
    if not query:
        return {
            "request_id": uuid4().hex,
            "original_query": "",
            "rewritten_query": "",
            "vector_topk": [],
            "bm25_topk": [],
            "fused_topk": [],
        }

    top_k = max(1, min(limit, 30))
    query_vector = []

    if EMBEDDING_BACKEND != "fallback":
        query_vector = model.encode(query)
        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()

    request_id = uuid4().hex
    debug_payload = vector_store.debug_search(query, query_vector, top_k=top_k)

    response = {
        "request_id": request_id,
        "original_query": query,
        "rewritten_query": query,
        "vector_topk": _format_hits(debug_payload.get("vector_hits", []))[:top_k],
        "bm25_topk": _format_hits(debug_payload.get("keyword_hits", []))[:top_k],
        "fused_topk": _format_hits(debug_payload.get("fused_hits", []))[:top_k],
        "search_mode": debug_payload.get("mode"),
    }

    print(
        "[admin.search_debug]",
        {
            "request_id": request_id,
            "query": query,
            "vector_hits": len(response["vector_topk"]),
            "bm25_hits": len(response["bm25_topk"]),
            "mode": response["search_mode"],
        },
    )

    return response
