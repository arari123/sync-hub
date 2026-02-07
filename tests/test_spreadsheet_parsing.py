import os
import tempfile
import unittest
from unittest.mock import patch

from app.core.parsing.spreadsheet import extract_spreadsheet_segments
from app.core.pipeline import generate_chunk_records

try:
    from openpyxl import Workbook
except ImportError:  # pragma: no cover
    Workbook = None


@unittest.skipIf(Workbook is None, "openpyxl is required for spreadsheet parsing tests")
class SpreadsheetParsingTests(unittest.TestCase):
    def _build_sample_workbook(self) -> str:
        workbook = Workbook()
        ws1 = workbook.active
        ws1.title = "작업보고"
        ws1.append(["고객사", "한빛정밀"])
        ws1.append(["작성자", "김서준"])
        ws1.append(["작업장소", "인천 3공장"])
        ws1.append(["작업 내용", "라인센서 보정 및 알람 로그 점검"])

        ws2 = workbook.create_sheet("점검항목")
        ws2.append(["설비", "점검항목", "결과"])
        ws2.append(["LJ-X8200", "광축 정렬", "정상"])
        ws2.append(["LJ-X8200", "노이즈 레벨", "1.1%"])

        handle = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
        handle.close()
        workbook.save(handle.name)
        workbook.close()
        return handle.name

    def test_extract_spreadsheet_segments_returns_sheet_scoped_segments(self):
        file_path = self._build_sample_workbook()
        try:
            raw_text, clean_text, segments = extract_spreadsheet_segments(file_path)
        finally:
            os.unlink(file_path)

        self.assertTrue(raw_text)
        self.assertTrue(clean_text)
        self.assertGreater(len(segments), 0)
        self.assertIn("한빛정밀", raw_text)
        self.assertTrue(any(segment.section_title == "작업보고" for segment in segments))
        self.assertTrue(any(segment.section_title == "점검항목" for segment in segments))
        self.assertTrue(any(segment.chunk_type == "table_raw" for segment in segments))
        self.assertTrue(any(segment.page == 1 for segment in segments))
        self.assertTrue(any(segment.page == 2 for segment in segments))

    def test_generate_chunk_records_skips_ocr_for_spreadsheet(self):
        file_path = self._build_sample_workbook()
        try:
            with patch("app.core.pipeline.perform_ocr", side_effect=AssertionError("OCR should not run")):
                raw_text, clean_text, chunk_records = generate_chunk_records(file_path)
        finally:
            os.unlink(file_path)

        self.assertTrue(raw_text)
        self.assertTrue(clean_text)
        self.assertGreater(len(chunk_records), 0)
        self.assertTrue(any(record.page == 1 for record in chunk_records))


if __name__ == "__main__":
    unittest.main()
