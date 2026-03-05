from __future__ import annotations

import argparse
from typing import Iterable, List

from ..dedup.policies import CLI_DEDUP_TO_MODE, CLI_POLICY_TO_MODE
from ..pipeline import generate_chunk_records


def _preview(text: str, max_len: int = 120) -> str:
    body = (text or "").replace("\n", " ").strip()
    if len(body) <= max_len:
        return body
    return f"{body[:max_len].strip()}..."


def _parse_doc_ids(values: Iterable[str]) -> List[int]:
    ids: List[int] = []
    for value in values:
        for token in str(value).split(","):
            token = token.strip()
            if not token:
                continue
            ids.append(int(token))
    return sorted(set(ids))


def _run_dry_file(file_path: str, filename: str, preview_chunks: int) -> None:
    raw_text, clean_text, chunk_records = generate_chunk_records(file_path)
    print(
        f"[dry-run:file] filename={filename} "
        f"raw_chars={len(raw_text)} clean_chars={len(clean_text)} chunks={len(chunk_records)}"
    )

    for record in chunk_records[:preview_chunks]:
        print(
            "  - "
            f"chunk_index={record.chunk_index} "
            f"type={record.chunk_type} "
            f"page={record.page} "
            f"quality={record.quality_score:.3f} "
            f"len={len(record.content)} "
            f"preview='{_preview(record.content)}'"
        )


def _load_documents(db, doc_ids: List[int], limit: int):
    try:
        from ... import models
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            f"DB mode unavailable ({exc}). Install backend dependencies first."
        ) from exc

    query = db.query(models.Document).order_by(models.Document.id.asc())
    if doc_ids:
        query = query.filter(models.Document.id.in_(doc_ids))

    if limit > 0:
        query = query.limit(limit)

    return query.all()


def _run_dry_doc(doc, preview_chunks: int) -> None:
    raw_text, clean_text, chunk_records = generate_chunk_records(doc.file_path)

    print(
        f"[dry-run] doc_id={doc.id} filename={doc.filename} "
        f"raw_chars={len(raw_text)} clean_chars={len(clean_text)} chunks={len(chunk_records)}"
    )

    for record in chunk_records[:preview_chunks]:
        print(
            "  - "
            f"chunk_index={record.chunk_index} "
            f"type={record.chunk_type} "
            f"page={record.page} "
            f"quality={record.quality_score:.3f} "
            f"len={len(record.content)} "
            f"preview='{_preview(record.content)}'"
        )


def _run_reindex(db, doc, dedup_mode: str | None, index_policy: str | None) -> None:
    from ..pipeline import process_document_with_session

    process_document_with_session(
        doc.id,
        db,
        dedup_mode_override=dedup_mode,
        index_policy_override=index_policy,
    )
    db.refresh(doc)
    print(
        f"[reindex] doc_id={doc.id} filename={doc.filename} status={doc.status} "
        f"dedup_status={getattr(doc, 'dedup_status', None)} "
        f"primary={getattr(doc, 'dedup_primary_doc_id', None)} "
        f"cluster={getattr(doc, 'dedup_cluster_id', None)}"
    )


def _run_db_mode(
    doc_ids: List[int],
    limit: int,
    dry_run: bool,
    preview_chunks: int,
    dedup_mode: str | None,
    index_policy: str | None,
) -> int:
    try:
        from ...database import SessionLocal, ensure_runtime_schema
    except ModuleNotFoundError as exc:
        print(
            "DB mode unavailable: "
            f"{exc}. Use '--file-path <pdf>' for dry-run without DB dependencies."
        )
        return 1

    ensure_runtime_schema()
    db = SessionLocal()
    try:
        documents = _load_documents(db, doc_ids=doc_ids, limit=max(0, limit))
        if not documents:
            print("No documents matched the selection.")
            return 0

        for doc in documents:
            try:
                if dry_run:
                    _run_dry_doc(doc, preview_chunks=preview_chunks)
                else:
                    _run_reindex(
                        db,
                        doc,
                        dedup_mode=dedup_mode,
                        index_policy=index_policy,
                    )
            except Exception as exc:  # noqa: BLE001
                print(f"[reindex] doc_id={doc.id} failed: {type(exc).__name__}: {exc}")
                if not dry_run:
                    db.rollback()

        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Reindex documents with reflow + sentence-aware chunk schema.",
    )
    parser.add_argument(
        "--doc-id",
        action="append",
        default=[],
        help="Target document id (repeatable or comma-separated).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum number of documents to process (0 = all selected).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write index. Print generated chunks only.",
    )
    parser.add_argument(
        "--preview-chunks",
        type=int,
        default=8,
        help="Number of chunk previews to print for each document in dry-run mode.",
    )
    parser.add_argument(
        "--file-path",
        type=str,
        default="",
        help="Dry-run a single local file without DB access.",
    )
    parser.add_argument(
        "--filename",
        type=str,
        default="",
        help="Display name used with --file-path.",
    )
    parser.add_argument(
        "--dedup",
        type=str,
        choices=sorted(CLI_DEDUP_TO_MODE.keys()),
        default="exact",
        help="Dedup mode: off|exact|near (near means exact+near).",
    )
    parser.add_argument(
        "--index-policy",
        type=str,
        choices=sorted(CLI_POLICY_TO_MODE.keys()),
        default="all",
        help="Index policy: all|primary-only|prefer.",
    )

    args = parser.parse_args()
    preview_chunks = max(1, args.preview_chunks)

    if args.file_path:
        display_name = args.filename.strip() or args.file_path
        _run_dry_file(args.file_path, display_name, preview_chunks=preview_chunks)
        return 0

    doc_ids = _parse_doc_ids(args.doc_id)
    dedup_mode = CLI_DEDUP_TO_MODE.get(args.dedup)
    index_policy = CLI_POLICY_TO_MODE.get(args.index_policy)

    return _run_db_mode(
        doc_ids=doc_ids,
        limit=args.limit,
        dry_run=args.dry_run,
        preview_chunks=preview_chunks,
        dedup_mode=dedup_mode,
        index_policy=index_policy,
    )


if __name__ == "__main__":
    raise SystemExit(main())
