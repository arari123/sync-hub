from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Set

from ..core.dedup.service import (
    compute_document_hashes,
    run_exact_for_document,
    run_near_scan,
)


def _parse_doc_ids(values: Iterable[str]) -> List[int]:
    doc_ids: Set[int] = set()
    for value in values:
        for token in str(value).split(","):
            token = token.strip()
            if not token:
                continue
            doc_ids.add(int(token))
    return sorted(doc_ids)


def _safe_parse_datetime(value: str) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _load_documents(db, doc_ids: List[int], limit: int, days: int, doc_id_start: int, doc_id_end: int):
    from .. import models

    query = db.query(models.Document).order_by(models.Document.id.asc())

    if doc_ids:
        query = query.filter(models.Document.id.in_(doc_ids))

    if doc_id_start > 0:
        query = query.filter(models.Document.id >= doc_id_start)

    if doc_id_end > 0:
        query = query.filter(models.Document.id <= doc_id_end)

    docs = query.all()

    if days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        filtered = []
        for doc in docs:
            created_at = _safe_parse_datetime(getattr(doc, "created_at", ""))
            if created_at is None:
                continue
            if created_at >= cutoff:
                filtered.append(doc)
        docs = filtered

    if limit > 0:
        docs = docs[:limit]

    return docs


def _run_exact_scan(db, documents, dry_run: bool) -> dict:
    summaries = []

    for doc in documents:
        file_hash, text_hash, _ = compute_document_hashes(doc.file_path, doc.content_text or "")
        if file_hash:
            doc.file_sha256 = file_hash
        if text_hash:
            doc.normalized_text_sha256 = text_hash

        result = run_exact_for_document(db, doc, dry_run=dry_run)
        if result.get("is_exact_duplicate"):
            summaries.append(
                {
                    "doc_id": doc.id,
                    "primary_doc_id": result.get("primary_doc_id"),
                    "cluster_id": result.get("cluster_id"),
                }
            )

    return {
        "checked": len(documents),
        "exact_duplicates": len(summaries),
        "items": summaries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan exact/near duplicate documents.")
    parser.add_argument(
        "--mode",
        choices=["exact", "near", "both"],
        default="both",
        help="Scan mode.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze only without DB update.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum number of documents to scan.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=0,
        help="Scan only documents created in recent N days.",
    )
    parser.add_argument(
        "--doc-id",
        action="append",
        default=[],
        help="Target document ids (repeatable or comma-separated).",
    )
    parser.add_argument(
        "--doc-id-start",
        type=int,
        default=0,
        help="Minimum document id for scanning.",
    )
    parser.add_argument(
        "--doc-id-end",
        type=int,
        default=0,
        help="Maximum document id for scanning.",
    )

    args = parser.parse_args()

    try:
        from ..database import SessionLocal, ensure_runtime_schema
    except ModuleNotFoundError as exc:
        print(f"DB mode unavailable: {exc}")
        return 1

    ensure_runtime_schema()
    doc_ids = _parse_doc_ids(args.doc_id)

    db = SessionLocal()
    try:
        documents = _load_documents(
            db,
            doc_ids=doc_ids,
            limit=max(0, args.limit),
            days=max(0, args.days),
            doc_id_start=max(0, args.doc_id_start),
            doc_id_end=max(0, args.doc_id_end),
        )

        if not documents:
            print("No documents matched the filter.")
            return 0

        print(f"[dedup_scan] mode={args.mode} docs={len(documents)} dry_run={args.dry_run}")

        exact_result = None
        near_result = None

        if args.mode in {"exact", "both"}:
            exact_result = _run_exact_scan(db, documents, dry_run=args.dry_run)
            print(
                "[exact]"
                f" checked={exact_result['checked']}"
                f" duplicates={exact_result['exact_duplicates']}"
            )

        if args.mode in {"near", "both"}:
            near_result = run_near_scan(
                db,
                target_doc_ids=[doc.id for doc in documents],
                dry_run=args.dry_run,
            )
            print(
                "[near]"
                f" status={near_result.get('status')}"
                f" method={near_result.get('near_method')}"
                f" clusters={len(near_result.get('clusters', []))}"
                f" pairs={near_result.get('pair_count', 0)}"
            )

        if args.dry_run:
            db.rollback()
        else:
            db.commit()

        if exact_result and exact_result.get("items"):
            for item in exact_result["items"][:20]:
                print(
                    "  [exact-dup]"
                    f" doc_id={item['doc_id']}"
                    f" primary={item['primary_doc_id']}"
                    f" cluster={item.get('cluster_id')}"
                )

        if near_result and near_result.get("clusters"):
            for cluster in near_result["clusters"][:20]:
                print(
                    "  [near-cluster]"
                    f" cluster={cluster.get('cluster_id')}"
                    f" primary={cluster.get('primary_doc_id')}"
                    f" members={cluster.get('member_doc_ids')}"
                )

        return 0
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        print(f"[dedup_scan] failed: {type(exc).__name__}: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
