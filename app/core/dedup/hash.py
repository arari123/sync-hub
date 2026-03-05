from __future__ import annotations

import hashlib
import os
import re


_PAGE_NUMBER_LINE_RE = re.compile(r"^\s*(?:page\s*\d+|\d+\s*/\s*\d+|\d+)\s*$", re.IGNORECASE)
_SPACES_RE = re.compile(r"[ \t]+")
_MULTI_WHITESPACE_RE = re.compile(r"\s+")


def file_sha256(file_path: str) -> str:
    digest = hashlib.sha256()
    with open(file_path, "rb") as file_obj:
        while True:
            chunk = file_obj.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def normalize_text_for_hash(text: str) -> str:
    body = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = []

    for line in body.split("\n"):
        stripped = line.strip()
        if not stripped:
            lines.append("")
            continue

        if _PAGE_NUMBER_LINE_RE.match(stripped):
            continue

        compact = _SPACES_RE.sub(" ", stripped)
        lines.append(compact)

    normalized = " ".join(line for line in lines if line)
    normalized = _MULTI_WHITESPACE_RE.sub(" ", normalized)
    normalized = normalized.strip().lower()
    return normalized


def normalized_text_sha256(text: str) -> str:
    normalized = normalize_text_for_hash(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def safe_file_sha256(file_path: str) -> str:
    if not file_path or not os.path.exists(file_path):
        return ""
    try:
        return file_sha256(file_path)
    except OSError as exc:
        print(f"[dedup.hash] file hash failed: {exc}")
        return ""
