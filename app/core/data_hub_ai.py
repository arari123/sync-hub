from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Iterable


_QUERY_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")
_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")


def normalize_query(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def tokenize_query(query: str) -> list[str]:
    text = normalize_query(query)
    if not text:
        return []

    raw_tokens = re.split(r"\s+", text)
    raw_tokens.extend(_QUERY_TOKEN_PATTERN.findall(text))

    seen = set()
    tokens: list[str] = []
    for token in raw_tokens:
        cleaned = (token or "").strip()
        if len(cleaned) < 2:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        tokens.append(cleaned)
    return sorted(tokens, key=len, reverse=True)


def _clean_text(value: str) -> str:
    text = str(value or "")
    text = _TAG_RE.sub(" ", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    return text.strip()


def build_excerpt(content: str, query: str, *, max_chars: int = 900) -> str:
    text = _clean_text(content)
    if not text:
        return ""

    tokens = tokenize_query(query)
    lowered = text.lower()
    hit_pos = -1
    hit_len = 0

    for token in tokens:
        pos = lowered.find(token.lower())
        if pos == -1:
            continue
        if hit_pos == -1 or pos < hit_pos:
            hit_pos = pos
            hit_len = len(token)

    if hit_pos == -1:
        excerpt = text[:max_chars]
        return excerpt + ("..." if len(text) > len(excerpt) else "")

    radius_before = min(240, max_chars // 3)
    radius_after = min(560, max_chars)

    start = max(0, hit_pos - radius_before)
    end = min(len(text), hit_pos + hit_len + radius_after)
    excerpt = text[start:end].strip()

    if len(excerpt) > max_chars:
        excerpt = excerpt[:max_chars].rstrip()

    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    return f"{prefix}{excerpt}{suffix}"


@dataclass(frozen=True)
class RagContextItem:
    doc_id: int
    chunk_id: int
    page: int | None
    filename: str
    excerpt: str
    score: float


def build_rag_context(
    hits: Iterable[dict[str, Any]],
    query: str,
    *,
    max_chunks: int = 8,
    max_chars_per_chunk: int = 900,
    max_total_chars: int = 6000,
) -> list[RagContextItem]:
    contexts: list[RagContextItem] = []
    seen = set()
    total_chars = 0

    for hit in hits or []:
        source = hit.get("_source", {}) if isinstance(hit, dict) else {}
        doc_id = source.get("doc_id")
        chunk_id = source.get("chunk_id")
        if doc_id is None or chunk_id is None:
            continue

        try:
            doc_id_int = int(doc_id)
            chunk_id_int = int(chunk_id)
        except (TypeError, ValueError):
            continue

        page_raw = source.get("page")
        page_value = None
        if page_raw not in (None, ""):
            try:
                page_value = int(page_raw)
            except (TypeError, ValueError):
                page_value = None

        key = (doc_id_int, chunk_id_int, page_value)
        if key in seen:
            continue
        seen.add(key)

        filename = str(source.get("filename") or "").strip()
        content = str(source.get("content") or "")
        excerpt = build_excerpt(content, query, max_chars=max_chars_per_chunk)
        if not excerpt:
            continue

        score = float(hit.get("_score") or 0.0)

        if total_chars + len(excerpt) > max_total_chars and contexts:
            break

        contexts.append(
            RagContextItem(
                doc_id=doc_id_int,
                chunk_id=chunk_id_int,
                page=page_value,
                filename=filename,
                excerpt=excerpt,
                score=score,
            )
        )
        total_chars += len(excerpt)
        if len(contexts) >= max_chunks:
            break

    return contexts


def contexts_fingerprint(query: str, contexts: list[RagContextItem], *, extra: str = "") -> str:
    normalized_q = normalize_query(query).lower()
    payload = {
        "q": normalized_q,
        "extra": str(extra or ""),
        "items": [
            {
                "doc_id": item.doc_id,
                "chunk_id": item.chunk_id,
                "page": item.page,
                "excerpt_sha256": hashlib.sha256(item.excerpt.encode("utf-8")).hexdigest(),
            }
            for item in contexts
        ],
    }
    dumped = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(dumped.encode("utf-8")).hexdigest()


def build_answer_prompt(query: str, contexts: list[RagContextItem]) -> str:
    normalized_q = normalize_query(query)
    lines: list[str] = []
    lines.append("당신은 산업용 부품(비전 카메라/레이저 프로파일 센서/서보 모터 등) 문서 기반 지식 검색 비서입니다.")
    lines.append("아래 CONTEXT(문서 발췌)만 근거로 답변하세요. CONTEXT에 없는 정보는 추측하지 말고 '문서에서 확인 불가'라고 말하세요.")
    lines.append("답변은 한국어로 작성하고, 불필요한 서론/중복을 피하세요.")
    lines.append("답변은 짧고 실무적으로 작성하세요(권장: 25줄 이내, 최대 12개 항목).")
    lines.append("모델 추천/리스트업이 요청되면, 조건을 만족하는 항목을 표나 리스트로 정리하고 각 항목마다 근거를 [doc_id p.page] 형식으로 표기하세요.")
    lines.append("사양/스펙 요약이 요청되면, 핵심 사양을 항목별로 정리하고 각 항목마다 근거를 [doc_id p.page] 형식으로 표기하세요.")
    lines.append("알람/조치방법이 요청되면, 단계별 조치 절차를 요약하고 근거를 함께 제시하세요.")
    lines.append("")
    lines.append("출력 포맷(예시)")
    lines.append("요약: (1~2문장)")
    lines.append("- 항목: 값 [doc_id p.page]")
    lines.append("- 항목: 값 [doc_id p.page]")
    lines.append("")
    lines.append("## QUESTION")
    lines.append(normalized_q)
    lines.append("")
    lines.append("## CONTEXT")
    if not contexts:
        lines.append("(no context)")
    else:
        for index, item in enumerate(contexts, start=1):
            page_text = f"p.{item.page}" if item.page is not None else "p.-"
            filename = item.filename or "(unknown filename)"
            lines.append(f"[{index}] doc_id={item.doc_id} {filename} {page_text}")
            lines.append(item.excerpt)
            lines.append("")
    lines.append("## ANSWER")
    return "\n".join(lines).strip() + "\n"


class TTLCache:
    def __init__(self, *, ttl_seconds: int = 86400, max_items: int = 256):
        self.ttl_seconds = max(1, int(ttl_seconds))
        self.max_items = max(1, int(max_items))
        self._lock = threading.Lock()
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        now = time.time()
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, value = item
            if now >= expires_at:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        now = time.time()
        expires_at = now + float(self.ttl_seconds)
        with self._lock:
            self._store[key] = (expires_at, value)
            if len(self._store) <= self.max_items:
                return

            # Drop the oldest expiring items first (good enough for this temporary feature).
            sorted_items = sorted(self._store.items(), key=lambda item: item[1][0])
            for drop_key, _ in sorted_items[: max(1, len(self._store) - self.max_items)]:
                self._store.pop(drop_key, None)
