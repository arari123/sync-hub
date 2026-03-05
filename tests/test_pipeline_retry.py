import unittest

from app.core.pipeline import (
    _is_non_retryable_error,
    _prepare_plain_lines,
    _simple_table_groups_from_lines,
)


class PipelineRetryPolicyTests(unittest.TestCase):
    def test_non_retryable_extractable_error(self):
        exc = ValueError("No extractable text found after parser and OCR fallback.")
        self.assertTrue(_is_non_retryable_error(exc))

    def test_non_retryable_chunk_error(self):
        exc = ValueError("No indexable chunks created from document text.")
        self.assertTrue(_is_non_retryable_error(exc))

    def test_retryable_runtime_error(self):
        exc = RuntimeError("temporary database disconnection")
        self.assertFalse(_is_non_retryable_error(exc))

    def test_prepare_plain_lines_splits_dense_ocr_table_line(self):
        dense_line = (
            "MODEL_A 1.0mm RANGE_A 2.0mm SPEED_A 3.0m/s "
            "MODEL_B 1.1mm RANGE_B 2.1mm SPEED_B 3.1m/s"
        )
        lines = _prepare_plain_lines(dense_line)
        self.assertGreaterEqual(len(lines), 2)

    def test_simple_table_groups_detects_ocr_table_like_lines(self):
        lines = [
            "LJ-X8000 +1.290mm +2.000mm REW",
            "LJ-X8200 +0.500mm +0.700mm OK",
            "이 문장은 일반 본문입니다.",
        ]
        groups, paragraphs = _simple_table_groups_from_lines(lines)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]), 2)
        self.assertIn("이 문장은 일반 본문입니다.", paragraphs)


if __name__ == "__main__":
    unittest.main()
