import html
import mimetypes
import os
import re
import shutil
import threading
import uuid

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..core.auth_utils import to_iso, utcnow
from ..core.document_summary import (
    classify_document_types,
    parse_document_types,
    serialize_document_types,
)
from ..core.dedup.policies import resolve_policy, search_penalty_for_non_primary
from ..core.dedup.service import compute_document_hashes
from ..core.pipeline import EMBEDDING_BACKEND, process_document, model
from ..core.vector_store import vector_store
from .auth import get_current_user

router = APIRouter(
    prefix="/documents",
    tags=["documents"],
    dependencies=[Depends(get_current_user)],
)

DOCUMENT_UPLOAD_DIR = os.getenv("DOCUMENT_UPLOAD_DIR", "uploads/documents")
os.makedirs(DOCUMENT_UPLOAD_DIR, exist_ok=True)
DOCUMENT_UPLOAD_MAX_BYTES = max(
    1,
    int(os.getenv("DOCUMENT_UPLOAD_MAX_BYTES", str(50 * 1024 * 1024))),
)
_FILENAME_MAX_LENGTH = 180

_UPLOADS_ROOT_ABS = os.path.abspath("uploads")
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
SPREADSHEET_EXTENSIONS = {".xlsx", ".xlsm", ".xltx", ".xltm", ".csv"}
FAILURE_REPORT_DOC_TYPE = "equipment_failure_report"
MAINTENANCE_QUERY_HINTS = (
    "장애",
    "조치",
    "보고서",
    "점검",
    "고장",
    "트러블",
    "수리",
    "보전",
    "as",
    "incident",
    "failure",
    "maintenance",
    "troubleshooting",
)


def _safe_original_filename(filename: str) -> str:
    value = (filename or "").replace("\x00", "").strip()
    if not value:
        return ""

    # Some clients send full paths ("C:\\...\\a.pdf" or "/tmp/a.pdf").
    value = value.replace("\\", "/")
    value = os.path.basename(value)
    value = re.sub(r"\s+", " ", value).strip()

    if len(value) <= _FILENAME_MAX_LENGTH:
        return value

    root, ext = os.path.splitext(value)
    clipped_root = root[: max(1, _FILENAME_MAX_LENGTH - len(ext))]
    return f"{clipped_root}{ext}"


def _storage_filename(ext: str) -> str:
    return f"{uuid.uuid4().hex}{ext}"


def _copy_upload_limited(file: UploadFile, dest_path: str, max_bytes: int) -> int:
    total = 0
    chunk_size = 1024 * 1024
    with open(dest_path, "wb") as handle:
        while True:
            chunk = file.file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ValueError("upload_too_large")
            handle.write(chunk)
    return total


def _assert_file_is_under_uploads(file_path: str) -> None:
    abs_path = os.path.abspath(file_path)
    try:
        common = os.path.commonpath([abs_path, _UPLOADS_ROOT_ABS])
    except ValueError:
        common = ""
    if common != _UPLOADS_ROOT_ABS:
        raise HTTPException(status_code=404, detail="Document file not found")


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


def _is_spreadsheet_filename(filename: str) -> bool:
    ext = os.path.splitext((filename or "").strip().lower())[1]
    return ext in SPREADSHEET_EXTENSIONS


def _has_maintenance_search_intent(query_lower: str, tokens: list[str]) -> bool:
    body = (query_lower or "").strip().lower()
    if any(hint in body for hint in MAINTENANCE_QUERY_HINTS):
        return True

    lowered_tokens = {str(token or "").strip().lower() for token in tokens if token}
    return "as" in lowered_tokens


def _should_filter_low_evidence_spreadsheet_or_failure_doc(
    filename: str,
    document_types: list[str],
    query_lower: str,
    tokens: list[str],
    matched_terms: list[str],
    phrase_count: int,
) -> bool:
    if len(tokens) < 2:
        return False
    if phrase_count > 0:
        return False
    if _has_maintenance_search_intent(query_lower, tokens):
        return False

    normalized_types = {str(item or "").strip().lower() for item in (document_types or [])}
    is_failure_doc = FAILURE_REPORT_DOC_TYPE in normalized_types
    is_spreadsheet = _is_spreadsheet_filename(filename)
    if not (is_failure_doc or is_spreadsheet):
        return False

    required_token_matches = 2 if len(tokens) <= 3 else 3
    return len(matched_terms) < required_token_matches


