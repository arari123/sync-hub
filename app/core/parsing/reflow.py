from __future__ import annotations

from dataclasses import dataclass
import math
import os
import re
from statistics import median
from typing import Dict, Iterable, List, Sequence, Tuple

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - runtime fallback
    PdfReader = None


_WS_RE = re.compile(r"\s+")
_TABLE_TOKEN_RE = re.compile(r"\d")


@dataclass
class LayoutBlock:
    page_number: int
    text: str
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return max(0.0, self.x1 - self.x0)

    @property
    def height(self) -> float:
        return max(1.0, self.y1 - self.y0)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def x_center(self) -> float:
        return (self.x0 + self.x1) / 2.0

    @property
    def y_center(self) -> float:
        return (self.y0 + self.y1) / 2.0


@dataclass
class OrderedLine:
    page_number: int
    column_id: int
    text: str
    y_center: float
    x0: float
    x1: float
    table_like: bool = False


@dataclass
class PageReflowResult:
    page_number: int
    page_width: float
    page_height: float
    raw_lines: List[str]
    paragraph_lines: List[str]
    table_groups: List[List[str]]
    parallel_left_lines: List[str]
    parallel_right_lines: List[str]


@dataclass
class DocumentReflowResult:
    pages: List[PageReflowResult]
    raw_text: str


@dataclass
class ReflowConfig:
    line_y_tol: float = 8.0
    gutter_gap_threshold_ratio: float = 0.12
    inline_gap_ratio: float = 0.03
    min_blocks_for_two_columns: int = 8
    min_secondary_area_ratio: float = 0.18
    min_secondary_blocks: int = 4
    parallel_min_rows: int = 4
    parallel_match_ratio: float = 0.72
    parallel_max_line_chars: int = 84

    @classmethod
    def from_env(cls) -> "ReflowConfig":
        return cls(
            line_y_tol=float(os.getenv("LINE_Y_TOL", "8.0")),
            gutter_gap_threshold_ratio=float(os.getenv("GUTTER_GAP_THRESHOLD", "0.12")),
            inline_gap_ratio=float(os.getenv("INLINE_GAP_RATIO", "0.03")),
            min_blocks_for_two_columns=max(4, int(os.getenv("REFLOW_MIN_BLOCKS", "8"))),
            min_secondary_area_ratio=float(os.getenv("REFLOW_MIN_SECONDARY_AREA_RATIO", "0.18")),
            min_secondary_blocks=max(2, int(os.getenv("REFLOW_MIN_SECONDARY_BLOCKS", "4"))),
            parallel_min_rows=max(3, int(os.getenv("PARALLEL_MIN_ROWS", "4"))),
            parallel_match_ratio=float(os.getenv("PARALLEL_MATCH_RATIO", "0.72")),
            parallel_max_line_chars=max(20, int(os.getenv("PARALLEL_MAX_LINE_CHARS", "84"))),
        )


def _clean_token(text: str) -> str:
    if not text:
        return ""
    cleaned = text.replace("\xa0", " ").replace("\r", " ").replace("\n", " ")
    cleaned = _WS_RE.sub(" ", cleaned).strip()
    return cleaned


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:  # noqa: BLE001
        return default


def _estimate_text_width(text: str, font_size: float) -> float:
    alpha_count = sum(1 for ch in text if ch.isalnum())
    base = max(alpha_count, len(text) * 0.6)
    return max(font_size * 0.8, base * max(font_size * 0.45, 3.4))


