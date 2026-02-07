from __future__ import annotations

import hashlib
import os
import re
import time
from typing import List, Sequence, Tuple

from .chunking.chunker import (
    ChunkRecord,
    SourceSegment,
    build_chunks,
    chunker_from_env,
    table_group_to_structured_text,
)
from .document_summary import build_document_summary
from .dedup.policies import resolve_policy, should_index_document
from .dedup.service import (
    compute_document_hashes,
    run_exact_for_document,
    run_near_for_document,
)
from .ocr import perform_ocr
from .parsing.cleaning import build_clean_page_texts, merge_soft_linebreaks, normalize_line, normalize_text
from .parsing.reflow import ReflowConfig, is_table_like_line, reflow_pdf
from .vector_store import vector_store

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover - runtime fallback for lightweight environments
    SentenceTransformer = None


class _FallbackEmbedder:
    """Deterministic fallback encoder to keep API alive without heavy ML deps."""

    dims = 384
    _token_re = re.compile(r"[a-z0-9가-힣]+", re.IGNORECASE)

    def encode(self, text):
        if isinstance(text, list):
            return [self.encode(item) for item in text]

        normalized = (text or "").strip().lower()
        if not normalized:
            return [0.0] * self.dims

        tokens = self._token_re.findall(normalized)
        if not tokens:
            return [0.0] * self.dims

        vector = [0.0] * self.dims
        for token in tokens:
            digest = hashlib.sha1(token.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:4], "little") % self.dims
            sign = 1.0 if (digest[4] & 1) else -1.0
            vector[bucket] += sign

        norm = sum(value * value for value in vector) ** 0.5
        if norm > 0:
            vector = [value / norm for value in vector]
        return vector


def _load_embedder():
    model_name = os.getenv("EMBEDDING_MODEL_NAME", "paraphrase-multilingual-MiniLM-L12-v2")
    if SentenceTransformer is None:
        print("[pipeline] sentence-transformers is unavailable, using fallback embedder.")
        return _FallbackEmbedder(), "fallback", "fallback-deterministic", "1"

    try:
        embedder = SentenceTransformer(model_name)
        model_version = os.getenv("EMBEDDING_MODEL_VERSION", "1")
        return embedder, "sentence-transformers", model_name, model_version
    except Exception as exc:  # noqa: BLE001
        print(f"[pipeline] Failed to load sentence-transformers model, using fallback: {exc}")
        return _FallbackEmbedder(), "fallback", "fallback-deterministic", "1"


model, EMBEDDING_BACKEND, EMBEDDING_MODEL_NAME, EMBEDDING_MODEL_VERSION = _load_embedder()

PIPELINE_MAX_RETRIES = max(0, int(os.getenv("PIPELINE_MAX_RETRIES", "2")))
PIPELINE_RETRY_BACKOFF_SECONDS = float(os.getenv("PIPELINE_RETRY_BACKOFF_SECONDS", "1.5"))
OCR_MIN_TEXT_LENGTH = int(os.getenv("OCR_MIN_TEXT_LENGTH", "24"))
OCR_SKIP_MIN_CHARS = max(0, int(os.getenv("OCR_SKIP_MIN_CHARS", "220")))
_NON_INDEXABLE_PREFIXES = (
    "[ocr pending]",
    "[ocr placeholder]",
    "[ocr worker fallback]",
    "[pipeline error]",
    "[pipeline retry",
)

_NON_RETRYABLE_ERROR_SNIPPETS = (
    "No extractable text found",
    "No indexable chunks created",
)
_OCR_NUMBER_RE = re.compile(r"[+\-]?\d+(?:[.,]\d+)?")
_OCR_UNIT_RE = re.compile(r"(?:mm|cm|m|kg|g|ppm|ppb|%|°c|v|a|hz|khz|mhz|ghz|ms|s|μm|um)\b", re.IGNORECASE)
_OCR_DENSE_TABLE_SPLIT_RE = re.compile(
    r"\s+(?=[A-Za-z가-힣][A-Za-z0-9_/\-]{0,18}\s*[+\-]?\d)"
)


def _is_non_retryable_error(exc: Exception) -> bool:
    message = str(exc)
    return any(snippet in message for snippet in _NON_RETRYABLE_ERROR_SNIPPETS)