def _rerank_hits(hits: list[dict], query: str) -> list[dict]:
    tokens = _tokenize_query(query)
    query_lower = query.strip().lower()
    reranked = []
    dedup_policy = resolve_policy()

    for hit in hits:
        source = hit.get("_source", {})
        content = _clean_display_text(source.get("content") or "")
        filename = _clean_display_text(source.get("filename") or "")
        document_types = parse_document_types(source.get("document_types"))
        content_lower = content.lower()

        if _is_placeholder_content(content):
            continue

        base_score = float(hit.get("_score") or 0.0)
        matched_terms = [token for token in tokens if token.lower() in content_lower]
        token_frequency = sum(content_lower.count(token.lower()) for token in tokens)
        phrase_count = content_lower.count(query_lower) if query_lower else 0
        all_terms_matched = bool(tokens) and len(matched_terms) == len(tokens)

        if _should_filter_low_evidence_spreadsheet_or_failure_doc(
            filename=filename,
            document_types=document_types,
            query_lower=query_lower,
            tokens=tokens,
            matched_terms=matched_terms,
            phrase_count=phrase_count,
        ):
            continue

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


def build_db_fallback_search_hits(
    *,
    db: Session,
    query: str,
    top_k: int,
    project_id: int | None = None,
) -> list[dict]:
    """Return ES-like hits from DB when vector index is unavailable/empty."""
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return []

    tokens = _tokenize_query(normalized_query)
    search_terms = [normalized_query, *tokens[:8]]

    conditions = []
    for term in search_terms:
        needle = str(term or "").strip()
        if len(needle) < 2:
            continue
        pattern = f"%{needle}%"
        conditions.extend(
            [
                models.Document.filename.ilike(pattern),
                models.Document.ai_title.ilike(pattern),
                models.Document.ai_summary_short.ilike(pattern),
                models.Document.content_text.ilike(pattern),
            ]
        )

    candidate_limit = max(int(top_k) * 6, 120)
    query_builder = db.query(models.Document).filter(models.Document.status == "completed")
    if project_id is not None:
        query_builder = query_builder.filter(models.Document.project_id == int(project_id))
    if conditions:
        query_builder = query_builder.filter(or_(*conditions))

    documents = (
        query_builder
        .order_by(models.Document.updated_at.desc(), models.Document.id.desc())
        .limit(candidate_limit)
        .all()
    )

    query_lower = normalized_query.lower()
    fallback_hits: list[dict] = []
    for doc in documents:
        filename = _clean_display_text(doc.filename or "")
        title = _clean_display_text(doc.ai_title or "")
        summary = _clean_display_text(doc.ai_summary_short or "")
        content = _clean_display_text(doc.content_text or "")
        haystack = "\n".join(part for part in (filename, title, summary, content) if part).lower()
        if not haystack:
            continue

        phrase_hits = haystack.count(query_lower) if query_lower else 0
        matched_terms = [token for token in tokens if token.lower() in haystack]
        token_frequency = sum(haystack.count(token.lower()) for token in tokens)
        if phrase_hits == 0 and not matched_terms:
            continue

        score = (
            phrase_hits * 2.2
            + len(matched_terms) * 1.1
            + min(token_frequency, 12) * 0.15
            + (0.8 if query_lower and query_lower in title.lower() else 0.0)
            + (0.6 if query_lower and query_lower in filename.lower() else 0.0)
        )

        fallback_hits.append(
            {
                "_id": f"db:{int(doc.id)}:0",
                "_score": score,
                "_source": {
                    "doc_id": int(doc.id),
                    "project_id": int(doc.project_id) if doc.project_id is not None else None,
                    "chunk_id": 0,
                    "chunk_index": 0,
                    "page": None,
                    "chunk_type": "document",
                    "section_title": "",
                    "quality_score": 0.0,
                    "table_cell_refs": "",
                    "table_layout": "",
                    "chunk_schema_version": "db_fallback_v1",
                    "embedding_model_name": "",
                    "embedding_model_version": "",
                    "dedup_status": doc.dedup_status or "unique",
                    "dedup_primary_doc_id": doc.dedup_primary_doc_id,
                    "dedup_cluster_id": doc.dedup_cluster_id,
                    "dedup_is_primary": True,
                    "document_types": parse_document_types(doc.document_types),
                    "ai_title": title,
                    "ai_summary_short": summary,
                    "filename": filename,
                    "content": content,
                    "raw_text": content,
                    "embedding": [],
                },
            }
        )

    fallback_hits.sort(key=lambda item: float(item.get("_score") or 0.0), reverse=True)
    return fallback_hits[: max(1, int(top_k))]