def _extract_page_blocks_with_visitor(page, page_number: int, page_width: float, page_height: float) -> List[LayoutBlock]:
    blocks: List[LayoutBlock] = []

    def _visitor_text(text, cm=None, tm=None, font_dict=None, font_size=11, *args):  # noqa: ANN001
        cleaned = _clean_token(text)
        if not cleaned:
            return

        matrix = tm if isinstance(tm, (list, tuple)) and len(tm) >= 6 else cm
        if not isinstance(matrix, (list, tuple)) or len(matrix) < 6:
            x_raw = 0.0
            y_raw = page_height
        else:
            x_raw = _safe_float(matrix[4], 0.0)
            y_raw = _safe_float(matrix[5], page_height)

        font_size_value = max(6.0, _safe_float(font_size, 11.0))
        x0 = max(0.0, x_raw)
        y_top = max(0.0, min(page_height, page_height - y_raw))
        est_width = min(page_width, _estimate_text_width(cleaned, font_size_value))
        x1 = min(page_width, max(x0 + 1.0, x0 + est_width))
        y0 = max(0.0, y_top - font_size_value * 1.1)
        y1 = min(page_height, max(y_top, y0 + font_size_value * 0.9))

        blocks.append(
            LayoutBlock(
                page_number=page_number,
                text=cleaned,
                x0=x0,
                y0=y0,
                x1=x1,
                y1=y1,
            )
        )

    try:
        page.extract_text(visitor_text=_visitor_text)
    except TypeError:
        return []
    except Exception:  # noqa: BLE001
        return []

    return blocks


def _extract_page_blocks_from_plain_text(
    raw_text: str,
    page_number: int,
    page_width: float,
    page_height: float,
) -> List[LayoutBlock]:
    lines = [line.strip() for line in (raw_text or "").splitlines() if line.strip()]
    if not lines:
        return []

    blocks: List[LayoutBlock] = []
    step = max(page_height / (len(lines) + 1), 8.0)
    for idx, line in enumerate(lines, start=1):
        y0 = min(page_height - 2.0, idx * step)
        y1 = min(page_height, y0 + 9.0)
        blocks.append(
            LayoutBlock(
                page_number=page_number,
                text=line,
                x0=0.0,
                y0=y0,
                x1=page_width,
                y1=y1,
            )
        )
    return blocks


def extract_pdf_layout_blocks(file_path: str) -> tuple[List[LayoutBlock], Dict[int, tuple[float, float]]]:
    if PdfReader is None:
        return [], {}

    try:
        reader = PdfReader(file_path)
    except Exception:  # noqa: BLE001
        return [], {}

    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception:  # noqa: BLE001
            pass

    all_blocks: List[LayoutBlock] = []
    page_sizes: Dict[int, tuple[float, float]] = {}

    for page_number, page in enumerate(reader.pages, start=1):
        page_width = _safe_float(getattr(page.mediabox, "width", 1000.0), 1000.0)
        page_height = _safe_float(getattr(page.mediabox, "height", 1400.0), 1400.0)
        page_sizes[page_number] = (page_width, page_height)

        blocks = _extract_page_blocks_with_visitor(page, page_number, page_width, page_height)
        if not blocks:
            try:
                fallback_text = page.extract_text() or ""
            except Exception:  # noqa: BLE001
                fallback_text = ""
            blocks = _extract_page_blocks_from_plain_text(
                fallback_text,
                page_number,
                page_width,
                page_height,
            )

        all_blocks.extend(blocks)

    return all_blocks, page_sizes


@dataclass
class _ColumnAssignment:
    labels: Dict[int, int]
    order: List[int]


def _kmeans_1d(values: Sequence[float]) -> tuple[List[int], tuple[float, float]]:
    if not values:
        return [], (0.0, 0.0)

    low = min(values)
    high = max(values)
    if math.isclose(low, high):
        return [0 for _ in values], (low, high)

    c0 = low
    c1 = high
    labels = [0 for _ in values]

    for _ in range(24):
        for idx, value in enumerate(values):
            labels[idx] = 0 if abs(value - c0) <= abs(value - c1) else 1

        cluster0 = [value for value, label in zip(values, labels) if label == 0]
        cluster1 = [value for value, label in zip(values, labels) if label == 1]
        if not cluster0 or not cluster1:
            break

        next_c0 = sum(cluster0) / len(cluster0)
        next_c1 = sum(cluster1) / len(cluster1)
        if math.isclose(c0, next_c0, abs_tol=1e-3) and math.isclose(c1, next_c1, abs_tol=1e-3):
            c0, c1 = next_c0, next_c1
            break

        c0, c1 = next_c0, next_c1

    return labels, (c0, c1)


