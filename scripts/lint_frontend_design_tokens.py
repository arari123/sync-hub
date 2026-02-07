#!/usr/bin/env python3
"""Lint frontend design-token rules for UI components and theme file."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
INDEX_CSS = REPO_ROOT / "frontend" / "src" / "index.css"
UI_DIR = REPO_ROOT / "frontend" / "src" / "components" / "ui"

HEX_COLOR_PATTERN = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")
ARBITRARY_COLOR_CLASS_PATTERN = re.compile(
    r"(?:bg|text|border|ring|from|via|to)-\[[^\]]+\]"
)
INLINE_COLOR_STYLE_PATTERN = re.compile(
    r"style\s*=\s*\{\{[^\}]*\b(?:color|background|borderColor|fill|stroke)\b",
    re.DOTALL,
)

REQUIRED_THEME_TOKENS = [
    "--color-primary",
    "--color-secondary",
    "--color-muted",
    "--color-border",
    "--color-background",
    "--color-foreground",
]

REQUIRED_ROOT_VARS = [
    "--primary:",
    "--secondary:",
    "--muted:",
    "--border:",
    "--background:",
    "--foreground:",
]


def _load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _lint_index_css(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"missing file: {path}"]

    text = _load_text(path)
    for token in REQUIRED_THEME_TOKENS:
        if token not in text:
            errors.append(f"{path}: missing theme token {token}")

    for var in REQUIRED_ROOT_VARS:
        if var not in text:
            errors.append(f"{path}: missing root variable {var}")

    return errors


def _lint_ui_file(path: Path) -> list[str]:
    errors: list[str] = []
    text = _load_text(path)

    for match in HEX_COLOR_PATTERN.finditer(text):
        errors.append(f"{path}: hardcoded hex color detected ({match.group(0)})")

    for match in ARBITRARY_COLOR_CLASS_PATTERN.finditer(text):
        cls = match.group(0)
        if "var(" in cls:
            continue
        errors.append(f"{path}: arbitrary color class detected ({cls})")

    if INLINE_COLOR_STYLE_PATTERN.search(text):
        errors.append(
            f"{path}: inline color style detected (use token-based class or CSS variable)"
        )

    return errors


def main() -> int:
    errors: list[str] = []

    errors.extend(_lint_index_css(INDEX_CSS))

    if not UI_DIR.exists():
        errors.append(f"missing directory: {UI_DIR}")
    else:
        for path in sorted(UI_DIR.glob("*.jsx")):
            errors.extend(_lint_ui_file(path))

    if errors:
        print("[design-lint] FAILED")
        for item in errors:
            print(f"- {item}")
        return 1

    print("[design-lint] PASSED")
    print(f"[design-lint] checked: {INDEX_CSS}")
    for path in sorted(UI_DIR.glob("*.jsx")):
        print(f"[design-lint] checked: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
