from __future__ import annotations

import re
from typing import List


_ABBREVIATIONS = {
    "e.g.",
    "i.e.",
    "mr.",
    "mrs.",
    "ms.",
    "dr.",
    "prof.",
    "vs.",
    "etc.",
    "fig.",
    "no.",
    "vol.",
    "al.",
}


def _normalize_text(text: str) -> str:
    body = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def _last_token(lowered: str) -> str:
    if not lowered:
        return ""
    parts = re.split(r"\s+", lowered)
    return parts[-1] if parts else ""


def _is_decimal_point(text: str, index: int) -> bool:
    if text[index] != ".":
        return False

    prev_char = text[index - 1] if index > 0 else ""
    next_char = text[index + 1] if index + 1 < len(text) else ""
    return prev_char.isdigit() and next_char.isdigit()


def _is_abbreviation(buffer: str) -> bool:
    lowered = buffer.lower().strip()
    token = _last_token(lowered)
    if token in _ABBREVIATIONS:
        return True

    # Initials like "A." or "U.S.".
    if re.search(r"(?:\b[A-Za-z]\.){1,4}$", lowered):
        return True

    return False


def split_sentences(text: str) -> List[str]:
    body = _normalize_text(text)
    if not body:
        return []

    sentences: List[str] = []
    buffer: List[str] = []

    for idx, char in enumerate(body):
        buffer.append(char)
        if char not in ".?!。！？":
            continue

        if char == "." and _is_decimal_point(body, idx):
            continue

        fragment = "".join(buffer)
        if char == "." and _is_abbreviation(fragment):
            continue

        next_char = body[idx + 1] if idx + 1 < len(body) else ""
        if next_char and next_char not in {" ", "\n", "\t", '"', "'", ")", "]", "}"}:
            continue

        sentence = fragment.strip()
        if sentence:
            sentences.append(sentence)
        buffer = []

    tail = "".join(buffer).strip()
    if tail:
        sentences.append(tail)

    # Fallback: keep long runs from line breaks as sentence boundaries.
    final_sentences: List[str] = []
    for sentence in sentences:
        pieces = [item.strip() for item in re.split(r"\n+", sentence) if item.strip()]
        final_sentences.extend(pieces)

    return final_sentences
