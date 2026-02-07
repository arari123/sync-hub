from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Optional, Sequence, Tuple


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
DOC_SUMMARY_LLM_MAX_RETRIES = max(1, int(os.getenv("DOC_SUMMARY_LLM_MAX_RETRIES", "3")))
DOC_TYPE_MAX_LABELS = max(1, int(os.getenv("DOC_TYPE_MAX_LABELS", "3")))

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?。！？])\s+|\n+")
_MODEL_LINE_RE = re.compile(r"\bLJ[-\s]?[A-Z]?\d{3,4}\b", re.IGNORECASE)
_URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_NOISE_ONLY_RE = re.compile(r"^[\|\-_=+*/\\\s\d\.,()%:;]+$")

DOC_TYPE_CATALOG = "catalog"
DOC_TYPE_MANUAL = "manual"
DOC_TYPE_DATASHEET = "datasheet"

_DOC_TYPE_PRIORITY = (
    DOC_TYPE_DATASHEET,
    DOC_TYPE_MANUAL,
    DOC_TYPE_CATALOG,
)
_DOC_TYPE_RULES = {
    DOC_TYPE_CATALOG: (
        "catalog",
        "catalogue",
        "brochure",
        "lineup",
        "product guide",
        "product catalog",
        "카탈로그",
        "브로셔",
        "라인업",
        "제품 소개",
    ),
    DOC_TYPE_MANUAL: (
        "manual",
        "user guide",
        "instruction",
        "installation",
        "maintenance",
        "operation",
        "troubleshooting",
        "설명서",
        "사용설명서",
        "매뉴얼",
        "설치",
        "유지보수",
        "운용",
    ),
    DOC_TYPE_DATASHEET: (
        "datasheet",
        "data sheet",
        "technical data",
        "specification",
        "specifications",
        "electrical characteristics",
        "absolute maximum ratings",
        "ordering information",
        "사양서",
        "데이터시트",
        "규격",
        "정격",
    ),
}
_DOC_TYPE_PROMPT_GUIDE = {
    DOC_TYPE_CATALOG: "카탈로그 문서로 보고 제품군 라인업, 대표 특징, 적용 용도를 중심으로 요약하라.",
    DOC_TYPE_MANUAL: "설명서 문서로 보고 사용 목적, 핵심 절차, 주의사항/제약을 중심으로 요약하라.",
    DOC_TYPE_DATASHEET: "데이터시트 문서로 보고 모델군과 핵심 사양(성능/인터페이스/정격)을 중심으로 요약하라.",
}


def _normalize_document_type_token(value: str) -> str:
    token = (value or "").strip().lower()
    alias_map = {
        "catalogue": DOC_TYPE_CATALOG,
        "brochure": DOC_TYPE_CATALOG,
        "guide": DOC_TYPE_MANUAL,
        "user_guide": DOC_TYPE_MANUAL,
        "instructions": DOC_TYPE_MANUAL,
        "spec": DOC_TYPE_DATASHEET,
        "specs": DOC_TYPE_DATASHEET,
        "data_sheet": DOC_TYPE_DATASHEET,
    }
    return alias_map.get(token, token)


def _normalize_document_types(document_types: Sequence[str] | None) -> list[str]:
    if not document_types:
        return []
    output: list[str] = []
    seen = set()
    for item in document_types:
        token = _normalize_document_type_token(str(item))
        if token not in _DOC_TYPE_PRIORITY:
            continue
        if token in seen:
            continue
        seen.add(token)
        output.append(token)
    output.sort(key=lambda value: _DOC_TYPE_PRIORITY.index(value))
    return output


def serialize_document_types(document_types: Sequence[str] | None) -> str:
    normalized = _normalize_document_types(document_types)
    if not normalized:
        return ""
    return json.dumps(normalized, ensure_ascii=False)


