#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from pypdfium2 import PdfDocument


def convert_pdf_to_image_pdf(
    source: Path,
    destination: Path,
    scale: float,
    resolution: float,
    max_pages: int | None,
):
    if not source.exists():
        raise FileNotFoundError(f"Source PDF not found: {source}")

    document = PdfDocument(str(source))
    total_pages = len(document)
    pages_to_render = total_pages if max_pages is None else min(total_pages, max_pages)

    images = []
    for page_index in range(pages_to_render):
        page = document[page_index]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil().convert("RGB")
        images.append(image)

        if hasattr(bitmap, "close"):
            bitmap.close()
        if hasattr(page, "close"):
            page.close()

    if hasattr(document, "close"):
        document.close()

    if not images:
        raise RuntimeError("No pages rendered from source PDF.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    first, *rest = images
    first.save(
        str(destination),
        "PDF",
        save_all=True,
        append_images=rest,
        resolution=resolution,
    )

    for image in images:
        image.close()

    return pages_to_render


def main():
    parser = argparse.ArgumentParser(description="Convert a text/selectable PDF into image-only PDF.")
    parser.add_argument("source", type=Path, help="Source PDF path")
    parser.add_argument("destination", type=Path, help="Destination image-only PDF path")
    parser.add_argument("--scale", type=float, default=1.6, help="Render scale (default: 1.6)")
    parser.add_argument("--resolution", type=float, default=120.0, help="Output PDF resolution metadata")
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Optional page limit for quick testing",
    )
    args = parser.parse_args()

    rendered = convert_pdf_to_image_pdf(
        source=args.source,
        destination=args.destination,
        scale=args.scale,
        resolution=args.resolution,
        max_pages=args.max_pages,
    )
    print(f"created:{args.destination}")
    print(f"pages:{rendered}")


if __name__ == "__main__":
    main()
