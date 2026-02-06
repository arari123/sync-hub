from __future__ import annotations

from dataclasses import dataclass
import os
import re
from typing import List, Optional, Sequence, Tuple

from .sentence_splitter import split_sentences


@dataclass
class SourceSegment:
    page: Optional[int]
    chunk_type: str
    text: str
    raw_text: str = ""
    section_title: str = ""


@dataclass
class ChunkRecord:
    chunk_index: int
    chunk_type: str
    content: str
    page: Optional[int]
    section_title: str
    quality_score: float
    raw_text: str
    chunk_schema_version: str
    embedding_model_name: str
    embedding_model_version: str


def chunker_from_env() -> dict:
    dedup_identical_chunks = os.getenv("DEDUP_IDENTICAL_CHUNKS", "true").strip().lower()
    return {
        "max_chars": max(200, int(os.getenv("MAX_CHARS", os.getenv("PIPELINE_CHUNK_SIZE", "900")))),
        "overlap_sentences": max(0, int(os.getenv("OVERLAP_SENTENCES", "1"))),
        "min_chunk_chars": max(1, int(os.getenv("MIN_CHUNK_CHARS", "50"))),
        "noise_threshold": float(os.getenv("NOISE_THRESHOLD", "0.28")),
        "chunk_schema_version": os.getenv("CHUNK_SCHEMA_VERSION", "v2_reflow_sentence_table"),
        "dedup_identical_chunks": dedup_identical_chunks in {"1", "true", "yes", "on"},
        "dedup_identical_chunks_min_chars": max(1, int(os.getenv("DEDUP_IDENTICAL_CHUNKS_MIN_CHARS", "40"))),
        "max_chunks_per_doc": max(0, int(os.getenv("MAX_CHUNKS_PER_DOC", "400"))),
        "table_row_sentence_max_per_table": max(
            0,
            int(os.getenv("TABLE_ROW_SENTENCE_MAX_PER_TABLE", "240")),
        ),
        "table_row_sentence_merge_size": max(
            1,
            int(os.getenv("TABLE_ROW_SENTENCE_MERGE_SIZE", "3")),
        ),
    }


def compute_quality_score(text: str) -> float:
    body = (text or "").strip()
    if not body:
        return 0.0

    total = len(body)
    meaningful = sum(1 for ch in body if ch.isalnum())
    whitespace = sum(1 for ch in body if ch.isspace())
    symbols = total - meaningful - whitespace

    alnum_ratio = meaningful / max(total, 1)
    symbol_ratio = symbols / max(total, 1)

    repeated_penalty = 0.0
    if re.search(r"(.)\1{5,}", body):
        repeated_penalty = 0.2

    score = 0.6 * alnum_ratio + 0.4 * max(0.0, 1.0 - symbol_ratio)
    score -= repeated_penalty
    return max(0.0, min(1.0, score))


def _split_long_sentence(sentence: str, max_chars: int) -> List[str]:
    text = sentence.strip()
    if len(text) <= max_chars:
        return [text]

    pieces: List[str] = []
    cursor = 0

    while cursor < len(text):
        end = min(len(text), cursor + max_chars)
        if end < len(text):
            split_at = text.rfind(" ", cursor, end)
            if split_at <= cursor:
                split_at = end
            chunk = text[cursor:split_at].strip()
            cursor = split_at
        else:
            chunk = text[cursor:end].strip()
            cursor = end

        if chunk:
            pieces.append(chunk)

        while cursor < len(text) and text[cursor].isspace():
            cursor += 1

    return pieces


def _build_sentence_chunks(
    sentences: Sequence[str],
    max_chars: int,
    overlap_sentences: int,
) -> List[str]:
    if not sentences:
        return []

    normalized: List[str] = []
    for sentence in sentences:
        cleaned = sentence.strip()
        if not cleaned:
            continue
        normalized.extend(_split_long_sentence(cleaned, max_chars=max_chars))

    if not normalized:
        return []

    chunks: List[str] = []
    window: List[str] = []
    window_len = 0

    def _flush_with_overlap() -> None:
        nonlocal window, window_len
        if not window:
            return

        chunk = " ".join(window).strip()
        if chunk:
            chunks.append(chunk)

        if overlap_sentences <= 0:
            window = []
            window_len = 0
            return

        overlap = window[-overlap_sentences:]
        window = list(overlap)
        window_len = sum(len(item) + 1 for item in window)

    for sentence in normalized:
        sentence_len = len(sentence) + 1
        if window and window_len + sentence_len > max_chars:
            _flush_with_overlap()

        window.append(sentence)
        window_len += sentence_len

    if window:
        chunk = " ".join(window).strip()
        if chunk:
            chunks.append(chunk)

    deduped: List[str] = []
    for chunk in chunks:
        if not deduped or deduped[-1] != chunk:
            deduped.append(chunk)

    return deduped


