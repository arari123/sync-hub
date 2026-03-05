#!/usr/bin/env python3
"""Generate an HTML report comparing text/image PDF outputs and OCR output."""

from __future__ import annotations

import argparse
import difflib
import html
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pypdfium2 import PdfDocument


TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣]+")


@dataclass
class TextPayload:
    label: str
    source: str
    text: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build an OCR comparison report with PDF previews."
    )
    parser.add_argument("--text-pdf", required=True, help="Text PDF path")
    parser.add_argument("--image-pdf", required=True, help="Image PDF path")
    parser.add_argument("--text-doc-json", required=True, help="Document JSON for text PDF")
    parser.add_argument("--image-doc-json", required=True, help="Document JSON for image PDF")
    parser.add_argument("--ocr-json", required=True, help="Raw OCR JSON output path")
    parser.add_argument("--output-html", required=True, help="Output report HTML path")
    parser.add_argument(
        "--assets-dir",
        default="reports/assets",
        help="Directory to store rendered image assets",
    )
    parser.add_argument(
        "--render-scale",
        type=float,
        default=1.6,
        help="Render scale for PDF preview images",
    )
    parser.add_argument(
        "--diff-lines",
        type=int,
        default=40,
        help="Max unified diff lines to include",
    )
    return parser.parse_args()


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKC", text or "")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall((text or "").lower())


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_document_payload(path: Path, label: str) -> TextPayload:
    payload = load_json(path)
    text = payload.get("content_text", "")
    if not isinstance(text, str):
        text = ""
    return TextPayload(
        label=label,
        source=str(path),
        text=normalize_text(text),
    )


def read_ocr_payload(path: Path) -> TextPayload:
    payload = load_json(path)
    text = payload.get("text", "")
    if not isinstance(text, str):
        text = ""
    return TextPayload(
        label="Direct OCR Output",
        source=str(path),
        text=normalize_text(text),
    )


def jaccard_similarity(left_tokens: list[str], right_tokens: list[str]) -> float:
    left_set = set(left_tokens)
    right_set = set(right_tokens)
    if not left_set and not right_set:
        return 1.0
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def pair_metrics(left: str, right: str) -> dict[str, float]:
    left_tokens = tokenize(left)
    right_tokens = tokenize(right)
    left_unique = set(left_tokens)
    right_unique = set(right_tokens)
    overlap = left_unique & right_unique
    coverage = (len(overlap) / len(left_unique)) if left_unique else (1.0 if not right_unique else 0.0)

    return {
        "left_chars": float(len(left)),
        "right_chars": float(len(right)),
        "left_tokens": float(len(left_tokens)),
        "right_tokens": float(len(right_tokens)),
        "sequence_ratio": difflib.SequenceMatcher(None, left, right).ratio(),
        "jaccard_similarity": jaccard_similarity(left_tokens, right_tokens),
        "left_token_coverage_by_right": coverage,
    }


def unified_diff(left: str, right: str, from_name: str, to_name: str, max_lines: int) -> str:
    lines = list(
        difflib.unified_diff(
            left.splitlines(),
            right.splitlines(),
            fromfile=from_name,
            tofile=to_name,
            lineterm="",
        )
    )
    return "\n".join(lines[:max_lines]) if lines else "(no diff)"


def render_pdf_first_page(pdf_path: Path, output_png_path: Path, scale: float) -> None:
    doc = PdfDocument(str(pdf_path))
    if len(doc) == 0:
        raise ValueError(f"No pages found in PDF: {pdf_path}")

    page = doc[0]
    bitmap = page.render(scale=scale)
    image = bitmap.to_pil().convert("RGB")

    output_png_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_png_path, "PNG")

    image.close()
    if hasattr(bitmap, "close"):
        bitmap.close()
    if hasattr(page, "close"):
        page.close()
    if hasattr(doc, "close"):
        doc.close()


def metric_row_html(name: str, metrics: dict[str, float]) -> str:
    return (
        "<tr>"
        f"<td>{html.escape(name)}</td>"
        f"<td>{metrics['sequence_ratio']:.4f}</td>"
        f"<td>{metrics['jaccard_similarity']:.4f}</td>"
        f"<td>{metrics['left_token_coverage_by_right']:.4f}</td>"
        f"<td>{int(metrics['left_chars'])}/{int(metrics['right_chars'])}</td>"
        f"<td>{int(metrics['left_tokens'])}/{int(metrics['right_tokens'])}</td>"
        "</tr>"
    )


def text_card_html(payload: TextPayload) -> str:
    preview = payload.text if payload.text else "(empty)"
    return (
        "<section class='card'>"
        f"<h3>{html.escape(payload.label)}</h3>"
        f"<p class='source'>{html.escape(payload.source)}</p>"
        f"<pre>{html.escape(preview)}</pre>"
        "</section>"
    )


