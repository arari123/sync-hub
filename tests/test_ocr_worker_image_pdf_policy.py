import tempfile
import unittest

import app.ocr_worker as ocr_worker


class OCRWorkerImagePdfPolicyTests(unittest.TestCase):
    def test_is_image_pdf_detects_image_heavy_low_text_pdf(self):
        class _FakePage:
            def __init__(self, text: str, has_image: bool):
                self._text = text
                self._has_image = has_image

            def extract_text(self):  # type: ignore[no-untyped-def]
                return self._text

            def get(self, key, default=None):  # type: ignore[no-untyped-def]
                if key != "/Resources":
                    return default
                if not self._has_image:
                    return {}
                return {
                    "/XObject": {
                        "im1": {"/Subtype": "/Image"},
                    }
                }

        class _FakeReader:
            def __init__(self, pages):  # type: ignore[no-untyped-def]
                self.pages = pages
                self.is_encrypted = False

        original_reader = ocr_worker.PdfReader
        original_sample_pages = ocr_worker.OCR_IMAGE_PDF_SAMPLE_PAGES
        original_max_text_chars = ocr_worker.OCR_IMAGE_PDF_MAX_TEXT_CHARS
        original_ratio = ocr_worker.OCR_IMAGE_PDF_MIN_IMAGE_PAGE_RATIO
        try:
            ocr_worker.PdfReader = lambda _path: _FakeReader(  # type: ignore[assignment]
                [_FakePage("", True), _FakePage("short", True), _FakePage("", False)]
            )
            ocr_worker.OCR_IMAGE_PDF_SAMPLE_PAGES = 3
            ocr_worker.OCR_IMAGE_PDF_MAX_TEXT_CHARS = 20
            ocr_worker.OCR_IMAGE_PDF_MIN_IMAGE_PAGE_RATIO = 0.66

            self.assertTrue(ocr_worker._is_image_pdf("dummy.pdf"))
        finally:
            ocr_worker.PdfReader = original_reader  # type: ignore[assignment]
            ocr_worker.OCR_IMAGE_PDF_SAMPLE_PAGES = original_sample_pages
            ocr_worker.OCR_IMAGE_PDF_MAX_TEXT_CHARS = original_max_text_chars
            ocr_worker.OCR_IMAGE_PDF_MIN_IMAGE_PAGE_RATIO = original_ratio

    def test_resolve_options_disables_preflight_for_detected_image_pdf(self):
        original_detector = ocr_worker._is_image_pdf
        original_provider = ocr_worker.OCR_PROVIDER
        original_toggle = ocr_worker.OCR_DISABLE_PREFLIGHT_FOR_IMAGE_PDF
        try:
            ocr_worker._is_image_pdf = lambda _path: True  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = "paddle"
            ocr_worker.OCR_DISABLE_PREFLIGHT_FOR_IMAGE_PDF = True

            with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
                tmp.write(b"%PDF-1.4\n")
                tmp.flush()

                options = ocr_worker._resolve_ocr_options(
                    ocr_worker.OCRRequest(file_path=tmp.name, pypdf_preflight=True)
                )
                self.assertFalse(options.use_pypdf_preflight)
        finally:
            ocr_worker._is_image_pdf = original_detector  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = original_provider
            ocr_worker.OCR_DISABLE_PREFLIGHT_FOR_IMAGE_PDF = original_toggle

    def test_resolve_options_respects_preflight_when_auto_detection_disabled(self):
        original_detector = ocr_worker._is_image_pdf
        original_provider = ocr_worker.OCR_PROVIDER
        original_toggle = ocr_worker.OCR_DISABLE_PREFLIGHT_FOR_IMAGE_PDF
        try:
            ocr_worker._is_image_pdf = lambda _path: True  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = "paddle"
            ocr_worker.OCR_DISABLE_PREFLIGHT_FOR_IMAGE_PDF = False

            with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
                tmp.write(b"%PDF-1.4\n")
                tmp.flush()

                options = ocr_worker._resolve_ocr_options(
                    ocr_worker.OCRRequest(file_path=tmp.name, pypdf_preflight=True)
                )
                self.assertTrue(options.use_pypdf_preflight)
        finally:
            ocr_worker._is_image_pdf = original_detector  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = original_provider
            ocr_worker.OCR_DISABLE_PREFLIGHT_FOR_IMAGE_PDF = original_toggle

    def test_resolve_options_applies_speed_tuning_for_detected_image_pdf(self):
        original_detector = ocr_worker._is_image_pdf
        original_provider = ocr_worker.OCR_PROVIDER
        original_tuning_toggle = ocr_worker.OCR_TUNE_IMAGE_PDF_SPEED
        original_tuned_dpi = ocr_worker.OCR_IMAGE_PDF_TUNED_RENDER_DPI
        original_tuned_fast_mode = ocr_worker.OCR_IMAGE_PDF_TUNED_FAST_MODE
        original_force_render_pdf = ocr_worker.OCR_IMAGE_PDF_FORCE_RENDER_PDF
        try:
            ocr_worker._is_image_pdf = lambda _path: True  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = "paddle"
            ocr_worker.OCR_TUNE_IMAGE_PDF_SPEED = True
            ocr_worker.OCR_IMAGE_PDF_TUNED_RENDER_DPI = 144
            ocr_worker.OCR_IMAGE_PDF_TUNED_FAST_MODE = True
            ocr_worker.OCR_IMAGE_PDF_FORCE_RENDER_PDF = True

            with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
                tmp.write(b"%PDF-1.4\n")
                tmp.flush()

                options = ocr_worker._resolve_ocr_options(
                    ocr_worker.OCRRequest(
                        file_path=tmp.name,
                        render_dpi=220,
                        fast_mode=False,
                        force_render_pdf=False,
                    )
                )
                self.assertEqual(options.requested_render_dpi, 144)
                self.assertTrue(options.requested_fast_mode)
                self.assertTrue(options.force_render_pdf)
        finally:
            ocr_worker._is_image_pdf = original_detector  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = original_provider
            ocr_worker.OCR_TUNE_IMAGE_PDF_SPEED = original_tuning_toggle
            ocr_worker.OCR_IMAGE_PDF_TUNED_RENDER_DPI = original_tuned_dpi
            ocr_worker.OCR_IMAGE_PDF_TUNED_FAST_MODE = original_tuned_fast_mode
            ocr_worker.OCR_IMAGE_PDF_FORCE_RENDER_PDF = original_force_render_pdf

    def test_resolve_options_skips_speed_tuning_when_disabled(self):
        original_detector = ocr_worker._is_image_pdf
        original_provider = ocr_worker.OCR_PROVIDER
        original_tuning_toggle = ocr_worker.OCR_TUNE_IMAGE_PDF_SPEED
        try:
            ocr_worker._is_image_pdf = lambda _path: True  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = "paddle"
            ocr_worker.OCR_TUNE_IMAGE_PDF_SPEED = False

            with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
                tmp.write(b"%PDF-1.4\n")
                tmp.flush()

                options = ocr_worker._resolve_ocr_options(
                    ocr_worker.OCRRequest(
                        file_path=tmp.name,
                        render_dpi=220,
                        fast_mode=False,
                        force_render_pdf=False,
                    )
                )
                self.assertEqual(options.requested_render_dpi, 220)
                self.assertFalse(options.requested_fast_mode)
                self.assertFalse(options.force_render_pdf)
        finally:
            ocr_worker._is_image_pdf = original_detector  # type: ignore[assignment]
            ocr_worker.OCR_PROVIDER = original_provider
            ocr_worker.OCR_TUNE_IMAGE_PDF_SPEED = original_tuning_toggle


if __name__ == "__main__":
    unittest.main()
