from __future__ import annotations

import math
import re
from typing import Dict, List, Sequence


_MULTISPACE_RE = re.compile(r"[ \t]+")
_TRAILING_PAGE_RE = re.compile(r"^\s*(page\s*\d+|\d+\s*/\s*\d+)\s*$", re.IGNORECASE)
_LIST_PREFIX_RE = re.compile(r"^(?:[-*]|\d+[\.)\]])\s+")
_HYPHEN_JOIN_RE = re.compile(r"([A-Za-z]{2,})-$")


def normalize_line(text: str) -> str:
    cleaned = (text or "").replace("\xa0", " ").replace("\r", " ").strip()
    cleaned = _MULTISPACE_RE.sub(" ", cleaned)
    return cleaned.strip()


def normalize_text(text: str) -> str:
    body = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def _is_short_repeatable(text: str) -> bool:
    line = normalize_line(text)
    if not line:
        return False

    if len(line) > 80:
        return False

    if _TRAILING_PAGE_RE.match(line):
        return True

    alnum = sum(1 for ch in line if ch.isalnum())
    return alnum >= 2


def remove_repeating_headers_footers(
    pages: Sequence[Sequence[str]],
    edge_depth: int = 2,
    min_repeat_ratio: float = 0.6,
) -> List[List[str]]:
    if not pages:
        return []

    normalized_pages = [[normalize_line(line) for line in page if normalize_line(line)] for page in pages]
    page_count = len(normalized_pages)
    min_repeat = max(2, int(math.ceil(page_count * min_repeat_ratio)))

    header_counts: Dict[str, int] = {}
    footer_counts: Dict[str, int] = {}

    for page in normalized_pages:
        head_candidates = page[:edge_depth]
        tail_candidates = page[-edge_depth:] if edge_depth > 0 else []

        seen_head = set()
        for line in head_candidates:
            if not _is_short_repeatable(line) or line in seen_head:
                continue
            seen_head.add(line)
            header_counts[line] = header_counts.get(line, 0) + 1

        seen_tail = set()
        for line in tail_candidates:
            if not _is_short_repeatable(line) or line in seen_tail:
                continue
            seen_tail.add(line)
            footer_counts[line] = footer_counts.get(line, 0) + 1

    repeated_headers = {line for line, count in header_counts.items() if count >= min_repeat}
    repeated_footers = {line for line, count in footer_counts.items() if count >= min_repeat}

    cleaned_pages: List[List[str]] = []
    for page in normalized_pages:
        if not page:
            cleaned_pages.append([])
            continue

        cleaned = list(page)
        for line in list(cleaned[:edge_depth]):
            if line in repeated_headers:
                cleaned.remove(line)

        for line in reversed(cleaned[-edge_depth:]):
            if line in repeated_footers and line in cleaned:
                idx = len(cleaned) - 1 - cleaned[::-1].index(line)
                cleaned.pop(idx)

        cleaned_pages.append(cleaned)

    return cleaned_pages


def _looks_like_heading(line: str) -> bool:
    text = normalize_line(line)
    if not text:
        return False

    if len(text) > 48:
        return False

    if text.endswith(":"):
        return True

    alpha = [ch for ch in text if ch.isalpha()]
    if alpha and sum(1 for ch in alpha if ch.isupper()) / len(alpha) > 0.82:
        return True

    return False


def _is_sentence_terminal(line: str) -> bool:
    text = normalize_line(line)
    if not text:
        return False

    if text.endswith((".", "?", "!", "。", "！", "？")):
        return True

    return False


def _should_join_lines(prev_line: str, next_line: str) -> bool:
    prev_text = normalize_line(prev_line)
    next_text = normalize_line(next_line)

    if not prev_text or not next_text:
        return False

    if _looks_like_heading(prev_text) or _looks_like_heading(next_text):
        return False

    if _LIST_PREFIX_RE.match(prev_text) or _LIST_PREFIX_RE.match(next_text):
        return False

    if _is_sentence_terminal(prev_text):
        return False

    if prev_text.endswith((":", ";", ",")):
        return True

    return True


def restore_hyphenation(lines: Sequence[str]) -> List[str]:
    restored: List[str] = []
    index = 0

    while index < len(lines):
        current = normalize_line(lines[index])
        if not current:
            index += 1
            continue

        if index + 1 < len(lines):
            match = _HYPHEN_JOIN_RE.search(current)
            if match:
                nxt = normalize_line(lines[index + 1])
                if nxt and re.match(r"^[A-Za-z]{2,}", nxt):
                    joined = current[:-1] + nxt
                    restored.append(joined)
                    index += 2
                    continue

        restored.append(current)
        index += 1

    return restored


def merge_soft_linebreaks(lines: Sequence[str]) -> str:
    merged_lines = restore_hyphenation(lines)
    if not merged_lines:
        return ""

    paragraphs: List[str] = []
    buffer = ""

    for line in merged_lines:
        cleaned = normalize_line(line)
        if not cleaned:
            if buffer:
                paragraphs.append(buffer.strip())
                buffer = ""
            continue

        if not buffer:
            buffer = cleaned
            continue

        if _should_join_lines(buffer, cleaned):
            buffer = f"{buffer} {cleaned}".strip()
        else:
            paragraphs.append(buffer.strip())
            buffer = cleaned

    if buffer:
        paragraphs.append(buffer.strip())

    return "\n".join(paragraphs).strip()


def build_clean_page_texts(page_lines: Sequence[Sequence[str]]) -> List[str]:
    without_headers = remove_repeating_headers_footers(page_lines)
    clean_texts: List[str] = []

    for lines in without_headers:
        clean = merge_soft_linebreaks(lines)
        clean_texts.append(normalize_text(clean))

    return clean_texts