def parse_document_types(value: str | Sequence[str] | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return _normalize_document_types([str(item) for item in value])

    raw = str(value).strip()
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return _normalize_document_types([str(item) for item in parsed])
    except json.JSONDecodeError:
        pass

    return _normalize_document_types([item.strip() for item in raw.split(",") if item.strip()])


def classify_document_types(filename: str, content_text: str) -> list[str]:
    normalized_filename = re.sub(r"[_\-]+", " ", (filename or "")).lower()
    normalized_text = _sanitize_summary_input(content_text).lower()

    scores = {}
    for doc_type, keywords in _DOC_TYPE_RULES.items():
        score = 0
        for keyword in keywords:
            if keyword in normalized_filename:
                score += 3
            elif keyword in normalized_text:
                score += 1
        if score > 0:
            scores[doc_type] = score

    if _is_keyence_lj_catalog(content_text):
        scores[DOC_TYPE_CATALOG] = scores.get(DOC_TYPE_CATALOG, 0) + 2

    selected = [
        doc_type
        for doc_type, score in sorted(
            scores.items(),
            key=lambda item: (item[1], -_DOC_TYPE_PRIORITY.index(item[0])),
            reverse=True,
        )
        if score >= 2
    ]
    return _normalize_document_types(selected[:DOC_TYPE_MAX_LABELS])


def _document_type_prompt_guidance(document_types: Sequence[str] | None) -> str:
    normalized = _normalize_document_types(document_types)
    if not normalized:
        return ""

    labels = ", ".join(normalized)
    lines = [f"[문서 타입 힌트]\n{labels}"]
    lines.extend(_DOC_TYPE_PROMPT_GUIDE[item] for item in normalized if item in _DOC_TYPE_PROMPT_GUIDE)
    return "\n".join(lines)


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


def _is_keyence_lj_catalog(text: str) -> bool:
    body = (text or "")
    lowered = body.lower()
    has_keyence = "keyence" in lowered or "키엔스" in body
    has_lj = bool(_MODEL_LINE_RE.search(body)) or "lj-x" in lowered
    return has_keyence and has_lj and _contains_catalog_signals(body)


def _keyword_hit_count(text: str, keywords: tuple[str, ...]) -> int:
    body = (text or "").lower()
    return sum(1 for keyword in keywords if keyword in body)


def _is_high_quality_llm_summary(title: str, summary: str, source_text: str) -> bool:
    if len(title.strip()) < 6 or len(summary.strip()) < 16:
        return False
    if _NOISE_ONLY_RE.match(title.strip()) or _NOISE_ONLY_RE.match(summary.strip()):
        return False

    if _is_keyence_lj_catalog(source_text):
        merged = f"{title} {summary}".lower()
        has_brand = "keyence" in merged or "키엔스" in f"{title} {summary}"
        has_series = bool(re.search(r"\blj(?:[-\s]?[a-z]?\d{0,4})?\b", merged))
        if not (has_brand or has_series):
            return False

        catalog_keywords = ("keyence", "lj", "카탈로그", "라인 프로파일", "3d", "센서")
        hit_count = _keyword_hit_count(merged, catalog_keywords)
        if hit_count < 2:
            return False
    return True


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


def _pick_series_token(text: str) -> str:
    match = _MODEL_LINE_RE.search(text or "")
    if not match:
        return "LJ 시리즈"
    return re.sub(r"\s+", "", match.group(0)).upper()


def _postprocess_summary_text(value: str) -> str:
    body = (value or "").strip()
    replacements = {
        "inlining": "인라인",
        "in-line": "인라인",
        "인lining": "인라인",
    }
    for src, dst in replacements.items():
        body = body.replace(src, dst)
    body = re.sub(r"\s{2,}", " ", body).strip()
    return body


def _normalize_llm_summary(title: str, summary: str, source_text: str) -> str:
    body = _postprocess_summary_text(summary)
    lowered = body.lower()

    needs_rewrite = (
        len(body) < 28
        or "에 대한 요약" in body
        or lowered in {"요약", "문서 요약"}
    )
    if not needs_rewrite:
        return _truncate(body, DOC_SUMMARY_SHORT_MAX_CHARS)

    if _is_keyence_lj_catalog(source_text):
        series_token = _pick_series_token(f"{title} {source_text}")
        has_keyence = "keyence" in (source_text or "").lower() or "키엔스" in (source_text or "")
        prefix = "KEYENCE사의 " if has_keyence else ""
        rewritten = (
            f"{prefix}{series_token} 기반 인라인 3D 검사 시스템의 특징과 적용 용도를 소개하는 문서입니다."
        )
        return _truncate(_postprocess_summary_text(rewritten), DOC_SUMMARY_SHORT_MAX_CHARS)

    rewritten = f"{title.strip()}의 핵심 특징과 적용 내용을 소개하는 문서입니다."
    return _truncate(_postprocess_summary_text(rewritten), DOC_SUMMARY_SHORT_MAX_CHARS)


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


def _summarize_with_local_llm(
    filename: str,
    text: str,
    document_types: Sequence[str] | None = None,
) -> Optional[Tuple[str, str]]:
    if not DOC_SUMMARY_USE_LOCAL_LLM:
        return None
    if not DOC_SUMMARY_OLLAMA_URL or not DOC_SUMMARY_OLLAMA_MODEL:
        return None

    clipped = _sanitize_summary_input(text)
    if not clipped:
        return None

    type_guidance = _document_type_prompt_guidance(document_types)
    base_prompt = (
        "너는 OCR 노이즈가 섞인 기술 문서를 요약하는 전문가다. "
        "문서의 '전체 주제'를 요약해야 하며 특정 페이지 조각만 요약하면 안 된다. "
        "표/수치/치수/깨진 문자는 노이즈로 보고 무시한다. "
        "JSON으로만 답하고 키는 title, summary만 사용한다. "
        f"title은 {DOC_SUMMARY_TITLE_MAX_CHARS}자 이내의 명사형 문장으로 작성한다. "
        f"summary는 한국어 1~2문장, {DOC_SUMMARY_SHORT_MAX_CHARS}자 이내로 작성한다. "
        "문서가 제품 소개/카탈로그 성격이면 제품군과 용도를 명확히 포함한다. "
        "본문에 등장한 회사명/제품군(예: KEYENCE, LJ 시리즈 등) 고유명사는 가능한 한 유지한다. "
        "파일명/페이지 번호를 제목으로 그대로 쓰지 않는다.\n\n"
        "[출력 형식]\n"
        "{\"title\":\"<문서 전체 주제>\",\"summary\":\"<문서 핵심 요약>\"}\n"
        "위는 자리표시자이며 문구를 그대로 복사하지 않는다.\n\n"
        f"{type_guidance}\n\n"
        f"[파일명]\n{filename}\n\n"
        f"[본문]\n{clipped}"
    )
    feedback = ""
    for attempt in range(1, DOC_SUMMARY_LLM_MAX_RETRIES + 1):
        prompt = base_prompt
        if feedback:
            prompt = f"{base_prompt}\n\n[재시도 피드백]\n{feedback}"

        body = {
            "model": DOC_SUMMARY_OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.2,
                "top_p": 0.9,
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
            print(f"[doc-summary] local LLM call failed (attempt={attempt}): {exc}")
            if attempt >= DOC_SUMMARY_LLM_MAX_RETRIES:
                return None
            feedback = (
                "이전 요청은 응답 오류 또는 시간 초과로 실패했다. "
                "반드시 JSON 형식(title, summary)으로 다시 작성하라."
            )
            continue

        envelope = _extract_json_from_response(raw) or {}
        content = envelope.get("response", "")
        if isinstance(content, dict):
            parsed = content
        else:
            parsed = _extract_json_from_response(str(content)) or {}

        title = _truncate(str(parsed.get("title") or "").strip(), DOC_SUMMARY_TITLE_MAX_CHARS)
        summary = _truncate(str(parsed.get("summary") or "").strip(), DOC_SUMMARY_SHORT_MAX_CHARS)
        summary = _normalize_llm_summary(title, summary, text)
        if title and summary and _is_high_quality_llm_summary(title, summary, text):
            return title, summary

        feedback = (
            "이전 출력이 기준 미달이었다. "
            "문서 전체 주제를 더 명확히 표현하고, 제품군/용도 키워드를 포함해 다시 작성하라."
        )

    return None


def build_document_summary(
    filename: str,
    content_text: str,
    document_types: Sequence[str] | None = None,
) -> Tuple[str, str]:
    if not DOC_SUMMARY_ENABLED:
        return _title_from_filename(filename), ""

    normalized_types = _normalize_document_types(document_types)
    if not normalized_types:
        normalized_types = classify_document_types(filename=filename, content_text=content_text)

    llm_result = _summarize_with_local_llm(
        filename=filename,
        text=content_text,
        document_types=normalized_types,
    )
    if llm_result:
        return llm_result

    return _extractive_summary(filename=filename, text=content_text)
