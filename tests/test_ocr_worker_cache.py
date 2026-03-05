import tempfile
import unittest
from pathlib import Path

import app.ocr_worker as ocr_worker


class OCRWorkerCacheTests(unittest.TestCase):
    def test_build_cache_key_skips_builder_when_cache_disabled(self):
        options = ocr_worker.OCRResolvedOptions(
            file_path=Path(__file__),
            requested_max_pages=1,
            requested_render_dpi=120,
            requested_max_tokens=512,
            requested_fast_mode=True,
            force_render_pdf=True,
            use_pypdf_preflight=False,
            should_skip_heavy_paddle_pdf=False,
        )

        original_cache_enabled = ocr_worker.OCR_CACHE_ENABLED
        original_builder = ocr_worker._build_ocr_cache_key

        def _raise_if_called(**kwargs):  # type: ignore[no-untyped-def]
            raise AssertionError("cache builder must not be called when cache is disabled")

        try:
            ocr_worker.OCR_CACHE_ENABLED = False
            ocr_worker._build_ocr_cache_key = _raise_if_called  # type: ignore[assignment]
            self.assertIsNone(ocr_worker._build_cache_key_if_enabled(options))
        finally:
            ocr_worker.OCR_CACHE_ENABLED = original_cache_enabled
            ocr_worker._build_ocr_cache_key = original_builder  # type: ignore[assignment]

    def test_glm_cache_key_changes_when_prompt_or_decoding_changes(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
            tmp.write(b"sync-hub-cache-key")
            tmp.flush()

            original_prompt = ocr_worker.GLM_OCR_PROMPT
            original_temperature = ocr_worker.GLM_OCR_TEMPERATURE
            original_top_p = ocr_worker.GLM_OCR_TOP_P
            try:
                ocr_worker.GLM_OCR_PROMPT = "prompt-a"
                ocr_worker.GLM_OCR_TEMPERATURE = 0.1
                ocr_worker.GLM_OCR_TOP_P = 0.9
                base_key = ocr_worker._build_ocr_cache_key(
                    file_path=tmp.name,
                    provider="glm",
                    requested_max_pages=2,
                    requested_render_dpi=180,
                    requested_max_tokens=1024,
                    requested_fast_mode=True,
                    force_render_pdf=True,
                    use_pypdf_preflight=False,
                )

                ocr_worker.GLM_OCR_PROMPT = "prompt-b"
                prompt_key = ocr_worker._build_ocr_cache_key(
                    file_path=tmp.name,
                    provider="glm",
                    requested_max_pages=2,
                    requested_render_dpi=180,
                    requested_max_tokens=1024,
                    requested_fast_mode=True,
                    force_render_pdf=True,
                    use_pypdf_preflight=False,
                )
                self.assertNotEqual(base_key, prompt_key)

                ocr_worker.GLM_OCR_PROMPT = "prompt-a"
                ocr_worker.GLM_OCR_TEMPERATURE = 0.7
                temperature_key = ocr_worker._build_ocr_cache_key(
                    file_path=tmp.name,
                    provider="glm",
                    requested_max_pages=2,
                    requested_render_dpi=180,
                    requested_max_tokens=1024,
                    requested_fast_mode=True,
                    force_render_pdf=True,
                    use_pypdf_preflight=False,
                )
                self.assertNotEqual(base_key, temperature_key)

                ocr_worker.GLM_OCR_TEMPERATURE = 0.1
                ocr_worker.GLM_OCR_TOP_P = 0.5
                top_p_key = ocr_worker._build_ocr_cache_key(
                    file_path=tmp.name,
                    provider="glm",
                    requested_max_pages=2,
                    requested_render_dpi=180,
                    requested_max_tokens=1024,
                    requested_fast_mode=True,
                    force_render_pdf=True,
                    use_pypdf_preflight=False,
                )
                self.assertNotEqual(base_key, top_p_key)
            finally:
                ocr_worker.GLM_OCR_PROMPT = original_prompt
                ocr_worker.GLM_OCR_TEMPERATURE = original_temperature
                ocr_worker.GLM_OCR_TOP_P = original_top_p


if __name__ == "__main__":
    unittest.main()
