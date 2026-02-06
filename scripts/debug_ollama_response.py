#!/usr/bin/env python3
"""Print raw Ollama OCR response for a PDF file."""

from __future__ import annotations

import argparse
import json
from urllib import request

from app import ocr_worker as worker


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Debug raw response from Ollama OCR request.")
    parser.add_argument("file_path", help="PDF path visible from OCR worker container")
    parser.add_argument(
        "--prompt",
        default="",
        help="Override prompt text for this debug request",
    )
    parser.add_argument(
        "--mode",
        choices=("chat", "generate"),
        default=worker.OLLAMA_MODE,
        help="Ollama request mode",
    )
    parser.add_argument(
        "--endpoint",
        default=worker.OLLAMA_ENDPOINT,
        help="Override Ollama endpoint URL",
    )
    parser.add_argument(
        "--model",
        default=worker.OLLAMA_MODEL,
        help="Override Ollama model",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    images = worker._render_pdf_pages_for_ollama(args.file_path)
    prompt = args.prompt or worker.OLLAMA_PROMPT

    if args.mode == "generate":
        payload = {
            "model": args.model,
            "stream": False,
            "prompt": prompt,
            "images": images,
        }
    else:
        payload = {
            "model": args.model,
            "stream": False,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                    "images": images,
                }
            ],
        }
    payload_raw = json.dumps(payload).encode("utf-8")

    req = request.Request(
        args.endpoint,
        data=payload_raw,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=worker.OLLAMA_TIMEOUT_SECONDS) as response:
        body = response.read().decode("utf-8", errors="replace")
    print(body)


if __name__ == "__main__":
    main()
