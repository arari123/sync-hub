from datetime import datetime
import html
import mimetypes
import os
import re
import shutil
import threading

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..core.document_summary import (
    classify_document_types,
    parse_document_types,
    serialize_document_types,
)
from ..core.dedup.policies import resolve_policy, search_penalty_for_non_primary
from ..core.dedup.service import compute_document_hashes
from ..core.pipeline import EMBEDDING_BACKEND, process_document, model
from ..core.vector_store import vector_store

router = APIRouter(prefix="/documents", tags=["documents"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
SNIPPET_RADIUS_BEFORE = 72
SNIPPET_RADIUS_AFTER = 168
SNIPPET_MAX_LENGTH = 240
SUMMARY_MAX_LENGTH = 160
EVIDENCE_MAX_SENTENCES = 2
SEARCH_CANDIDATE_MULTIPLIER = 4
SEARCH_CANDIDATE_MIN = 20
SEARCH_CLUSTER_DIVERSITY = (
    os.getenv("SEARCH_CLUSTER_DIVERSITY", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
_SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?。！？])\s+|\s+\|\s+|\n+")
_QUERY_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")
SUPPORTED_UPLOAD_EXTENSIONS = {".pdf", ".xlsx", ".xlsm", ".xltx", ".xltm", ".csv"}


def _start_document_pipeline_async(doc_id: int) -> None:
    worker = threading.Thread(
        target=process_document,
        args=(doc_id,),
        daemon=True,
    )
    worker.start()


def _tokenize_query(query: str) -> list[str]:
    tokens = []
    seen = set()
    raw_query = (query or "").strip()
    raw_tokens = re.split(r"\s+", raw_query)
    raw_tokens.extend(_QUERY_TOKEN_PATTERN.findall(raw_query))

    for token in raw_tokens:
        if not token:
            continue
        if len(token.strip()) < 2:
            continue
        lowered = token.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        tokens.append(token)
    return sorted(tokens, key=len, reverse=True)


def _clean_display_text(value: str) -> str:
    text = html.unescape(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_sentences(text: str) -> list[str]:
    sentences = []
    for segment in _SENTENCE_SPLIT_PATTERN.split(text or ""):
        cleaned = segment.strip()
        if cleaned:
            sentences.append(cleaned)
    return sentences


def _build_snippet(content: str, query: str) -> str:
    text = _clean_display_text(content)
    if not text:
        return ""

    lowered = text.lower()
    first_hit = -1
    for token in _tokenize_query(query):
        position = lowered.find(token.lower())
        if position == -1:
            continue
        if first_hit == -1 or position < first_hit:
            first_hit = position

    if first_hit == -1:
        snippet = text[:SNIPPET_MAX_LENGTH].strip()
        if len(snippet) < len(text):
            return f"{snippet}..."
        return snippet

    start = max(0, first_hit - SNIPPET_RADIUS_BEFORE)
    end = min(len(text), first_hit + SNIPPET_RADIUS_AFTER)
    snippet = text[start:end].strip()
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    return f"{prefix}{snippet}{suffix}"


def _extract_highlight_snippet(hit: dict) -> str:
    highlight_fields = hit.get("highlight", {})
    fragments = highlight_fields.get("content", [])
    if not isinstance(fragments, list):
        return ""

    for fragment in fragments:
        snippet = _clean_display_text(fragment)
        if snippet:
            return snippet
    return ""


def _extract_evidence_sentences(content: str, query: str, tokens: list[str]) -> list[str]:
    body = _clean_display_text(content)
    if not body:
        return []

    query_lower = query.strip().lower()
    scored = []

    for index, sentence in enumerate(_split_sentences(body)):
        sentence_lower = sentence.lower()
        phrase_hits = sentence_lower.count(query_lower) if query_lower else 0
        token_hits = sum(1 for token in tokens if token.lower() in sentence_lower)
        token_freq = sum(sentence_lower.count(token.lower()) for token in tokens)

        if phrase_hits == 0 and token_hits == 0:
            continue

        sentence_score = (
            phrase_hits * 2.0
            + token_hits * 0.9
            + min(token_freq, 5) * 0.2
            - (index * 0.01)
        )
        scored.append((sentence_score, sentence))

    scored.sort(key=lambda item: item[0], reverse=True)
    evidence = []
    seen = set()
    for _, sentence in scored:
        lowered = sentence.lower()
        if lowered in seen:
            continue
        seen.add(lowered)

        snippet = sentence if len(sentence) <= SNIPPET_MAX_LENGTH else f"{sentence[:SNIPPET_MAX_LENGTH].strip()}..."
        evidence.append(snippet)
        if len(evidence) >= EVIDENCE_MAX_SENTENCES:
            break

    if evidence:
        return evidence

    fallback_windows = []
    lowered = body.lower()
    for token in tokens:
        token_lower = token.lower()
        position = lowered.find(token_lower)
        if position == -1:
            continue

        start = max(0, position - 42)
        end = min(len(body), position + 110)
        window = body[start:end].strip()
        if start > 0:
            window = f"...{window}"
        if end < len(body):
            window = f"{window}..."
        fallback_windows.append(window)

        if len(fallback_windows) >= EVIDENCE_MAX_SENTENCES:
            break

    if fallback_windows:
        return fallback_windows

    fallback = _build_snippet(body, query)
    return [fallback] if fallback else []


def _build_summary(
    filename: str,
    query: str,
    snippet: str,
    evidence: list[str],
    matched_terms: list[str],
) -> str:
    matched_label = ", ".join(matched_terms[:3]) if matched_terms else query

    if evidence:
        key_fact = evidence[0].replace("\n", " ").replace(" | ", " / ").strip()
        if len(key_fact) > 96:
            key_fact = f"{key_fact[:93].strip()}..."
        summary = f"'{matched_label}' 관련 핵심: {key_fact}"
    elif snippet:
        summary = f"'{matched_label}' 관련 내용이 포함된 문서입니다."
    else:
        summary = f"{filename} 문서에서 '{query}' 관련 항목을 찾았습니다."

    if len(summary) > SUMMARY_MAX_LENGTH:
        return f"{summary[:SUMMARY_MAX_LENGTH - 3].strip()}..."
    return summary


def _text_noise_penalty(text: str) -> float:
    body = text or ""
    if not body:
        return 1.2

    meaningful = sum(1 for ch in body if ch.isalnum())
    ratio = meaningful / max(len(body), 1)
    if ratio >= 0.6:
        return 0.0
    return (0.6 - ratio) * 2.5


def _is_placeholder_content(text: str) -> bool:
    lowered = (text or "").lower()
    normalized = re.sub(r"\s+", " ", lowered).strip()
    normalized = re.sub(r"^\[\s+", "[", normalized)
    if not normalized.startswith("["):
        return False

    markers = (
        "ocr pending",
        "ocr placeholder",
        "ocr worker fallback",
        "pipeline error",
        "pipeline retry",
        "no extractable text found",
        "no selectable text found",
    )
    return any(marker in normalized for marker in markers)


def _rerank_hits(hits: list[dict], query: str) -> list[dict]:
    tokens = _tokenize_query(query)
    query_lower = query.strip().lower()
    reranked = []
    dedup_policy = resolve_policy()

    for hit in hits:
        source = hit.get("_source", {})
        content = _clean_display_text(source.get("content") or "")
        filename = _clean_display_text(source.get("filename") or "")
        content_lower = content.lower()

        if _is_placeholder_content(content):
            continue

        base_score = float(hit.get("_score") or 0.0)
        matched_terms = [token for token in tokens if token.lower() in content_lower]
        token_frequency = sum(content_lower.count(token.lower()) for token in tokens)
        phrase_count = content_lower.count(query_lower) if query_lower else 0
        all_terms_matched = bool(tokens) and len(matched_terms) == len(tokens)
        filename_hits = sum(1 for token in tokens if token.lower() in filename.lower())
        highlight_bonus = 0.35 if _extract_highlight_snippet(hit) else 0.0
        noise_penalty = _text_noise_penalty(content)
        placeholder_penalty = 0.0
        dedup_penalty = search_penalty_for_non_primary(
            source,
            dedup_policy,
        )

        rerank_score = (
            base_score
            + len(matched_terms) * 1.2
            + min(token_frequency, 14) * 0.22
            + phrase_count * 1.6
            + (1.3 if all_terms_matched else 0.0)
            + filename_hits * 0.25
            + highlight_bonus
            - noise_penalty
            - placeholder_penalty
            - dedup_penalty
        )

        highlight_snippet = _extract_highlight_snippet(hit)
        snippet = highlight_snippet or _build_snippet(content, query)
        evidence = _extract_evidence_sentences(content, query, tokens)
        summary = _build_summary(filename, query, snippet, evidence, matched_terms)

        reranked.append(
            {
                "hit": hit,
                "snippet": snippet,
                "summary": summary,
                "evidence": evidence,
                "matched_terms": matched_terms,
                "rerank_score": rerank_score,
                "raw_score": base_score,
            }
        )

    reranked.sort(
        key=lambda item: (item["rerank_score"], item["raw_score"]),
        reverse=True,
    )
    return reranked


def _apply_cluster_diversity(reranked_hits: list[dict], limit: int) -> list[dict]:
    if not SEARCH_CLUSTER_DIVERSITY:
        return reranked_hits[:limit]

    filtered = []
    seen_clusters = set()

    for result in reranked_hits:
        source = result["hit"].get("_source", {})
        cluster_id = source.get("dedup_cluster_id")
        if cluster_id in (None, ""):
            filtered.append(result)
        elif cluster_id not in seen_clusters:
            filtered.append(result)
            seen_clusters.add(cluster_id)

        if len(filtered) >= limit:
            break

    return filtered


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    filename = (file.filename or "").strip()
    ext = os.path.splitext(filename)[1].lower()
    if not filename or ext not in SUPPORTED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_UPLOAD_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {allowed}")

    # Save file
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Create DB record
    db_doc = models.Document(
        filename=filename,
        file_path=file_path,
        status="pending",
        created_at=datetime.utcnow().isoformat(),
    )
    file_hash, _, _ = compute_document_hashes(file_path=file_path, clean_text="")
    if file_hash:
        db_doc.file_sha256 = file_hash

    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    # Trigger async processing in dedicated thread so API worker stays responsive.
    _start_document_pipeline_async(db_doc.id)

    return {"id": db_doc.id, "status": "pending"}

@router.get("/search")
def search_documents(q: str, limit: int = 5, db: Session = Depends(get_db)):
    query = (q or "").strip()
    if not query:
        return []

    limit = max(1, min(limit, 20))
    candidate_limit = max(limit * SEARCH_CANDIDATE_MULTIPLIER, SEARCH_CANDIDATE_MIN)

    # 1. Generate query vector (disabled when fallback embedder is active).
    query_vector = []
    if EMBEDDING_BACKEND != "fallback":
        query_vector = model.encode(query)
        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()
    
    # 2. Search ES
    results = vector_store.search(query, query_vector, top_k=candidate_limit)
    
    hits = results.get("hits", {}).get("hits", [])
    reranked_hits = _rerank_hits(hits, query)
    reranked_hits = _apply_cluster_diversity(reranked_hits, limit=limit)

    doc_ids = {
        result.get("hit", {}).get("_source", {}).get("doc_id")
        for result in reranked_hits
    }
    doc_ids = {doc_id for doc_id in doc_ids if isinstance(doc_id, int)}
    document_map = {}
    if doc_ids:
        docs = db.query(models.Document).filter(models.Document.id.in_(doc_ids)).all()
        document_map = {item.id: item for item in docs}

    output = []
    has_doc_type_updates = False
    for result in reranked_hits:
        hit = result["hit"]
        source = hit.get("_source", {})
        doc_id = source.get("doc_id")
        db_doc = document_map.get(doc_id)

        title = _clean_display_text(
            source.get("ai_title")
            or (db_doc.ai_title if db_doc else "")
            or source.get("filename")
            or ""
        )
        doc_summary = _clean_display_text(
            source.get("ai_summary_short")
            or (db_doc.ai_summary_short if db_doc else "")
            or ""
        )
        source_doc_types = parse_document_types(source.get("document_types"))
        db_doc_types = parse_document_types(db_doc.document_types if db_doc else "")
        document_types = source_doc_types or db_doc_types
        if not document_types:
            type_hint_text = "\n".join(
                part
                for part in (
                    _clean_display_text(source.get("content") or ""),
                    title,
                    doc_summary,
                    _clean_display_text(source.get("filename") or ""),
                )
                if part
            )
            inferred_types = classify_document_types(
                filename=source.get("filename") or (db_doc.filename if db_doc else ""),
                content_text=type_hint_text,
            )
            document_types = inferred_types
            if db_doc and inferred_types and not db_doc_types:
                db_doc.document_types = serialize_document_types(inferred_types)
                has_doc_type_updates = True
        if not doc_summary:
            doc_summary = result["summary"]

        output.append({
            "doc_id": source.get("doc_id"),
            "title": title,
            "filename": source.get("filename"),
            "page": source.get("page"),
            "chunk_id": source.get("chunk_id"),
            "chunk_type": source.get("chunk_type"),
            "table_cell_refs": source.get("table_cell_refs"),
            "table_layout": source.get("table_layout"),
            "dedup_status": source.get("dedup_status"),
            "dedup_primary_doc_id": source.get("dedup_primary_doc_id"),
            "dedup_cluster_id": source.get("dedup_cluster_id"),
            "document_types": document_types,
            "snippet": result["snippet"],
            "summary": doc_summary,
            "evidence": result["evidence"],
            "match_points": result["matched_terms"],
            "score": result["rerank_score"],
            "raw_score": result["raw_score"],
        })

    if has_doc_type_updates:
        db.commit()
    return output


@router.get("/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found")

    filename = doc.filename or os.path.basename(doc.file_path)
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FileResponse(
        path=doc.file_path,
        filename=filename,
        media_type=media_type,
    )

@router.get("/{doc_id}")
def get_document_status(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
