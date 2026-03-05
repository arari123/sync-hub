from __future__ import annotations

import re

import bleach
from bleach.css_sanitizer import CSSSanitizer


_DATA_IMAGE_PATTERN = re.compile(
    r"^data:image/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$",
    re.IGNORECASE,
)

_DROP_BLOCK_TAG_RE = re.compile(r"(?is)<(script|style)[^>]*>.*?</\1>")

_ALLOWED_TAGS = [
    # Basic blocks
    "p",
    "div",
    "span",
    "br",
    "hr",
    "blockquote",
    # Text styles
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "sub",
    "sup",
    # Lists
    "ul",
    "ol",
    "li",
    # Tables
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    # Rich editor legacy tags
    "font",
    # Media/links
    "img",
    "a",
]

_ALLOWED_CSS_PROPERTIES = [
    "border",
    "border-collapse",
    "border-color",
    "border-style",
    "border-width",
    "padding",
    "margin",
    "width",
    "max-width",
    "height",
    "text-align",
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "font-style",
    "text-decoration",
]

_CSS_SANITIZER = CSSSanitizer(allowed_css_properties=_ALLOWED_CSS_PROPERTIES)


def _filter_attribute(tag: str, name: str, value: str) -> bool:  # noqa: C901
    tag = (tag or "").lower()
    name = (name or "").lower()
    raw_value = value or ""
    lowered_value = raw_value.strip().lower()

    if name.startswith("on"):
        return False

    if tag == "img":
        if name in {"alt", "title", "width", "height"}:
            return True
        if name != "src":
            return False
        if lowered_value.startswith("data:"):
            # Only allow base64 raster images. Explicitly block SVG payloads.
            return bool(_DATA_IMAGE_PATTERN.match(lowered_value))
        return lowered_value.startswith(("http://", "https://")) or lowered_value.startswith("/")

    if tag == "a":
        if name in {"title", "target", "rel"}:
            return True
        if name != "href":
            return False
        if lowered_value.startswith("data:"):
            return False
        return True

    if tag == "font":
        return name in {"color", "size", "face"}

    if tag in {"th", "td"} and name in {"colspan", "rowspan"}:
        return True

    if name == "style":
        # Style values are additionally sanitized by bleach's CSS sanitizer.
        return tag in {
            "p",
            "div",
            "span",
            "ul",
            "ol",
            "li",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
        }

    if tag == "div" and name == "align":
        return lowered_value in {"left", "center", "right", "justify"}

    return False


_CLEANER = bleach.Cleaner(
    tags=_ALLOWED_TAGS,
    attributes=_filter_attribute,
    protocols=["http", "https", "mailto", "data"],
    strip=True,
    strip_comments=True,
    css_sanitizer=_CSS_SANITIZER,
)


def sanitize_rich_text_html(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    # Strip script/style blocks entirely (including their content) before allow-list cleaning.
    raw = _DROP_BLOCK_TAG_RE.sub("", raw)
    return _CLEANER.clean(raw)
