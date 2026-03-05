#!/usr/bin/env python3
"""Debug PaddleOCR-VL input/output behavior for a sample file."""

from __future__ import annotations

import argparse
import tempfile
import traceback
import time

from paddleocr import PaddleOCRVL

from app.ocr_worker import _render_pdf_pages_to_pngs


def run_case(engine: PaddleOCRVL, name: str, payload) -> None:
    print(f"\n=== {name} ===")
    started = time.time()
    try:
        output_iter = engine.predict(payload)
        first = next(iter(output_iter))
        elapsed = time.time() - started
        print("elapsed_sec:", round(elapsed, 2))
        print("first_type:", type(first))
        has_res = hasattr(first, "res")
        print("has_res:", has_res)
        if has_res:
            res = first.res
            print("res_type:", type(res))
            if isinstance(res, dict):
                print("res_keys:", list(res.keys())[:20])
        print("preview:", str(first)[:300].replace("\n", " "))
    except Exception as exc:  # noqa: BLE001
        elapsed = time.time() - started
        print("elapsed_sec:", round(elapsed, 2))
        print("error:", exc)
        traceback.print_exc(limit=2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--case",
        choices=("all", "pdf_path_str", "pdf_path_list", "png_path_str", "png_path_list"),
        default="all",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pdf_path = "/app/uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image_p1.pdf"
    engine = PaddleOCRVL(
        pipeline_version="v1.5",
        use_doc_orientation_classify=True,
        use_doc_unwarping=False,
    )

    if args.case in {"all", "pdf_path_str"}:
        run_case(engine, "pdf_path_str", pdf_path)
    if args.case in {"all", "pdf_path_list"}:
        run_case(engine, "pdf_path_list", [pdf_path])

    if args.case in {"all", "png_path_str", "png_path_list"}:
        with tempfile.TemporaryDirectory(prefix="paddle-debug-") as tmp_dir:
            png_pages = _render_pdf_pages_to_pngs(
                file_path=pdf_path,
                output_dir=tmp_dir,
                max_pages=1,
                render_dpi=180,
            )
            if png_pages and args.case in {"all", "png_path_str"}:
                run_case(engine, "png_path_str", png_pages[0])
            if png_pages and args.case in {"all", "png_path_list"}:
                run_case(engine, "png_path_list", png_pages)


if __name__ == "__main__":
    main()
