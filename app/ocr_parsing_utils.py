from __future__ import annotations

import json
from typing import Any


def _read_json_object(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def _extract_by_path(data: Any, path: str) -> Any:
    cursor = data
    for token in path.split("."):
        token = token.strip()
        if not token:
            return None

        if isinstance(cursor, list):
            if not token.isdigit():
                return None
            index = int(token)
            if index < 0 or index >= len(cursor):
                return None
            cursor = cursor[index]
            continue

        if isinstance(cursor, dict):
            if token not in cursor:
                return None
            cursor = cursor[token]
            continue

        return None
    return cursor


def _extract_text_recursive(payload: Any, depth: int = 0) -> str:
    if depth > 8 or payload is None:
        return ""

    if isinstance(payload, str):
        return payload.strip()

    if isinstance(payload, dict):
        priority_keys = (
            "text",
            "ocr_text",
            "extracted_text",
            "result_text",
            "content",
            "result",
            "output",
            "answer",
            "response",
        )
        for key in priority_keys:
            if key in payload:
                candidate = _extract_text_recursive(payload.get(key), depth + 1)
                if candidate:
                    return candidate

        choices = payload.get("choices")
        if isinstance(choices, list):
            for choice in choices:
                candidate = _extract_text_recursive(choice, depth + 1)
                if candidate:
                    return candidate

        for key, value in payload.items():
            lowered = str(key).lower()
            if "text" in lowered or "content" in lowered:
                candidate = _extract_text_recursive(value, depth + 1)
                if candidate:
                    return candidate

        for value in payload.values():
            candidate = _extract_text_recursive(value, depth + 1)
            if candidate:
                return candidate
        return ""

    if isinstance(payload, list):
        for item in payload:
            candidate = _extract_text_recursive(item, depth + 1)
            if candidate:
                return candidate
        return ""

    return ""


def _extract_pages_recursive(payload: Any, depth: int = 0) -> int:
    if depth > 6 or payload is None:
        return 0

    if isinstance(payload, (int, float)):
        if payload > 0:
            return int(payload)
        return 0

    if isinstance(payload, dict):
        keys = ("pages", "page_count", "num_pages", "total_pages")
        for key in keys:
            if key in payload:
                value = _extract_pages_recursive(payload.get(key), depth + 1)
                if value > 0:
                    return value
        for value in payload.values():
            parsed = _extract_pages_recursive(value, depth + 1)
            if parsed > 0:
                return parsed
        return 0

    if isinstance(payload, list):
        for item in payload:
            parsed = _extract_pages_recursive(item, depth + 1)
            if parsed > 0:
                return parsed
        return 0

    return 0


def _parse_json_or_jsonl(response_body: str) -> Any:
    try:
        return json.loads(response_body)
    except json.JSONDecodeError:
        chunks: list[dict[str, Any]] = []
        for line in response_body.splitlines():
            text = line.strip()
            if not text:
                continue
            try:
                decoded = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(decoded, dict):
                chunks.append(decoded)

        if chunks:
            return {"chunks": chunks}
        return None


def _extract_ollama_text(payload: Any) -> str:
    if isinstance(payload, dict):
        message = payload.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()

        response = payload.get("response")
        if isinstance(response, str) and response.strip():
            return response.strip()

        chunks = payload.get("chunks")
        if isinstance(chunks, list):
            parts: list[str] = []
            for chunk in chunks:
                part = _extract_ollama_text(chunk)
                if part:
                    parts.append(part)
            if parts:
                return "\n".join(parts).strip()

    return _extract_text_recursive(payload)


def _extract_text_from_lite_ocr_item(item: Any) -> str:
    if item is None:
        return ""

    if isinstance(item, list):
        lines: list[str] = []
        for row in item:
            if (
                isinstance(row, (list, tuple))
                and len(row) >= 2
                and isinstance(row[1], (list, tuple))
                and row[1]
                and isinstance(row[1][0], str)
            ):
                text = row[1][0].strip()
                if text:
                    lines.append(text)
        if lines:
            return "\n".join(lines).strip()

    if isinstance(item, dict) or hasattr(item, "get"):
        getter = item.get if hasattr(item, "get") else None
        if getter is not None:
            rec_texts = getter("rec_texts")
            if isinstance(rec_texts, list):
                lines = [str(value).strip() for value in rec_texts if str(value).strip()]
                if lines:
                    return "\n".join(lines).strip()
            if isinstance(rec_texts, str) and rec_texts.strip():
                return rec_texts.strip()

    text = _extract_text_recursive(item)
    return text.strip()


def _extract_text_from_prediction_item(item: Any) -> str:
    payload: Any = item

    if not isinstance(payload, (dict, list, str)):
        if hasattr(payload, "res"):
            payload = getattr(payload, "res")
        elif hasattr(payload, "to_dict"):
            try:
                payload = payload.to_dict()
            except Exception:  # noqa: BLE001
                payload = str(payload)
        else:
            payload = str(payload)

    candidates: list[str] = []

    def _looks_like_path(value: str) -> bool:
        body = value.strip().lower()
        if not body:
            return False
        if body.startswith(("http://", "https://", "file://")):
            return True
        has_path_sep = ("/" in body) or ("\\" in body)
        has_doc_ext = body.endswith((".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"))
        return has_path_sep and has_doc_ext

    def _append_candidate(value: Any) -> None:
        if isinstance(value, str):
            text = value.strip()
            if text and not _looks_like_path(text):
                candidates.append(text)

    if isinstance(payload, dict):
        source_payload = payload.get("res") if isinstance(payload.get("res"), dict) else payload

        _append_candidate(source_payload.get("markdown"))
        _append_candidate(source_payload.get("overall_markdown"))
        _append_candidate(source_payload.get("overall_text"))

        parsing_blocks = source_payload.get("parsing_res_list")
        if isinstance(parsing_blocks, list) and parsing_blocks:
            contents: list[str] = []
            for block in parsing_blocks:
                content = ""
                if isinstance(block, dict):
                    value = block.get("content")
                    if isinstance(value, str):
                        content = value
                elif hasattr(block, "content"):
                    value = getattr(block, "content")
                    if isinstance(value, str):
                        content = value
                if content.strip():
                    contents.append(content.strip())
            if contents:
                _append_candidate("\n".join(contents))

        for key in ("spotting_res", "ocr_res"):
            node = source_payload.get(key)
            if isinstance(node, dict):
                rec_texts = node.get("rec_texts")
                if isinstance(rec_texts, list):
                    joined = "\n".join(str(value).strip() for value in rec_texts if str(value).strip())
                    _append_candidate(joined)
                elif isinstance(rec_texts, str):
                    _append_candidate(rec_texts)
            elif isinstance(node, list):
                rec_parts: list[str] = []
                for item_node in node:
                    if isinstance(item_node, dict):
                        value = item_node.get("rec_text")
                        if isinstance(value, str) and value.strip():
                            rec_parts.append(value.strip())
                if rec_parts:
                    _append_candidate("\n".join(rec_parts))

        _append_candidate(source_payload.get("text"))
        _append_candidate(source_payload.get("content"))
        _append_candidate(source_payload.get("result_text"))

    recursive_text = _extract_text_recursive(payload).strip()
    if recursive_text and not _looks_like_path(recursive_text):
        candidates.append(recursive_text)

    if not candidates:
        return ""

    return max(candidates, key=len).strip()


def _extract_pages_from_prediction_item(item: Any) -> int:
    for key in ("page_count", "pages", "num_pages", "total_pages"):
        value = None
        if isinstance(item, dict):
            value = item.get(key)
        elif hasattr(item, "get"):
            try:
                value = item.get(key)  # type: ignore[attr-defined]
            except Exception:  # noqa: BLE001
                value = None
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
    return 0
