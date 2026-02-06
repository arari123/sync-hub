#!/usr/bin/env python3
"""Compare two extracted text outputs and print similarity metrics."""

from __future__ import annotations

import argparse
import difflib
import json
import re
import unicodedata
from pathlib import Path


TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare two text outputs.")
    parser.add_argument("left", help="Left input file (.txt or .json)")
    parser.add_argument("right", help="Right input file (.txt or .json)")
    parser.add_argument(
        "--json-field",
        default="content_text",
        help="Text field name when input file is JSON (default: content_text)",
    )
    parser.add_argument(
        "--preview-lines",
        type=int,
        default=8,
        help="How many unified-diff lines to print (default: 8)",
    )
    return parser.parse_args()


def load_text(path: Path, json_field: str) -> str:
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        value = payload.get(json_field, "")
        return value if isinstance(value, str) else ""
    return path.read_text(encoding="utf-8")


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall((text or "").lower())


def jaccard_similarity(left_tokens: list[str], right_tokens: list[str]) -> float:
    left_set = set(left_tokens)
    right_set = set(right_tokens)
    if not left_set and not right_set:
        return 1.0
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def main() -> None:
    args = parse_args()
    left_path = Path(args.left)
    right_path = Path(args.right)

    left_raw = load_text(left_path, args.json_field)
    right_raw = load_text(right_path, args.json_field)

    left = normalize_text(left_raw)
    right = normalize_text(right_raw)

    left_tokens = tokenize(left)
    right_tokens = tokenize(right)
    left_unique = set(left_tokens)
    right_unique = set(right_tokens)
    overlap_unique = left_unique & right_unique

    sequence_ratio = difflib.SequenceMatcher(None, left, right).ratio()
    jaccard = jaccard_similarity(left_tokens, right_tokens)
    coverage = (
        (len(overlap_unique) / len(left_unique)) if left_unique else (1.0 if not right_unique else 0.0)
    )

    print("=== Text Compare Summary ===")
    print(f"left_chars={len(left)} right_chars={len(right)}")
    print(f"left_lines={left.count(chr(10)) + 1 if left else 0} right_lines={right.count(chr(10)) + 1 if right else 0}")
    print(f"left_tokens={len(left_tokens)} right_tokens={len(right_tokens)}")
    print(f"left_unique_tokens={len(left_unique)} right_unique_tokens={len(right_unique)}")
    print(f"sequence_ratio={sequence_ratio:.4f}")
    print(f"jaccard_similarity={jaccard:.4f}")
    print(f"left_token_coverage_by_right={coverage:.4f}")

    print("\n=== Left Preview ===")
    print(left[:300] if left else "(empty)")

    print("\n=== Right Preview ===")
    print(right[:300] if right else "(empty)")

    left_lines = left.splitlines()
    right_lines = right.splitlines()
    diff_lines = list(
        difflib.unified_diff(
            left_lines,
            right_lines,
            fromfile=str(left_path),
            tofile=str(right_path),
            lineterm="",
        )
    )
    if diff_lines:
        print("\n=== Unified Diff (partial) ===")
        for line in diff_lines[: max(0, args.preview_lines)]:
            print(line)


if __name__ == "__main__":
    main()