def _split_table_row(row_text: str) -> List[str]:
    row = row_text.strip()
    if not row:
        return []

    if "|" in row:
        cells = [cell.strip() for cell in row.split("|") if cell.strip()]
        if cells:
            return cells

    if "\t" in row:
        cells = [cell.strip() for cell in row.split("\t") if cell.strip()]
        if cells:
            return cells

    cells = [cell.strip() for cell in re.split(r"\s{2,}", row) if cell.strip()]
    if len(cells) >= 2:
        return cells

    tokens = [token.strip() for token in row.split() if token.strip()]
    numeric_indexes = [
        index
        for index, token in enumerate(tokens)
        if re.match(r"^[+\-]?\d+(?:[.,]\d+)?(?:[%A-Za-zμ/]+)?$", token)
    ]
    if len(tokens) >= 4 and len(numeric_indexes) >= 2:
        first_numeric = numeric_indexes[0]
        cells = []
        if first_numeric > 0:
            cells.append(" ".join(tokens[:first_numeric]).strip())
        for numeric_index in numeric_indexes:
            cells.append(tokens[numeric_index])
        last_numeric = numeric_indexes[-1]
        if last_numeric + 1 < len(tokens):
            cells.append(" ".join(tokens[last_numeric + 1 :]).strip())
        cells = [cell for cell in cells if cell]
        if len(cells) >= 2:
            return cells

    return [row]


def _is_header_row(cells: Sequence[str]) -> bool:
    if not cells:
        return False

    alpha_cells = 0
    numeric_cells = 0
    for cell in cells:
        if any(ch.isalpha() for ch in cell):
            alpha_cells += 1
        if any(ch.isdigit() for ch in cell):
            numeric_cells += 1

    if alpha_cells == 0:
        return False
    return alpha_cells >= numeric_cells


def table_group_to_structured_text(table_lines: Sequence[str]) -> Tuple[str, List[str]]:
    rows = [_split_table_row(line) for line in table_lines if line.strip()]
    rows = [row for row in rows if row]
    if not rows:
        return "", []

    col_count = max(len(row) for row in rows)
    normalized_rows: List[List[str]] = []
    for row in rows:
        padded = list(row) + [""] * (col_count - len(row))
        normalized_rows.append(padded)

    if len(normalized_rows) == 1:
        header = [f"col_{idx+1}" for idx in range(col_count)]
        data_rows = normalized_rows
    else:
        header = (
            normalized_rows[0]
            if _is_header_row(normalized_rows[0])
            else [f"col_{idx+1}" for idx in range(col_count)]
        )
        data_rows = normalized_rows[1:] if header == normalized_rows[0] else normalized_rows

    markdown_lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * col_count) + " |",
    ]
    for row in data_rows:
        markdown_lines.append("| " + " | ".join(row) + " |")

    row_sentences: List[str] = []
    for row in data_rows:
        parts = []
        for idx, value in enumerate(row):
            cell = value.strip()
            if not cell:
                continue
            parts.append(f"{header[idx]}: {cell}")
        if parts:
            row_sentences.append(" / ".join(parts))

    return "\n".join(markdown_lines).strip(), row_sentences