def _detect_columns(
    blocks: Sequence[LayoutBlock],
    page_width: float,
    config: ReflowConfig,
) -> _ColumnAssignment:
    if len(blocks) < config.min_blocks_for_two_columns:
        return _ColumnAssignment(labels={idx: 0 for idx in range(len(blocks))}, order=[0])

    centers = [block.x_center for block in blocks]
    labels, centroids = _kmeans_1d(centers)
    if not labels:
        return _ColumnAssignment(labels={idx: 0 for idx in range(len(blocks))}, order=[0])

    left_label = 0 if centroids[0] <= centroids[1] else 1
    right_label = 1 - left_label

    left_blocks = [blocks[idx] for idx, label in enumerate(labels) if label == left_label]
    right_blocks = [blocks[idx] for idx, label in enumerate(labels) if label == right_label]

    if not left_blocks or not right_blocks:
        return _ColumnAssignment(labels={idx: 0 for idx in range(len(blocks))}, order=[0])

    left_max_x = max(block.x1 for block in left_blocks)
    right_min_x = min(block.x0 for block in right_blocks)
    gutter_gap = right_min_x - left_max_x
    min_gutter = page_width * config.gutter_gap_threshold_ratio

    if gutter_gap <= min_gutter:
        return _ColumnAssignment(labels={idx: 0 for idx in range(len(blocks))}, order=[0])

    left_area = sum(block.area for block in left_blocks)
    right_area = sum(block.area for block in right_blocks)
    total_area = max(left_area + right_area, 1.0)
    secondary_area_ratio = min(left_area, right_area) / total_area
    secondary_blocks = min(len(left_blocks), len(right_blocks))

    index_labels: Dict[int, int] = {}
    for idx, label in enumerate(labels):
        index_labels[idx] = 0 if label == left_label else 1

    if (
        secondary_area_ratio < config.min_secondary_area_ratio
        and secondary_blocks <= config.min_secondary_blocks
    ):
        # Mixed layout (main + sidebar): keep separation but prioritize main area first.
        main_column = 0 if left_area >= right_area else 1
        side_column = 1 - main_column
        return _ColumnAssignment(labels=index_labels, order=[main_column, side_column])

    return _ColumnAssignment(labels=index_labels, order=[0, 1])


def _should_insert_space(prev_text: str, next_text: str) -> bool:
    if not prev_text or not next_text:
        return False

    if prev_text.endswith(("(", "[", "{", "/", "-")):
        return False
    if next_text.startswith((")", "]", "}", ",", ".", ":", ";", "?", "!", "/")):
        return False
    return True


def is_table_like_line(text: str) -> bool:
    if not text:
        return False

    body = text.strip()
    if not body:
        return False

    if "|" in body or "\t" in body:
        return True

    numeric_count = len(_TABLE_TOKEN_RE.findall(body))
    token_count = len(body.split())
    has_key_value = ":" in body or "=" in body

    if token_count >= 4 and numeric_count >= 2 and has_key_value:
        return True

    return False


