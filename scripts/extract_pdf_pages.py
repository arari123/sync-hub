#!/usr/bin/env python3
"""Extract selected pages from a PDF into a new PDF file."""

from __future__ import annotations

import argparse
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract pages from a source PDF and save into a new PDF."
    )
    parser.add_argument("src", help="Source PDF path")
    parser.add_argument("dst", help="Output PDF path")
    parser.add_argument(
        "--pages",
        default="1",
        help="1-based page selection (comma list and ranges), e.g. 1,2,5-8",
    )
    return parser.parse_args()


def parse_page_selection(selection: str, total_pages: int) -> list[int]:
    indices: list[int] = []
    for token in selection.split(","):
        part = token.strip()
        if not part:
            continue

        if "-" in part:
            start_str, end_str = part.split("-", 1)
            start = int(start_str)
            end = int(end_str)
            if start > end:
                start, end = end, start
            for page_number in range(start, end + 1):
                index = page_number - 1
                if 0 <= index < total_pages:
                    indices.append(index)
            continue

        page_number = int(part)
        index = page_number - 1
        if 0 <= index < total_pages:
            indices.append(index)

    # Preserve order and remove duplicates.
    unique_indices: list[int] = []
    seen = set()
    for index in indices:
        if index in seen:
            continue
        seen.add(index)
        unique_indices.append(index)
    return unique_indices


def main() -> None:
    args = parse_args()
    src = Path(args.src)
    dst = Path(args.dst)

    if not src.exists():
        raise SystemExit(f"Source file not found: {src}")

    reader = PdfReader(str(src))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception:
            pass

    page_indices = parse_page_selection(args.pages, len(reader.pages))
    if not page_indices:
        raise SystemExit("No valid pages selected.")

    writer = PdfWriter()
    for page_index in page_indices:
        writer.add_page(reader.pages[page_index])

    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("wb") as file_obj:
        writer.write(file_obj)

    pages_display = ",".join(str(index + 1) for index in page_indices)
    print(f"created: {dst}")
    print(f"pages: {pages_display}")


if __name__ == "__main__":
    main()