def build_html(
    text_payload: TextPayload,
    image_payload: TextPayload,
    ocr_payload: TextPayload,
    text_preview_img: str,
    image_preview_img: str,
    output_html: Path,
    diff_lines: int,
) -> str:
    text_vs_image = pair_metrics(text_payload.text, image_payload.text)
    text_vs_ocr = pair_metrics(text_payload.text, ocr_payload.text)
    image_vs_ocr = pair_metrics(image_payload.text, ocr_payload.text)

    diff_text_vs_image = unified_diff(
        text_payload.text,
        image_payload.text,
        text_payload.label,
        image_payload.label,
        diff_lines,
    )
    diff_text_vs_ocr = unified_diff(
        text_payload.text,
        ocr_payload.text,
        text_payload.label,
        ocr_payload.label,
        diff_lines,
    )

    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rel_text_img = Path(text_preview_img).as_posix()
    rel_image_img = Path(image_preview_img).as_posix()

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OCR Comparison Report</title>
  <style>
    :root {{
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #1f2a44;
      --muted: #5e6b86;
      --line: #d6deeb;
      --accent: #0f6a8b;
      --code-bg: #111827;
      --code-text: #d1fae5;
    }}
    body {{
      margin: 0;
      font-family: "IBM Plex Sans KR", "Noto Sans KR", sans-serif;
      background: radial-gradient(circle at top, #e8effa 0%, var(--bg) 48%, #f8fbff 100%);
      color: var(--text);
      padding: 28px;
    }}
    h1, h2, h3 {{ margin: 0 0 10px; }}
    .meta {{ color: var(--muted); margin-bottom: 16px; }}
    .card {{
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(15, 34, 64, 0.08);
    }}
    .grid-2 {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }}
    .grid-3 {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }}
    img {{
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: #fff;
    }}
    .caption {{ color: var(--muted); font-size: 13px; margin-top: 8px; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 18px;
    }}
    th, td {{
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      font-size: 14px;
    }}
    th {{
      background: #eff4fb;
      color: #12365d;
      font-weight: 700;
    }}
    tr:last-child td {{ border-bottom: 0; }}
    .source {{ color: var(--muted); font-size: 12px; margin: 0 0 10px; }}
    pre {{
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      background: #fbfdff;
      border: 1px solid #e2e8f5;
      border-radius: 10px;
      padding: 12px;
      max-height: 420px;
      overflow: auto;
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 13px;
      line-height: 1.5;
    }}
    .diff pre {{
      background: var(--code-bg);
      color: var(--code-text);
      border-color: #2f3b52;
      max-height: 360px;
    }}
    .section-title {{
      color: var(--accent);
      margin: 22px 0 10px;
      font-size: 20px;
    }}
  </style>
</head>
<body>
  <h1>OCR Comparison Report</h1>
  <p class="meta">Generated: {generated_at} | Output: {html.escape(str(output_html))}</p>

  <h2 class="section-title">PDF Preview (Page 1)</h2>
  <div class="grid-2">
    <section class="card">
      <h3>Text PDF</h3>
      <img src="{html.escape(rel_text_img)}" alt="Text PDF preview" />
      <p class="caption">{html.escape(rel_text_img)}</p>
    </section>
    <section class="card">
      <h3>Image PDF</h3>
      <img src="{html.escape(rel_image_img)}" alt="Image PDF preview" />
      <p class="caption">{html.escape(rel_image_img)}</p>
    </section>
  </div>

  <h2 class="section-title">Similarity Metrics</h2>
  <table>
    <thead>
      <tr>
        <th>Pair</th>
        <th>Sequence Ratio</th>
        <th>Jaccard</th>
        <th>Token Coverage</th>
        <th>Chars (L/R)</th>
        <th>Tokens (L/R)</th>
      </tr>
    </thead>
    <tbody>
      {metric_row_html("Text PDF vs Image PDF", text_vs_image)}
      {metric_row_html("Text PDF vs OCR", text_vs_ocr)}
      {metric_row_html("Image PDF vs OCR", image_vs_ocr)}
    </tbody>
  </table>

  <h2 class="section-title">Extracted Text</h2>
  <div class="grid-3">
    {text_card_html(text_payload)}
    {text_card_html(image_payload)}
    {text_card_html(ocr_payload)}
  </div>

  <h2 class="section-title">Diff: Text PDF vs Image PDF</h2>
  <section class="card diff">
    <pre>{html.escape(diff_text_vs_image)}</pre>
  </section>

  <h2 class="section-title">Diff: Text PDF vs OCR</h2>
  <section class="card diff">
    <pre>{html.escape(diff_text_vs_ocr)}</pre>
  </section>
</body>
</html>
"""


def main() -> None:
    args = parse_args()

    output_html = Path(args.output_html).resolve()
    assets_dir = Path(args.assets_dir).resolve()
    output_html.parent.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    text_pdf = Path(args.text_pdf).resolve()
    image_pdf = Path(args.image_pdf).resolve()

    if not text_pdf.exists():
        raise SystemExit(f"Text PDF not found: {text_pdf}")
    if not image_pdf.exists():
        raise SystemExit(f"Image PDF not found: {image_pdf}")

    text_payload = read_document_payload(Path(args.text_doc_json).resolve(), "Text PDF Result")
    image_payload = read_document_payload(Path(args.image_doc_json).resolve(), "Image PDF Result")
    ocr_payload = read_ocr_payload(Path(args.ocr_json).resolve())

    text_png = assets_dir / "text_pdf_page1.png"
    image_png = assets_dir / "image_pdf_page1.png"
    render_pdf_first_page(text_pdf, text_png, args.render_scale)
    render_pdf_first_page(image_pdf, image_png, args.render_scale)

    rel_text_png = text_png.relative_to(output_html.parent)
    rel_image_png = image_png.relative_to(output_html.parent)

    content = build_html(
        text_payload=text_payload,
        image_payload=image_payload,
        ocr_payload=ocr_payload,
        text_preview_img=str(rel_text_png),
        image_preview_img=str(rel_image_png),
        output_html=output_html,
        diff_lines=args.diff_lines,
    )
    output_html.write_text(content, encoding="utf-8")

    print(f"report: {output_html}")
    print(f"text_preview: {text_png}")
    print(f"image_preview: {image_png}")


if __name__ == "__main__":
    main()
