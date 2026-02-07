#!/usr/bin/env python3
"""Generate OCR indexing quality comparison report for fixed sample documents."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@dataclass
class DocMetric:
    doc_id: int
    filename: str
    status: str
    content_chars: int
    chunk_count: int
    table_chunk_count: int
    table_chunk_ratio: float
    ai_title: str
    ai_summary_short: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate OCR quality comparison markdown report."
    )
    parser.add_argument(
        "--doc-filename",
        action="append",
        default=[],
        help="Target filename (repeatable). Defaults to fixed OCR sample set.",
    )
    parser.add_argument(
        "--query",
        action="append",
        default=[],
        help="Search query for top-k recall (repeatable).",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        help="Top-k for recall calculation.",
    )
    parser.add_argument(
        "--api-base",
        default=os.getenv("QUALITY_REPORT_API_BASE", "http://localhost:8000"),
        help="API base URL.",
    )
    parser.add_argument(
        "--es-url",
        default=os.getenv("QUALITY_REPORT_ES_URL", os.getenv("ES_HOST", "http://elasticsearch:9200")),
        help="Elasticsearch base URL.",
    )
    parser.add_argument(
        "--es-index",
        default="documents_index",
        help="Elasticsearch index name.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Output markdown path. Default: reports/ocr_quality_comparison_YYYY-mm-dd_HHMMSS.md",
    )
    return parser.parse_args()


def _http_json(url: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8", errors="ignore")
    if not raw.strip():
        return {}
    return json.loads(raw)


def _es_count(es_url: str, index_name: str, query: dict) -> int:
    url = f"{es_url.rstrip('/')}/{index_name}/_count"
    payload = {"query": query}
    body = _http_json(url, method="POST", payload=payload)
    return int(body.get("count") or 0)


def _load_target_documents(filenames: list[str]) -> list:
    from app import models
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        docs = []
        for filename in filenames:
            doc = (
                db.query(models.Document)
                .filter(models.Document.filename == filename)
                .order_by(models.Document.id.desc())
                .first()
            )
            if doc is None:
                raise RuntimeError(f"Target document not found: {filename}")
            docs.append(doc)
        return docs
    finally:
        db.close()


def _collect_doc_metric(doc, es_url: str, es_index: str) -> DocMetric:
    chunk_count = _es_count(
        es_url,
        es_index,
        {"term": {"doc_id": int(doc.id)}},
    )
    table_chunk_count = _es_count(
        es_url,
        es_index,
        {
            "bool": {
                "must": [
                    {"term": {"doc_id": int(doc.id)}},
                    {"prefix": {"chunk_type": "table_"}},
                ]
            }
        },
    )

    ratio = (table_chunk_count / chunk_count) if chunk_count > 0 else 0.0
    return DocMetric(
        doc_id=int(doc.id),
        filename=str(doc.filename or ""),
        status=str(doc.status or ""),
        content_chars=len(doc.content_text or ""),
        chunk_count=chunk_count,
        table_chunk_count=table_chunk_count,
        table_chunk_ratio=ratio,
        ai_title=str(doc.ai_title or ""),
        ai_summary_short=str(doc.ai_summary_short or ""),
    )


def _search(api_base: str, query: str, limit: int) -> list[dict]:
    encoded_q = urllib.parse.quote(query, safe="")
    url = f"{api_base.rstrip('/')}/documents/search?q={encoded_q}&limit={max(1, limit)}"
    data = _http_json(url)
    if isinstance(data, list):
        return data
    return []


def _compute_recall_rows(
    api_base: str,
    queries: list[str],
    target_doc_ids: list[int],
    top_k: int,
) -> tuple[list[dict], float]:
    rows: list[dict] = []
    total_hits = 0
    total_slots = max(1, len(queries) * max(1, len(target_doc_ids)))

    for query in queries:
        results = _search(api_base=api_base, query=query, limit=top_k)
        ranked_doc_ids = [int(item.get("doc_id")) for item in results if item.get("doc_id") is not None]
        found = [doc_id for doc_id in target_doc_ids if doc_id in ranked_doc_ids[:top_k]]
        recall = (len(found) / len(target_doc_ids)) if target_doc_ids else 0.0
        total_hits += len(found)

        rows.append(
            {
                "query": query,
                "found_doc_ids": found,
                "found_count": len(found),
                "target_count": len(target_doc_ids),
                "top_k_recall": recall,
                "top_doc_ids": ranked_doc_ids[:top_k],
            }
        )

    overall_recall = total_hits / total_slots
    return rows, overall_recall


def _build_markdown(
    generated_at: str,
    metrics: list[DocMetric],
    recall_rows: list[dict],
    overall_recall: float,
    top_k: int,
) -> str:
    lines: list[str] = []
    lines.append("# OCR 품질 비교 자동 리포트")
    lines.append("")
    lines.append(f"- 생성 시각: `{generated_at}`")
    lines.append(f"- 대상 문서 수: `{len(metrics)}`")
    lines.append(f"- 검색 재현율 기준: `top-{top_k}`")
    lines.append("")
    lines.append("## 문서 지표")
    lines.append("")
    lines.append("| doc_id | filename | status | content_chars | chunk_count | table_chunk_count | table_chunk_ratio |")
    lines.append("|---:|---|---|---:|---:|---:|---:|")
    for item in metrics:
        lines.append(
            f"| {item.doc_id} | {item.filename} | {item.status} | "
            f"{item.content_chars} | {item.chunk_count} | {item.table_chunk_count} | {item.table_chunk_ratio:.4f} |"
        )

    lines.append("")
    lines.append("## 검색 top-k 재현율")
    lines.append("")
    lines.append("| query | found/target | top_k_recall | top_doc_ids |")
    lines.append("|---|---:|---:|---|")
    for row in recall_rows:
        lines.append(
            f"| {row['query']} | {row['found_count']}/{row['target_count']} | "
            f"{row['top_k_recall']:.4f} | {row['top_doc_ids']} |"
        )

    lines.append("")
    lines.append(f"- 전체 top-{top_k} 재현율(문서 기준): `{overall_recall:.4f}`")
    lines.append("")
    lines.append("## 문서별 요약 메타")
    lines.append("")
    for item in metrics:
        lines.append(f"### doc_id={item.doc_id} / {item.filename}")
        lines.append(f"- ai_title: `{item.ai_title}`")
        lines.append(f"- ai_summary_short: `{item.ai_summary_short}`")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def main() -> int:
    args = parse_args()
    target_filenames = args.doc_filename or [
        "AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2.pdf",
        "AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image.pdf",
    ]
    queries = args.query or [
        "LJ-X8000",
        "라인 프로파일 센서",
        "인라인 3D 검사",
        "광시야 고정도 타입",
        "KEYENCE LJ 시리즈",
    ]

    documents = _load_target_documents(target_filenames)
    metrics = [
        _collect_doc_metric(doc=item, es_url=args.es_url, es_index=args.es_index)
        for item in documents
    ]
    target_doc_ids = [item.doc_id for item in metrics]

    recall_rows, overall_recall = _compute_recall_rows(
        api_base=args.api_base,
        queries=queries,
        target_doc_ids=target_doc_ids,
        top_k=max(1, args.top_k),
    )

    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    output_path = args.output.strip()
    if not output_path:
        output_path = (
            "reports/"
            f"ocr_quality_comparison_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.md"
        )

    markdown = _build_markdown(
        generated_at=generated_at,
        metrics=metrics,
        recall_rows=recall_rows,
        overall_recall=overall_recall,
        top_k=max(1, args.top_k),
    )

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markdown, encoding="utf-8")

    print(f"[quality-report] generated: {output.as_posix()}")
    print(f"[quality-report] overall_recall_top_{max(1, args.top_k)}={overall_recall:.4f}")
    for metric in metrics:
        print(
            "[quality-report] "
            f"doc_id={metric.doc_id} content_chars={metric.content_chars} "
            f"chunks={metric.chunk_count} table_ratio={metric.table_chunk_ratio:.4f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
