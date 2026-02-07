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
_MODEL_LINE_RE = re.compile(r"\bLJ[-\s]?[A-Z]?\d{3,4}\b", re.IGNORECASE)
_URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_NOISE_ONLY_RE = re.compile(r"^[\|\-_=+*/\\\s\d\.,()%:;]+$")


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


def _line_quality_score(line: str) -> float:
    body = (line or "").strip()
    if not body:
        return 0.0

    total = len(body)
    alnum = sum(1 for ch in body if ch.isalnum())
    digits = sum(1 for ch in body if ch.isdigit())
    symbol = total - alnum - sum(1 for ch in body if ch.isspace())

    alnum_ratio = alnum / max(total, 1)
    digit_ratio = digits / max(total, 1)
    symbol_ratio = symbol / max(total, 1)

    score = alnum_ratio - (digit_ratio * 0.35) - (symbol_ratio * 0.2)
    return score


def _sanitize_summary_input(text: str) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""

    raw_lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    selected: list[str] = []
    seen = set()

    for raw in raw_lines:
        line = re.sub(r"\s{2,}", " ", raw).strip()
        lowered = line.lower()

        if not line:
            continue
        if lowered in seen:
            continue
        if _URL_RE.search(line):
            continue
        if line.startswith("|") and line.count("|") >= 2:
            continue
        if _NOISE_ONLY_RE.match(line):
            continue
        if _line_quality_score(line) < 0.22:
            continue
        if len(line) < 6:
            continue
        if len(line) > 220:
            line = line[:220].strip()

        selected.append(line)
        seen.add(lowered)
        if len(selected) >= 220:
            break

    if not selected:
        return cleaned[:DOC_SUMMARY_MAX_INPUT_CHARS]

    return "\n".join(selected)[:DOC_SUMMARY_MAX_INPUT_CHARS]


def _contains_catalog_signals(text: str) -> bool:
    body = (text or "").lower()
    signals = (
        "카탈로그",
        "catalog",
        "시리즈",
        "series",
        "라인 프로파일",
        "line profile",
        "3d 검사",
        "3d inspection",
        "센서",
        "sensor",
        "lj-",
    )
    hit_count = sum(1 for signal in signals if signal in body)
    return hit_count >= 3


def _keyence_lj_catalog_template(text: str) -> Optional[Tuple[str, str]]:
    body = (text or "")
    lowered = body.lower()
    has_keyence = "keyence" in lowered or "키엔스" in body
    has_lj = bool(_MODEL_LINE_RE.search(body)) or "lj-x" in lowered
    if not (has_keyence and has_lj and _contains_catalog_signals(body)):
        return None

    title = "KEYENCE LJ시리즈 라인 프로파일 센서 카탈로그"
    summary = (
        "3D 검사를 위한 라인 프로파일 센서 카탈로그로서 "
        "KEYENCE사의 LJ시리즈에 대해 소개하는 문서"
    )
    return title, summary


def _extractive_summary(filename: str, text: str) -> Tuple[str, str]:
    cleaned = _sanitize_summary_input(text)
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

    clipped = _sanitize_summary_input(text)
    if not clipped:
        return None

    prompt = (
        "너는 OCR 노이즈가 섞인 기술 문서를 요약하는 전문가다. "
        "문서의 '전체 주제'를 요약해야 하며 특정 페이지 조각만 요약하면 안 된다. "
        "표/수치/치수/깨진 문자는 노이즈로 보고 무시한다. "
        "JSON으로만 답하고 키는 title, summary만 사용한다. "
        f"title은 {DOC_SUMMARY_TITLE_MAX_CHARS}자 이내의 명사형 문장으로 작성한다. "
        f"summary는 한국어 1~2문장, {DOC_SUMMARY_SHORT_MAX_CHARS}자 이내로 작성한다. "
        "문서가 제품 소개/카탈로그 성격이면 제품군과 용도를 명확히 포함한다.\n\n"
        "[출력 예시]\n"
        "{\"title\":\"KEYENCE LJ시리즈 라인 프로파일 센서 카탈로그\","
        "\"summary\":\"3D 검사를 위한 라인 프로파일 센서 카탈로그로서 KEYENCE사의 LJ시리즈에 대해 소개하는 문서\"}\n\n"
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

    template_result = _keyence_lj_catalog_template(content_text)
    if template_result:
        return template_result

    llm_result = _summarize_with_local_llm(filename=filename, text=content_text)
    if llm_result:
        tuned_title, tuned_summary = llm_result
        if _contains_catalog_signals(content_text):
            guardrail = _keyence_lj_catalog_template(content_text)
            if guardrail:
                return guardrail
        return tuned_title, tuned_summary

    return _extractive_summary(filename=filename, text=content_text)
