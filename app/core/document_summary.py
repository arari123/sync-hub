from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Optional, Tuple


DOC_SUMMARY_ENABLED = os.getenv("DOC_SUMMARY_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
DOC_SUMMARY_USE_LOCAL_LLM = os.getenv("DOC_SUMMARY_USE_LOCAL_LLM", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
DOC_SUMMARY_OLLAMA_URL = os.getenv("DOC_SUMMARY_OLLAMA_URL", "").strip()
DOC_SUMMARY_OLLAMA_MODEL = os.getenv("DOC_SUMMARY_OLLAMA_MODEL", "").strip()
DOC_SUMMARY_TIMEOUT_SECONDS = max(1, int(os.getenv("DOC_SUMMARY_TIMEOUT_SECONDS", "20")))
DOC_SUMMARY_MAX_INPUT_CHARS = max(800, int(os.getenv("DOC_SUMMARY_MAX_INPUT_CHARS", "12000")))
DOC_SUMMARY_TITLE_MAX_CHARS = max(24, int(os.getenv("DOC_SUMMARY_TITLE_MAX_CHARS", "80")))
DOC_SUMMARY_SHORT_MAX_CHARS = max(80, int(os.getenv("DOC_SUMMARY_SHORT_MAX_CHARS", "220")))

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?。！？])\s+|\n+")


def _clean_text(value: str) -> str:
    text = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _truncate(value: str, limit: int) -> str:
    body = (value or "").strip()
    if len(body) <= limit:
        return body
    return f"{body[: max(0, limit - 3)].strip()}..."


def _title_from_filename(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(filename or ""))[0]
    stem = re.sub(r"[_\-]+", " ", stem).strip()
    stem = re.sub(r"\s{2,}", " ", stem)
    if not stem:
        return "문서 요약"
    return _truncate(stem, DOC_SUMMARY_TITLE_MAX_CHARS)


def _pick_title_candidate(filename: str, text: str) -> str:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for line in lines[:24]:
        candidate = re.sub(r"^[\-\*\d\.\)\(]+", "", line).strip()
        candidate = re.sub(r"\s{2,}", " ", candidate)
        if len(candidate) < 8:
            continue
        if len(candidate) > DOC_SUMMARY_TITLE_MAX_CHARS:
            continue
        digits = sum(1 for ch in candidate if ch.isdigit())
        if digits >= max(6, len(candidate) // 2):
            continue
        return candidate
    return _title_from_filename(filename)


def _split_sentences(text: str) -> list[str]:
    output = []
    for item in _SENTENCE_SPLIT_RE.split(text or ""):
        sentence = item.strip()
        if sentence:
            output.append(sentence)
    return output


def _extractive_summary(filename: str, text: str) -> Tuple[str, str]:
    cleaned = _clean_text(text)
    title = _pick_title_candidate(filename, cleaned)
    if not cleaned:
        return title, "문서 본문 텍스트가 비어 있어 요약을 생성하지 못했습니다."

    sentences = _split_sentences(cleaned)
    selected: list[str] = []
    for sentence in sentences:
        body = sentence.strip()
        if len(body) < 18:
            continue
        selected.append(body)
        if len(selected) >= 2:
            break

    if not selected:
        selected = [cleaned]

    summary = " ".join(selected)
    summary = re.sub(r"\s{2,}", " ", summary).strip()
    summary = _truncate(summary, DOC_SUMMARY_SHORT_MAX_CHARS)
    return title, summary


def _extract_json_from_response(response_text: str) -> Optional[dict]:
    payload = (response_text or "").strip()
    if not payload:
        return None

    try:
        parsed = json.loads(payload)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = payload.find("{")
    end = payload.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        parsed = json.loads(payload[start : end + 1])
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        return None
    return None


def _summarize_with_local_llm(filename: str, text: str) -> Optional[Tuple[str, str]]:
    if not DOC_SUMMARY_USE_LOCAL_LLM:
        return None
    if not DOC_SUMMARY_OLLAMA_URL or not DOC_SUMMARY_OLLAMA_MODEL:
        return None

    clipped = _clean_text(text)[:DOC_SUMMARY_MAX_INPUT_CHARS]
    if not clipped:
        return None

    prompt = (
        "다음 문서 본문을 읽고 JSON으로만 답해라. "
        "키는 title, summary 두 개만 사용한다. "
        f"title은 {DOC_SUMMARY_TITLE_MAX_CHARS}자 이내, "
        f"summary는 한국어 1~2문장으로 {DOC_SUMMARY_SHORT_MAX_CHARS}자 이내로 작성한다.\n\n"
        f"[파일명]\n{filename}\n\n"
        f"[본문]\n{clipped}"
    )

    body = {
        "model": DOC_SUMMARY_OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1,
        },
    }

    request = urllib.request.Request(
        DOC_SUMMARY_OLLAMA_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=DOC_SUMMARY_TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"[doc-summary] local LLM call failed: {exc}")
        return None

    envelope = _extract_json_from_response(raw) or {}
    content = envelope.get("response", "")
    if isinstance(content, dict):
        parsed = content
    else:
        parsed = _extract_json_from_response(str(content)) or {}

    title = _truncate(str(parsed.get("title") or "").strip(), DOC_SUMMARY_TITLE_MAX_CHARS)
    summary = _truncate(str(parsed.get("summary") or "").strip(), DOC_SUMMARY_SHORT_MAX_CHARS)
    if not title or not summary:
        return None
    return title, summary


def build_document_summary(filename: str, content_text: str) -> Tuple[str, str]:
    if not DOC_SUMMARY_ENABLED:
        return _title_from_filename(filename), ""

    llm_result = _summarize_with_local_llm(filename=filename, text=content_text)
    if llm_result:
        return llm_result

    return _extractive_summary(filename=filename, text=content_text)