async def upload_document_impl(
    *,
    file: UploadFile,
    db: Session,
    project_id: int | None = None,
    folder_id: int | None = None,
    upload_comment: str | None = None,
    uploaded_by_user_id: int | None = None,
) -> dict:
    filename = _safe_original_filename(file.filename or "")
    ext = os.path.splitext(filename)[1].lower()
    if not filename or ext not in SUPPORTED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_UPLOAD_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {allowed}")

    normalized_project_id = int(project_id) if project_id is not None else None
    normalized_folder_id = int(folder_id) if folder_id is not None else None
    normalized_comment = str(upload_comment or "").strip() or None
    normalized_uploaded_by_user_id = int(uploaded_by_user_id) if uploaded_by_user_id is not None else None

    folder = None
    if normalized_folder_id is not None:
        folder = (
            db.query(models.DocumentFolder)
            .filter(models.DocumentFolder.id == normalized_folder_id)
            .first()
        )
        if folder is None:
            raise HTTPException(status_code=404, detail="Folder not found.")
        if normalized_project_id is not None and int(folder.project_id) != normalized_project_id:
            raise HTTPException(status_code=400, detail="Folder does not belong to the project.")
        normalized_project_id = int(folder.project_id)

    if normalized_project_id is not None:
        project = (
            db.query(models.BudgetProject)
            .filter(models.BudgetProject.id == normalized_project_id)
            .first()
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")

    if folder is not None and normalized_project_id is not None and int(folder.project_id) != normalized_project_id:
        raise HTTPException(status_code=400, detail="Folder does not belong to the project.")

    file_path = ""
    try:
        for _ in range(3):
            candidate = os.path.join(DOCUMENT_UPLOAD_DIR, _storage_filename(ext))
            if not os.path.exists(candidate):
                file_path = candidate
                break
        if not file_path:
            raise HTTPException(status_code=500, detail="Failed to allocate upload path.")

        try:
            _copy_upload_limited(file, file_path, DOCUMENT_UPLOAD_MAX_BYTES)
        except ValueError as exc:
            if str(exc) == "upload_too_large":
                raise HTTPException(status_code=413, detail="Upload is too large.")
            raise
    except HTTPException:
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception:  # noqa: BLE001
                pass
        raise
    except Exception as exc:  # noqa: BLE001
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception:  # noqa: BLE001
                pass
        raise HTTPException(status_code=500, detail=f"Failed to store upload: {exc}")

    now_iso = to_iso(utcnow())
    db_doc = models.Document(
        filename=filename,
        file_path=file_path,
        status="pending",
        created_at=now_iso,
        updated_at=now_iso,
        project_id=normalized_project_id,
        folder_id=normalized_folder_id,
        uploaded_by_user_id=normalized_uploaded_by_user_id,
        upload_comment=normalized_comment,
    )
    file_hash, _, _ = compute_document_hashes(file_path=file_path, clean_text="")
    if file_hash:
        db_doc.file_sha256 = file_hash

    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    _start_document_pipeline_async(db_doc.id)
    return {"id": db_doc.id, "status": "pending"}


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    project_id: int | None = Form(default=None),
    folder_id: int | None = Form(default=None),
    comment: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return await upload_document_impl(
        file=file,
        db=db,
        project_id=project_id,
        folder_id=folder_id,
        upload_comment=comment,
        uploaded_by_user_id=int(user.id),
    )

@router.get("/search")
def search_documents(
    q: str,
    project_id: int | None = None,
    page: int = 1,
    page_size: int = 10,
    limit: int | None = None,
    db: Session = Depends(get_db),
):
    query = (q or "").strip()
    page = max(1, int(page or 1))
    if limit is not None:
        page_size = int(limit)
    page_size = max(1, min(int(page_size or 10), 20))
    if not query:
        return {
            "items": [],
            "page": page,
            "page_size": page_size,
            "total": 0,
        }

    end_index = page * page_size
    start_index = max(0, (page - 1) * page_size)
    candidate_limit = max(end_index * SEARCH_CANDIDATE_MULTIPLIER, SEARCH_CANDIDATE_MIN)

    # 1. Generate query vector (disabled when fallback embedder is active).
    query_vector = []
    if EMBEDDING_BACKEND != "fallback":
        query_vector = model.encode(query)
        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()
    
    # 2. Search ES
    results = vector_store.search(query, query_vector, top_k=candidate_limit)
    
    hits = results.get("hits", {}).get("hits", [])
    if not hits:
        hits = build_db_fallback_search_hits(
            db=db,
            query=query,
            top_k=candidate_limit,
            project_id=project_id,
        )
    reranked_hits = _rerank_hits(hits, query)
    reranked_hits = _apply_cluster_diversity(reranked_hits, limit=max(candidate_limit, end_index))

    doc_ids = {
        result.get("hit", {}).get("_source", {}).get("doc_id")
        for result in reranked_hits
    }
    doc_ids = {doc_id for doc_id in doc_ids if isinstance(doc_id, int)}
    document_map = {}
    if doc_ids:
        docs = db.query(models.Document).filter(models.Document.id.in_(doc_ids)).all()
        document_map = {item.id: item for item in docs}

    if project_id is not None:
        normalized_project_id = int(project_id)
        reranked_hits = [
            result
            for result in reranked_hits
            if (
                (doc := document_map.get(result.get("hit", {}).get("_source", {}).get("doc_id")))
                and doc.project_id is not None
                and int(doc.project_id) == normalized_project_id
            )
        ]

    total = len(reranked_hits)
    paged_hits = reranked_hits[start_index:end_index]

    project_ids = {
        int(doc.project_id)
        for doc in document_map.values()
        if doc.project_id is not None
    }
    project_map = {}
    if project_ids:
        projects = (
            db.query(models.BudgetProject)
            .filter(models.BudgetProject.id.in_(sorted(project_ids)))
            .all()
        )
        project_map = {int(item.id): item for item in projects}

    output = []
    has_doc_type_updates = False
    for result in paged_hits:
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
            "project_id": int(db_doc.project_id) if db_doc and db_doc.project_id is not None else None,
            "project_code": (
                (project_map.get(int(db_doc.project_id)).code or "")
                if db_doc and db_doc.project_id is not None and int(db_doc.project_id) in project_map
                else ""
            ),
            "project_name": (
                (project_map.get(int(db_doc.project_id)).name or "")
                if db_doc and db_doc.project_id is not None and int(db_doc.project_id) in project_map
                else ""
            ),
        })

    if has_doc_type_updates:
        db.commit()
    return {
        "items": output,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found")

    _assert_file_is_under_uploads(doc.file_path)

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
    # Do not leak server-side file paths to clients.
    return {
        "id": int(doc.id),
        "filename": doc.filename,
        "status": doc.status,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "project_id": int(doc.project_id) if doc.project_id else None,
        "folder_id": int(doc.folder_id) if doc.folder_id else None,
        "uploaded_by_user_id": int(doc.uploaded_by_user_id) if doc.uploaded_by_user_id else None,
        "upload_comment": doc.upload_comment or "",
        "document_types": doc.document_types,
        "ai_title": doc.ai_title,
        "ai_summary_short": doc.ai_summary_short,
        "dedup_status": doc.dedup_status,
        "dedup_primary_doc_id": doc.dedup_primary_doc_id,
        "dedup_cluster_id": doc.dedup_cluster_id,
        "file_sha256": doc.file_sha256,
    }