def _merge_table_row_sentence_chunks(
    chunks: Sequence[ChunkRecord],
    table_row_sentence_max_per_table: int,
    table_row_sentence_merge_size: int,
) -> List[ChunkRecord]:
    if not chunks:
        return []

    if table_row_sentence_max_per_table == 0 and table_row_sentence_merge_size <= 1:
        return list(chunks)

    merged: List[ChunkRecord] = []
    index = 0

    while index < len(chunks):
        current = chunks[index]
        if current.chunk_type != "table_row_sentence":
            merged.append(current)
            index += 1
            continue

        group = [current]
        index += 1

        while index < len(chunks):
            candidate = chunks[index]
            if (
                candidate.chunk_type == "table_row_sentence"
                and candidate.page == current.page
                and (candidate.raw_text or "") == (current.raw_text or "")
            ):
                group.append(candidate)
                index += 1
                continue
            break

        if table_row_sentence_max_per_table > 0 and len(group) > table_row_sentence_max_per_table:
            head_keep = table_row_sentence_max_per_table // 2
            tail_keep = table_row_sentence_max_per_table - head_keep
            group = group[:head_keep] + group[-tail_keep:]

        if table_row_sentence_merge_size <= 1:
            merged.extend(group)
            continue

        for start in range(0, len(group), table_row_sentence_merge_size):
            window = group[start : start + table_row_sentence_merge_size]
            if not window:
                continue
            if len(window) == 1:
                merged.append(window[0])
                continue

            merged_text = "\n".join(item.content.strip() for item in window if item.content.strip()).strip()
            if not merged_text:
                continue

            template = window[0]
            merged.append(
                ChunkRecord(
                    chunk_index=-1,
                    chunk_type="table_row_sentence",
                    content=merged_text,
                    page=template.page,
                    section_title=template.section_title,
                    quality_score=compute_quality_score(merged_text),
                    raw_text=template.raw_text,
                    chunk_schema_version=template.chunk_schema_version,
                    embedding_model_name=template.embedding_model_name,
                    embedding_model_version=template.embedding_model_version,
                )
            )

    return merged


def build_chunks(
    segments: Sequence[SourceSegment],
    embedding_model_name: str,
    embedding_model_version: str,
    max_chars: int,
    overlap_sentences: int,
    min_chunk_chars: int,
    noise_threshold: float,
    chunk_schema_version: str,
    dedup_identical_chunks: bool = True,
    dedup_identical_chunks_min_chars: int = 40,
    max_chunks_per_doc: int = 400,
    table_row_sentence_max_per_table: int = 240,
    table_row_sentence_merge_size: int = 3,
) -> List[ChunkRecord]:
    chunks: List[ChunkRecord] = []
    chunk_index = 0

    for segment in segments:
        text = (segment.text or "").strip()
        if not text:
            continue

        if segment.chunk_type in {"paragraph", "parallel_columns_left", "parallel_columns_right"}:
            sentences = split_sentences(text)
            if not sentences:
                sentences = [text]
            chunk_texts = _build_sentence_chunks(
                sentences,
                max_chars=max_chars,
                overlap_sentences=overlap_sentences,
            )
        else:
            chunk_texts = [text]

        for chunk_text in chunk_texts:
            body = chunk_text.strip()
            if not body:
                continue

            quality_score = compute_quality_score(body)
            is_short = len(body) < min_chunk_chars
            drop_for_short = is_short and segment.chunk_type == "paragraph"
            drop_for_noise = quality_score < noise_threshold and segment.chunk_type == "paragraph"

            if drop_for_short or drop_for_noise:
                continue

            chunks.append(
                ChunkRecord(
                    chunk_index=chunk_index,
                    chunk_type=segment.chunk_type,
                    content=body,
                    page=segment.page,
                    section_title=segment.section_title,
                    quality_score=quality_score,
                    raw_text=segment.raw_text or body,
                    chunk_schema_version=chunk_schema_version,
                    embedding_model_name=embedding_model_name,
                    embedding_model_version=embedding_model_version,
                )
            )
            chunk_index += 1

    chunks = _merge_table_row_sentence_chunks(
        chunks,
        table_row_sentence_max_per_table=table_row_sentence_max_per_table,
        table_row_sentence_merge_size=table_row_sentence_merge_size,
    )

    if dedup_identical_chunks:
        deduped_chunks: List[ChunkRecord] = []
        seen_keys = set()

        for record in chunks:
            normalized_content = re.sub(r"\s+", " ", (record.content or "").strip()).lower()
            if len(normalized_content) < dedup_identical_chunks_min_chars:
                deduped_chunks.append(record)
                continue

            dedup_key = (record.chunk_type, normalized_content)
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)
            deduped_chunks.append(record)

        chunks = deduped_chunks

    if max_chunks_per_doc > 0 and len(chunks) > max_chunks_per_doc:
        if max_chunks_per_doc == 1:
            chunks = [chunks[0]]
        else:
            selected_indices = {
                int(round(position * (len(chunks) - 1) / (max_chunks_per_doc - 1)))
                for position in range(max_chunks_per_doc)
            }
            chunks = [record for index, record in enumerate(chunks) if index in selected_indices]

    for index, record in enumerate(chunks):
        record.chunk_index = index

    return chunks