def _normalize_embedding_vector(vector_like) -> List[float]:
    vector = vector_like
    if hasattr(vector, "tolist"):
        vector = vector.tolist()
    return [float(value) for value in vector]


def _embed_texts(texts: Sequence[str]) -> List[List[float]]:
    if not texts:
        return []

    encoded = model.encode(list(texts) if len(texts) > 1 else texts[0])

    if len(texts) == 1:
        return [_normalize_embedding_vector(encoded)]

    if hasattr(encoded, "tolist"):
        encoded = encoded.tolist()

    return [_normalize_embedding_vector(vector) for vector in encoded]


def _needs_ocr(raw_text: str, clean_text: str = "") -> bool:
    body = (clean_text or raw_text or "").strip()
    if len(body) < OCR_MIN_TEXT_LENGTH:
        return True
    if OCR_SKIP_MIN_CHARS > 0 and len(body) < OCR_SKIP_MIN_CHARS:
        return True
    return False


def _is_non_indexable_text(text: str) -> bool:
    body = (text or "").strip()
    if not body:
        return True

    lowered = body.lower()
    normalized = re.sub(r"\s+", " ", lowered)
    normalized = re.sub(r"^\[\s+", "[", normalized)
    return any(normalized.startswith(prefix) for prefix in _NON_INDEXABLE_PREFIXES)


def _simple_table_groups_from_lines(lines: Sequence[str]) -> Tuple[List[List[str]], List[str]]:
    groups: List[List[str]] = []
    paragraph_lines: List[str] = []

    current_group: List[str] = []

    def _flush_group() -> None:
        nonlocal current_group
        if len(current_group) >= 2:
            groups.append(list(current_group))
        elif len(current_group) == 1 and _looks_like_ocr_table_line(current_group[0]):
            groups.append(list(current_group))
        else:
            paragraph_lines.extend(current_group)
        current_group = []

    for line in lines:
        body = normalize_line(line)
        if not body:
            if current_group:
                _flush_group()
            continue

        if is_table_like_line(body) or _looks_like_ocr_table_line(body):
            current_group.append(body)
            continue

        if current_group:
            _flush_group()

        paragraph_lines.append(body)

    if current_group:
        _flush_group()

    return groups, paragraph_lines


def _looks_like_ocr_table_line(text: str) -> bool:
    body = normalize_line(text)
    if not body:
        return False
    if is_table_like_line(body):
        return True

    if len(body) > 120:
        return False

    number_count = len(_OCR_NUMBER_RE.findall(body))
    token_count = len(body.split())
    if number_count < 2 or token_count < 3:
        return False

    sentence_like = body.endswith((".", "?", "!", "다.", "요.", "니다.", "습니다."))
    symbol_hint = any(symbol in body for symbol in ("=", "+", "±", "|", "/"))
    unit_hint = bool(_OCR_UNIT_RE.search(body))
    upper_short_tokens = sum(
        1 for token in body.split() if token.isupper() and 1 <= len(token) <= 8
    )

    if sentence_like and not (unit_hint or symbol_hint):
        return False

    return symbol_hint or unit_hint or upper_short_tokens >= 1


