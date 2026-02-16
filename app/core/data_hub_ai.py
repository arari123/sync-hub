from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Iterable


_QUERY_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")
_AGENDA_CODE_RE = re.compile(r"^AG-\d{4}-\d{6}$", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")


def normalize_query(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def is_agenda_code(value: str) -> bool:
    token = normalize_query(value)
    if not token:
        return False
    return bool(_AGENDA_CODE_RE.match(token))


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


def build_agenda_summary_prompt(agenda: dict[str, Any]) -> str:
    """Build a prompt for summarizing an agenda thread by code.

    This prompt is used in the temporary Data Hub feature when the query exactly
    matches an agenda code (e.g., AG-2026-000123).
    """

    def _truncate(text: str, max_chars: int) -> str:
        value = _clean_text(text)
        if max_chars <= 0:
            return value
        if len(value) <= max_chars:
            return value
        return value[:max_chars].rstrip() + "..."

    agenda_code = str(agenda.get("agenda_code") or "").strip()
    title = str(agenda.get("title") or "").strip()
    project_name = str(agenda.get("project_name") or "").strip()
    project_code = str(agenda.get("project_code") or "").strip()
    thread_kind = str(agenda.get("thread_kind") or "").strip()
    progress_status = str(agenda.get("progress_status") or "").strip()
    record_status = str(agenda.get("record_status") or "").strip()
    requester_name = str(agenda.get("requester_name") or "").strip()
    requester_org = str(agenda.get("requester_org") or "").strip()
    responder_name = str(agenda.get("responder_name") or "").strip()
    responder_org = str(agenda.get("responder_org") or "").strip()
    created_at = str(agenda.get("created_at") or "").strip()
    last_updated_at = str(agenda.get("last_updated_at") or "").strip()

    entries_raw = agenda.get("entries") or []
    entries: list[dict[str, Any]] = []
    if isinstance(entries_raw, list):
        for item in entries_raw:
            if isinstance(item, dict):
                entries.append(item)

    report_payload = agenda.get("report_payload") or {}
    if not isinstance(report_payload, dict):
        report_payload = {}

    lines: list[str] = []
    lines.append("당신은 설비 유지보수/프로젝트 안건을 빠르게 요약하는 비서입니다.")
    lines.append("아래 AGENDA_DATA만 근거로 요약하세요. 없는 정보는 추측하지 말고 '확인 불가'라고 표시하세요.")
    lines.append("답변은 한국어로, 불필요한 서론 없이 짧고 실무적으로 작성하세요.")
    lines.append("가능하면 현상/원인/조치(임시/최종)/작업일/장소/대상 설비/투입 인력/사용 부품/현재 상태/후속 액션을 포함하세요.")
    lines.append("")
    lines.append("출력 형식")
    lines.append("요약: (1~2문장)")
    lines.append("- 현상: ...")
    lines.append("- 원인: ...")
    lines.append("- 조치(임시): ...")
    lines.append("- 조치(최종): ...")
    lines.append("- 작업일/장소: ...")
    lines.append("- 대상 설비: ...")
    lines.append("- 인력/시간: ...")
    lines.append("- 사용 부품: ...")
    lines.append("- 진행 상태: ...")
    lines.append("- 후속 액션: ...")
    lines.append("")
    lines.append("## AGENDA_DATA")
    if agenda_code:
        lines.append(f"agenda_code: {agenda_code}")
    if title:
        lines.append(f"title: {title}")
    if project_name or project_code:
        lines.append(f"project: {project_code} {project_name}".strip())
    if thread_kind:
        lines.append(f"thread_kind: {thread_kind}")
    if record_status:
        lines.append(f"record_status: {record_status}")
    if progress_status:
        lines.append(f"progress_status: {progress_status}")
    if requester_name or requester_org:
        lines.append(f"requester: {requester_name} {requester_org}".strip())
    if responder_name or responder_org:
        lines.append(f"responder: {responder_name} {responder_org}".strip())
    if created_at:
        lines.append(f"created_at: {created_at}")
    if last_updated_at:
        lines.append(f"last_updated_at: {last_updated_at}")

    if report_payload:
        lines.append("")
        lines.append("work_report_payload:")
        work_date_start = str(report_payload.get("work_date_start") or "").strip()
        work_date_end = str(report_payload.get("work_date_end") or "").strip()
        work_location = str(report_payload.get("work_location") or "").strip()
        if work_date_start or work_date_end:
            label = work_date_start
            if work_date_end and work_date_end != work_date_start:
                label = f"{work_date_start} ~ {work_date_end}".strip()
            lines.append(f"- work_date: {label}".strip())
        if work_location:
            lines.append(f"- work_location: {_truncate(work_location, 240)}")

        target_equipments = report_payload.get("target_equipments") or []
        if isinstance(target_equipments, list):
            equipments = [str(item).strip() for item in target_equipments if str(item).strip()]
            if equipments:
                joined = ", ".join(equipments[:10])
                suffix = " ..." if len(equipments) > 10 else ""
                lines.append(f"- target_equipments: {joined}{suffix}")

        sections = report_payload.get("report_sections") or {}
        if isinstance(sections, dict):
            symptom = str(sections.get("symptom") or "").strip()
            cause = str(sections.get("cause") or "").strip()
            interim_action = str(sections.get("interim_action") or "").strip()
            final_action = str(sections.get("final_action") or "").strip()
            if symptom:
                lines.append(f"- symptom: {_truncate(symptom, 1400)}")
            if cause:
                lines.append(f"- cause: {_truncate(cause, 1400)}")
            if interim_action:
                lines.append(f"- interim_action: {_truncate(interim_action, 1400)}")
            if final_action:
                lines.append(f"- final_action: {_truncate(final_action, 1400)}")

        workers = report_payload.get("workers") or []
        if isinstance(workers, list) and workers:
            lines.append("- workers:")
            for worker in workers[:12]:
                if not isinstance(worker, dict):
                    continue
                name = str(worker.get("worker_name") or "").strip()
                if not name:
                    continue
                aff = str(worker.get("worker_affiliation") or "").strip()
                hours = worker.get("work_hours")
                hours_text = ""
                try:
                    hours_text = f"{float(hours):g}h" if hours is not None else ""
                except Exception:  # noqa: BLE001
                    hours_text = ""
                extra = " ".join(part for part in (aff, hours_text) if part).strip()
                lines.append(f"  - {name}{(' (' + extra + ')') if extra else ''}")

        parts = report_payload.get("parts") or []
        if isinstance(parts, list) and parts:
            lines.append("- parts:")
            for part in parts[:16]:
                if not isinstance(part, dict):
                    continue
                part_name = str(part.get("part_name") or "").strip()
                if not part_name:
                    continue
                manu = str(part.get("manufacturer") or "").strip()
                model = str(part.get("model_name") or "").strip()
                qty = part.get("quantity")
                qty_text = ""
                try:
                    qty_text = f"x{float(qty):g}" if qty is not None else ""
                except Exception:  # noqa: BLE001
                    qty_text = ""
                bits = [bit for bit in (part_name, manu, model, qty_text) if bit]
                lines.append(f"  - {' '.join(bits)}")

    if entries:
        lines.append("")
        lines.append("entries:")
        max_entries = 6
        for idx, entry in enumerate(entries[:max_entries], start=1):
            kind = str(entry.get("entry_kind") or "").strip()
            entry_title = str(entry.get("title") or "").strip()
            created = str(entry.get("created_at") or "").strip()
            content = str(entry.get("content") or "").strip()
            header_bits = [bit for bit in (kind, entry_title) if bit]
            header = " · ".join(header_bits) if header_bits else f"entry-{idx}"
            if created:
                header = f"{header} ({created})"
            lines.append(f"- {header}")
            if content:
                lines.append(_truncate(content, 2200 if idx in {1, max_entries} else 900))

    lines.append("")
    lines.append("## SUMMARY")
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