def _build_lines_for_column(
    blocks: Sequence[LayoutBlock],
    page_number: int,
    column_id: int,
    page_width: float,
    config: ReflowConfig,
) -> List[OrderedLine]:
    if not blocks:
        return []

    merge_gap = max(8.0, page_width * config.inline_gap_ratio)
    sorted_blocks = sorted(blocks, key=lambda item: (item.y_center, item.x0))

    row_groups: List[List[LayoutBlock]] = []
    current_group: List[LayoutBlock] = []
    current_y = 0.0

    for block in sorted_blocks:
        if not current_group:
            current_group = [block]
            current_y = block.y_center
            continue

        if abs(block.y_center - current_y) <= config.line_y_tol:
            current_group.append(block)
            current_y = (current_y * (len(current_group) - 1) + block.y_center) / len(current_group)
            continue

        row_groups.append(current_group)
        current_group = [block]
        current_y = block.y_center

    if current_group:
        row_groups.append(current_group)

    ordered_lines: List[OrderedLine] = []

    for row in row_groups:
        row_sorted = sorted(row, key=lambda item: item.x0)
        row_has_wide_gap = False

        for idx in range(1, len(row_sorted)):
            gap = row_sorted[idx].x0 - row_sorted[idx - 1].x1
            if gap > merge_gap * 1.4:
                row_has_wide_gap = True
                break

        text_parts = [row_sorted[0].text]
        line_x0 = row_sorted[0].x0
        line_x1 = row_sorted[0].x1
        line_y = row_sorted[0].y_center

        def _flush_line() -> None:
            line_text = "".join(text_parts).strip()
            if not line_text:
                return
            ordered_lines.append(
                OrderedLine(
                    page_number=page_number,
                    column_id=column_id,
                    text=line_text,
                    y_center=line_y,
                    x0=line_x0,
                    x1=line_x1,
                    table_like=row_has_wide_gap or is_table_like_line(line_text),
                )
            )

        for block in row_sorted[1:]:
            gap = block.x0 - line_x1
            if gap <= merge_gap:
                if _should_insert_space(text_parts[-1], block.text):
                    text_parts.append(" ")
                text_parts.append(block.text)
                line_x1 = max(line_x1, block.x1)
                line_y = (line_y + block.y_center) / 2.0
                continue

            _flush_line()
            text_parts = [block.text]
            line_x0 = block.x0
            line_x1 = block.x1
            line_y = block.y_center

        _flush_line()

    ordered_lines.sort(key=lambda item: (item.y_center, item.x0))
    return ordered_lines


def _detect_parallel_columns(
    lines_by_column: Dict[int, List[OrderedLine]],
    config: ReflowConfig,
) -> tuple[List[str], List[str], Dict[int, set[int]]]:
    if len(lines_by_column) != 2:
        return [], [], {}

    left_lines = lines_by_column.get(0, [])
    right_lines = lines_by_column.get(1, [])

    if len(left_lines) < config.parallel_min_rows or len(right_lines) < config.parallel_min_rows:
        return [], [], {}

    pairs: List[tuple[int, int, float]] = []
    used_right: set[int] = set()

    for left_idx, left_line in enumerate(left_lines):
        if left_line.table_like:
            continue

        best_idx = -1
        best_delta = float("inf")
        for right_idx, right_line in enumerate(right_lines):
            if right_idx in used_right or right_line.table_like:
                continue

            delta = abs(left_line.y_center - right_line.y_center)
            if delta <= config.line_y_tol and delta < best_delta:
                best_delta = delta
                best_idx = right_idx

        if best_idx >= 0:
            used_right.add(best_idx)
            pairs.append((left_idx, best_idx, best_delta))

    if len(pairs) < config.parallel_min_rows:
        return [], [], {}

    align_ratio = len(pairs) / max(1, min(len(left_lines), len(right_lines)))
    y_deltas = [pair[2] for pair in pairs]
    median_delta = median(y_deltas) if y_deltas else float("inf")

    left_lengths = [len(left_lines[left_idx].text) for left_idx, _, _ in pairs]
    right_lengths = [len(right_lines[right_idx].text) for _, right_idx, _ in pairs]
    median_length = median(left_lengths + right_lengths) if (left_lengths or right_lengths) else 0

    if align_ratio < config.parallel_match_ratio:
        return [], [], {}
    if median_delta > config.line_y_tol * 0.65:
        return [], [], {}
    if median_length > config.parallel_max_line_chars:
        return [], [], {}

    left_parallel = [left_lines[left_idx].text for left_idx, _, _ in pairs]
    right_parallel = [right_lines[right_idx].text for _, right_idx, _ in pairs]

    consumed = {
        0: {left_idx for left_idx, _, _ in pairs},
        1: {right_idx for _, right_idx, _ in pairs},
    }
    return left_parallel, right_parallel, consumed