def _prepare_plain_lines(plain_text: str) -> List[str]:
    raw_body = (plain_text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw_body:
        return []

    output: List[str] = []
    for source_line in raw_body.splitlines():
        base = source_line.strip()
        if not base:
            continue

        fragments = [base]
        number_count = len(_OCR_NUMBER_RE.findall(base))
        token_count = len(base.split())
        if len(base) >= 60 and number_count >= 3 and token_count >= 8:
            split_fragments = [item.strip() for item in _OCR_DENSE_TABLE_SPLIT_RE.split(base) if item.strip()]
            if len(split_fragments) >= 2:
                fragments = split_fragments

        for fragment in fragments:
            normalized = normalize_line(fragment)
            if normalized:
                output.append(normalized)

    return output


def _build_segments_from_reflow(file_path: str) -> Tuple[str, str, List[SourceSegment]]:
    reflow_result = reflow_pdf(file_path, config=ReflowConfig.from_env())
    pages = reflow_result.pages

    page_paragraph_lines = [page.paragraph_lines for page in pages]
    clean_page_texts = build_clean_page_texts(page_paragraph_lines)

    segments: List[SourceSegment] = []
    clean_text_parts: List[str] = []

    for page, clean_page_text in zip(pages, clean_page_texts):
        page_number = page.page_number

        if clean_page_text:
            segments.append(
                SourceSegment(
                    page=page_number,
                    chunk_type="paragraph",
                    text=clean_page_text,
                    raw_text="\n".join(page.paragraph_lines).strip(),
                )
            )
            clean_text_parts.append(clean_page_text)

        if page.parallel_left_lines:
            left_text = normalize_text(merge_soft_linebreaks(page.parallel_left_lines))
            if left_text:
                segments.append(
                    SourceSegment(
                        page=page_number,
                        chunk_type="parallel_columns_left",
                        text=left_text,
                        raw_text="\n".join(page.parallel_left_lines).strip(),
                    )
                )
                clean_text_parts.append(left_text)

        if page.parallel_right_lines:
            right_text = normalize_text(merge_soft_linebreaks(page.parallel_right_lines))
            if right_text:
                segments.append(
                    SourceSegment(
                        page=page_number,
                        chunk_type="parallel_columns_right",
                        text=right_text,
                        raw_text="\n".join(page.parallel_right_lines).strip(),
                    )
                )
                clean_text_parts.append(right_text)

        for table_lines in page.table_groups:
            table_raw, row_sentences = table_group_to_structured_text(table_lines)
            table_raw = normalize_text(table_raw)
            raw_text = "\n".join(table_lines).strip()

            if table_raw:
                segments.append(
                    SourceSegment(
                        page=page_number,
                        chunk_type="table_raw",
                        text=table_raw,
                        raw_text=raw_text,
                    )
                )
                clean_text_parts.append(table_raw)

            for row_sentence in row_sentences:
                cleaned_row = normalize_text(row_sentence)
                if not cleaned_row:
                    continue
                segments.append(
                    SourceSegment(
                        page=page_number,
                        chunk_type="table_row_sentence",
                        text=cleaned_row,
                        raw_text=raw_text,
                    )
                )

    raw_text = normalize_text(reflow_result.raw_text)
    clean_text = normalize_text("\n\n".join(part for part in clean_text_parts if part))
    return raw_text, clean_text, segments


def _build_segments_from_plain_text(plain_text: str) -> Tuple[str, str, List[SourceSegment]]:
    body = normalize_text(plain_text)
    if not body:
        return "", "", []

    lines = _prepare_plain_lines(plain_text)
    table_groups, paragraph_lines = _simple_table_groups_from_lines(lines)

    paragraph_text = normalize_text(merge_soft_linebreaks(paragraph_lines))
    clean_text_parts: List[str] = []
    segments: List[SourceSegment] = []

    if paragraph_text:
        segments.append(
            SourceSegment(
                page=1,
                chunk_type="paragraph",
                text=paragraph_text,
                raw_text="\n".join(paragraph_lines).strip(),
            )
        )
        clean_text_parts.append(paragraph_text)

    for table_lines in table_groups:
        table_raw, row_sentences = table_group_to_structured_text(table_lines)
        table_raw = normalize_text(table_raw)
        raw_text = "\n".join(table_lines).strip()

        if table_raw:
            segments.append(
                SourceSegment(
                    page=1,
                    chunk_type="table_raw",
                    text=table_raw,
                    raw_text=raw_text,
                )
            )
            clean_text_parts.append(table_raw)

        for row_sentence in row_sentences:
            cleaned_row = normalize_text(row_sentence)
            if not cleaned_row:
                continue
            segments.append(
                SourceSegment(
                    page=1,
                    chunk_type="table_row_sentence",
                    text=cleaned_row,
                    raw_text=raw_text,
                )
            )

    clean_text = normalize_text("\n\n".join(part for part in clean_text_parts if part))
    return body, clean_text, segments


def generate_chunk_records(file_path: str) -> Tuple[str, str, List[ChunkRecord]]:
    raw_text, clean_text, segments = _build_segments_from_reflow(file_path)

    if _needs_ocr(raw_text, clean_text) or not segments:
        ocr_text = perform_ocr(file_path)
        if ocr_text.strip():
            raw_text, clean_text, segments = _build_segments_from_plain_text(ocr_text)

    if not segments and raw_text.strip():
        raw_text, clean_text, segments = _build_segments_from_plain_text(raw_text)

    if not raw_text and not clean_text:
        placeholder = "[OCR pending] No extractable text found. Configure OCR worker for scanned PDFs."
        return placeholder, "", []

    chunk_cfg = chunker_from_env()
    chunk_records = build_chunks(
        segments=segments,
        embedding_model_name=EMBEDDING_MODEL_NAME,
        embedding_model_version=EMBEDDING_MODEL_VERSION,
        max_chars=chunk_cfg["max_chars"],
        overlap_sentences=chunk_cfg["overlap_sentences"],
        min_chunk_chars=chunk_cfg["min_chunk_chars"],
        noise_threshold=chunk_cfg["noise_threshold"],
        chunk_schema_version=chunk_cfg["chunk_schema_version"],
        dedup_identical_chunks=chunk_cfg["dedup_identical_chunks"],
        dedup_identical_chunks_min_chars=chunk_cfg["dedup_identical_chunks_min_chars"],
        max_chunks_per_doc=chunk_cfg["max_chunks_per_doc"],
        table_row_sentence_max_per_table=chunk_cfg["table_row_sentence_max_per_table"],
        table_row_sentence_merge_size=chunk_cfg["table_row_sentence_merge_size"],
    )

    return raw_text, clean_text, chunk_records


def _index_chunks(doc, chunk_records: Sequence[ChunkRecord]) -> None:
    if not chunk_records:
        raise ValueError("No indexable chunks created from document text.")

    chunk_texts = [record.content for record in chunk_records]
    embeddings = _embed_texts(chunk_texts)

    if len(embeddings) != len(chunk_records):
        raise ValueError("Embedding generation count mismatch.")

    vector_store.create_index_if_not_exists()
    vector_store.delete_document(doc.id)

    for record, embedding in zip(chunk_records, embeddings):
        is_primary = (
            doc.dedup_primary_doc_id is None
            or int(doc.dedup_primary_doc_id) == int(doc.id)
        )
        vector_store.index_document(
            doc_id=doc.id,
            filename=doc.filename,
            ai_title=doc.ai_title or "",
            ai_summary_short=doc.ai_summary_short or "",
            content=record.content,
            embedding=embedding,
            chunk_id=record.chunk_index,
            chunk_index=record.chunk_index,
            page=record.page,
            chunk_type=record.chunk_type,
            section_title=record.section_title,
            quality_score=record.quality_score,
            raw_text=record.raw_text,
            chunk_schema_version=record.chunk_schema_version,
            embedding_model_name=record.embedding_model_name,
            embedding_model_version=record.embedding_model_version,
            dedup_status=doc.dedup_status or "unique",
            dedup_primary_doc_id=doc.dedup_primary_doc_id,
            dedup_cluster_id=doc.dedup_cluster_id,
            dedup_is_primary=is_primary,
        )


def _apply_dedup_policy(doc, db, clean_text: str, dedup_mode_override: str | None, index_policy_override: str | None):
    file_hash, text_hash, _ = compute_document_hashes(doc.file_path, clean_text or "")
    if file_hash:
        doc.file_sha256 = file_hash
    if text_hash:
        doc.normalized_text_sha256 = text_hash

    if not (doc.dedup_status or "").strip():
        doc.dedup_status = "unique"

    policy_config = resolve_policy(
        dedup_mode_override=dedup_mode_override,
        index_policy_override=index_policy_override,
    )

    if policy_config.dedup_mode in {"exact_only", "exact_and_near"}:
        run_exact_for_document(db, doc, dry_run=False)

    if policy_config.dedup_mode == "exact_and_near":
        run_near_for_document(db, doc, dry_run=False)

    should_index, reason = should_index_document(doc, policy_config)
    return should_index, reason, policy_config


def _precheck_exact_duplicate_by_file_hash(
    doc,
    db,
    dedup_mode_override: str | None,
    index_policy_override: str | None,
):
    policy_config = resolve_policy(
        dedup_mode_override=dedup_mode_override,
        index_policy_override=index_policy_override,
    )
    if policy_config.dedup_mode not in {"exact_only", "exact_and_near"}:
        return False, "dedup_off_or_near_only", policy_config

    file_hash, _, _ = compute_document_hashes(doc.file_path, "")
    if file_hash:
        doc.file_sha256 = file_hash

    if not (doc.dedup_status or "").strip():
        doc.dedup_status = "unique"

    if file_hash:
        run_exact_for_document(db, doc, dry_run=False)

    should_index, reason = should_index_document(doc, policy_config)
    should_skip = (not should_index) and (doc.dedup_status or "").strip().lower() == "exact_dup"
    return should_skip, reason, policy_config


def _process_document_once(
    doc,
    db,
    dedup_mode_override: str | None = None,
    index_policy_override: str | None = None,
):
    should_skip, reason, _ = _precheck_exact_duplicate_by_file_hash(
        doc=doc,
        db=db,
        dedup_mode_override=dedup_mode_override,
        index_policy_override=index_policy_override,
    )
    if should_skip:
        vector_store.delete_document(doc.id)
        doc.status = "completed"
        db.commit()
        print(f"[pipeline] doc_id={doc.id} indexing skipped before OCR by dedup policy: {reason}")
        return

    raw_text, clean_text, chunk_records = generate_chunk_records(doc.file_path)

    if _is_non_indexable_text(raw_text) and _is_non_indexable_text(clean_text):
        raise ValueError("No extractable text found after parser and OCR fallback.")

    if not chunk_records:
        raise ValueError("No indexable chunks created from document text.")

    doc.content_text = clean_text or raw_text
    doc.ai_title, doc.ai_summary_short = build_document_summary(
        filename=doc.filename or "",
        content_text=doc.content_text or "",
    )
    should_index, reason, _ = _apply_dedup_policy(
        doc=doc,
        db=db,
        clean_text=doc.content_text or "",
        dedup_mode_override=dedup_mode_override,
        index_policy_override=index_policy_override,
    )

    if not should_index:
        vector_store.delete_document(doc.id)
        doc.status = "completed"
        db.commit()
        print(f"[pipeline] doc_id={doc.id} indexing skipped by dedup policy: {reason}")
        return

    _index_chunks(doc, chunk_records)

    doc.status = "completed"
    db.commit()


def process_document(
    doc_id: int,
    dedup_mode_override: str | None = None,
    index_policy_override: str | None = None,
):
    """Background entrypoint with isolated DB session and retry handling."""
    from .. import models
    from ..database import SessionLocal

    last_error = ""

    for attempt in range(1, PIPELINE_MAX_RETRIES + 2):
        db = SessionLocal()
        should_retry = False

        try:
            doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
            if not doc:
                return

            doc.status = "processing"
            db.commit()

            _process_document_once(
                doc,
                db,
                dedup_mode_override=dedup_mode_override,
                index_policy_override=index_policy_override,
            )
            return
        except Exception as exc:  # noqa: BLE001
            last_error = f"{type(exc).__name__}: {exc}"
            print(f"[pipeline] attempt={attempt} doc_id={doc_id} failed: {last_error}")
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass

            is_non_retryable = _is_non_retryable_error(exc)

            doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
            if is_non_retryable or attempt > PIPELINE_MAX_RETRIES:
                if doc:
                    doc.status = "failed"
                    doc.content_text = f"[PIPELINE ERROR] {last_error}"
                    db.commit()
                return

            if doc:
                doc.content_text = (
                    f"[PIPELINE RETRY {attempt}/{PIPELINE_MAX_RETRIES}] {last_error}"
                )
                db.commit()
            should_retry = True
        finally:
            db.close()

        if should_retry:
            time.sleep(PIPELINE_RETRY_BACKOFF_SECONDS * attempt)

    if last_error:
        print(f"[pipeline] exhausted retries doc_id={doc_id}: {last_error}")


def process_document_with_session(
    doc_id: int,
    db,
    dedup_mode_override: str | None = None,
    index_policy_override: str | None = None,
):
    """Compatibility wrapper for legacy callers that pass an existing DB session."""
    from .. import models

    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        return

    try:
        doc.status = "processing"
        db.commit()
        _process_document_once(
            doc,
            db,
            dedup_mode_override=dedup_mode_override,
            index_policy_override=index_policy_override,
        )
    except Exception as exc:  # noqa: BLE001
        doc.status = "failed"
        doc.content_text = f"[PIPELINE ERROR] {type(exc).__name__}: {exc}"
        db.commit()
        print(f"[pipeline] legacy session path failed doc_id={doc_id}: {exc}")
