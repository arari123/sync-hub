import unittest

from app.api.documents import _should_filter_low_evidence_spreadsheet_or_failure_doc


class DocumentSearchQualityTests(unittest.TestCase):
    def test_non_maintenance_query_filters_low_evidence_failure_spreadsheet(self):
        should_filter = _should_filter_low_evidence_spreadsheet_or_failure_doc(
            filename="failure_report_random_04.xlsx",
            document_types=["equipment_failure_report"],
            query_lower="라인 프로파일 센서",
            tokens=["라인", "프로파일", "센서"],
            matched_terms=["라인"],
            phrase_count=0,
        )
        self.assertTrue(should_filter)

    def test_non_maintenance_query_keeps_failure_spreadsheet_with_multiple_term_hits(self):
        should_filter = _should_filter_low_evidence_spreadsheet_or_failure_doc(
            filename="failure_report_relevant.xlsx",
            document_types=["equipment_failure_report"],
            query_lower="라인 프로파일 센서",
            tokens=["라인", "프로파일", "센서"],
            matched_terms=["라인", "센서"],
            phrase_count=0,
        )
        self.assertFalse(should_filter)

    def test_maintenance_query_keeps_failure_spreadsheet(self):
        should_filter = _should_filter_low_evidence_spreadsheet_or_failure_doc(
            filename="failure_report_random_07.xlsx",
            document_types=["equipment_failure_report"],
            query_lower="라인 센서 장애 조치 보고서",
            tokens=["라인", "센서", "장애", "조치", "보고서"],
            matched_terms=["라인"],
            phrase_count=0,
        )
        self.assertFalse(should_filter)

    def test_non_spreadsheet_non_failure_document_is_not_filtered(self):
        should_filter = _should_filter_low_evidence_spreadsheet_or_failure_doc(
            filename="catalog_lj.pdf",
            document_types=["catalog"],
            query_lower="라인 프로파일 센서",
            tokens=["라인", "프로파일", "센서"],
            matched_terms=["라인"],
            phrase_count=0,
        )
        self.assertFalse(should_filter)


if __name__ == "__main__":
    unittest.main()