def _extract_table_groups(lines: Sequence[OrderedLine]) -> tuple[List[List[str]], List[str]]:
    table_groups: List[List[str]] = []
    paragraph_lines: List[str] = []

    current_table_group: List[str] = []

    def _flush_group() -> None:
        nonlocal current_table_group
        if len(current_table_group) >= 2:
            table_groups.append(current_table_group)
        else:
            paragraph_lines.extend(current_table_group)
        current_table_group = []

    for line in lines:
        if line.table_like:
            current_table_group.append(line.text)
            continue

        if current_table_group:
            _flush_group()

        paragraph_lines.append(line.text)

    if current_table_group:
        _flush_group()

    return table_groups, paragraph_lines


def reflow_page_blocks(
    page_number: int,
    page_width: float,
    page_height: float,
    blocks: Sequence[LayoutBlock],
    config: ReflowConfig | None = None,
) -> PageReflowResult:
    reflow_config = config or ReflowConfig.from_env()

    if not blocks:
        return PageReflowResult(
            page_number=page_number,
            page_width=page_width,
            page_height=page_height,
            raw_lines=[],
            paragraph_lines=[],
            table_groups=[],
            parallel_left_lines=[],
            parallel_right_lines=[],
        )

    assignment = _detect_columns(blocks, page_width=page_width, config=reflow_config)

    lines_by_column: Dict[int, List[OrderedLine]] = {}
    for column_id in assignment.order:
        column_blocks = [
            block
            for idx, block in enumerate(blocks)
            if assignment.labels.get(idx, 0) == column_id
        ]
        lines_by_column[column_id] = _build_lines_for_column(
            column_blocks,
            page_number=page_number,
            column_id=column_id,
            page_width=page_width,
            config=reflow_config,
        )

    left_parallel, right_parallel, consumed = _detect_parallel_columns(lines_by_column, reflow_config)

    ordered_lines: List[OrderedLine] = []
    for column_id in assignment.order:
        column_lines = lines_by_column.get(column_id, [])
        consumed_indices = consumed.get(column_id, set())
        for idx, line in enumerate(column_lines):
            if idx in consumed_indices:
                continue
            ordered_lines.append(line)

    column_rank = {column_id: rank for rank, column_id in enumerate(assignment.order)}
    ordered_lines.sort(
        key=lambda item: (
            column_rank.get(item.column_id, 0),
            item.y_center,
            item.x0,
        )
    )
    table_groups, paragraph_lines = _extract_table_groups(ordered_lines)

    raw_lines = [line.text for line in ordered_lines]
    raw_lines.extend(left_parallel)
    raw_lines.extend(right_parallel)

    return PageReflowResult(
        page_number=page_number,
        page_width=page_width,
        page_height=page_height,
        raw_lines=raw_lines,
        paragraph_lines=paragraph_lines,
        table_groups=table_groups,
        parallel_left_lines=left_parallel,
        parallel_right_lines=right_parallel,
    )


def _group_blocks_by_page(blocks: Iterable[LayoutBlock]) -> Dict[int, List[LayoutBlock]]:
    grouped: Dict[int, List[LayoutBlock]] = {}
    for block in blocks:
        grouped.setdefault(block.page_number, []).append(block)
    return grouped


def reflow_pdf(file_path: str, config: ReflowConfig | None = None) -> DocumentReflowResult:
    blocks, page_sizes = extract_pdf_layout_blocks(file_path)
    page_blocks = _group_blocks_by_page(blocks)

    results: List[PageReflowResult] = []
    for page_number in sorted(page_sizes.keys()):
        width, height = page_sizes[page_number]
        result = reflow_page_blocks(
            page_number=page_number,
            page_width=width,
            page_height=height,
            blocks=page_blocks.get(page_number, []),
            config=config,
        )
        results.append(result)

    raw_text_parts = ["\n".join(page.raw_lines).strip() for page in results if page.raw_lines]
    raw_text = "\n\n".join(part for part in raw_text_parts if part)
    return DocumentReflowResult(pages=results, raw_text=raw_text)
