import io
import os
import tempfile
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

import app.api.budget as budget_api


class BudgetCoverUploadTests(unittest.TestCase):
    def test_resolve_project_cover_extension_prefers_mime_type(self):
        self.assertEqual(
            budget_api._resolve_project_cover_extension("image/webp", "cover.jpg"),
            ".webp",
        )

    def test_resolve_project_cover_extension_falls_back_to_filename(self):
        self.assertEqual(
            budget_api._resolve_project_cover_extension("", "cover.jpeg"),
            ".jpeg",
        )

    def test_safe_project_cover_filename(self):
        self.assertTrue(budget_api._is_safe_project_cover_filename("9f9ea38148b64d7aa723b69e22e7f5c7.png"))
        self.assertFalse(budget_api._is_safe_project_cover_filename("../escape.png"))

    def test_normalize_project_cover_input_url_from_absolute_localhost_url(self):
        normalized = budget_api._normalize_project_cover_input_url(
            "http://localhost:8001/budget/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png?ts=1"
        )
        self.assertEqual(normalized, "/budget/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png")

    def test_normalize_project_cover_input_url_from_uploads_path(self):
        normalized = budget_api._normalize_project_cover_input_url(
            "/uploads/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png"
        )
        self.assertEqual(normalized, "/budget/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png")

    def test_normalize_project_cover_input_url_from_absolute_uploads_url(self):
        normalized = budget_api._normalize_project_cover_input_url(
            "https://example.com/uploads/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png?download=1"
        )
        self.assertEqual(normalized, "/budget/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png")

    def test_normalize_project_cover_input_url_rejects_local_file_path(self):
        normalized = budget_api._normalize_project_cover_input_url("/home/user/Desktop/cover.png")
        self.assertEqual(normalized, "")

    def test_resolve_project_cover_urls_falls_back_when_file_missing(self):
        original_dir = budget_api._PROJECT_COVER_UPLOAD_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                budget_api._PROJECT_COVER_UPLOAD_DIR = temp_dir
                project = SimpleNamespace(
                    id=1,
                    name="테스트 프로젝트",
                    project_type="equipment",
                    customer_name="고객사",
                    current_stage="fabrication",
                    created_at="2026-02-19T00:00:00+00:00",
                    cover_image_url="/budget/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png",
                )
                custom_url, fallback_url, display_url = budget_api._resolve_project_cover_urls(project)
                self.assertEqual(custom_url, "/budget/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png")
                self.assertTrue(fallback_url.startswith("data:image/svg+xml;utf8,"))
                self.assertEqual(display_url, fallback_url)
        finally:
            budget_api._PROJECT_COVER_UPLOAD_DIR = original_dir

    def test_resolve_project_cover_urls_keeps_uploaded_cover_when_file_exists(self):
        original_dir = budget_api._PROJECT_COVER_UPLOAD_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                budget_api._PROJECT_COVER_UPLOAD_DIR = temp_dir
                filename = "9f9ea38148b64d7aa723b69e22e7f5c7.png"
                with open(os.path.join(temp_dir, filename), "wb") as handle:
                    handle.write(b"png")
                project = SimpleNamespace(
                    id=1,
                    name="테스트 프로젝트",
                    project_type="equipment",
                    customer_name="고객사",
                    current_stage="fabrication",
                    created_at="2026-02-19T00:00:00+00:00",
                    cover_image_url=f"/budget/project-covers/{filename}",
                )
                custom_url, _fallback_url, display_url = budget_api._resolve_project_cover_urls(project)
                self.assertEqual(custom_url, f"/budget/project-covers/{filename}")
                self.assertEqual(display_url, custom_url)
        finally:
            budget_api._PROJECT_COVER_UPLOAD_DIR = original_dir

    def test_store_project_cover_image_success(self):
        original_dir = budget_api._PROJECT_COVER_UPLOAD_DIR
        original_max_bytes = budget_api._PROJECT_COVER_MAX_BYTES
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                budget_api._PROJECT_COVER_UPLOAD_DIR = temp_dir
                budget_api._PROJECT_COVER_MAX_BYTES = 1024
                upload = UploadFile(
                    file=io.BytesIO(b"abc"),
                    filename="cover.png",
                    headers=Headers({"content-type": "image/png"}),
                )
                stored_filename, copied_size = budget_api._store_project_cover_image(upload)
                stored_path = os.path.join(temp_dir, stored_filename)

                self.assertTrue(os.path.isfile(stored_path))
                self.assertEqual(copied_size, 3)
                self.assertTrue(budget_api._is_safe_project_cover_filename(stored_filename))
        finally:
            budget_api._PROJECT_COVER_UPLOAD_DIR = original_dir
            budget_api._PROJECT_COVER_MAX_BYTES = original_max_bytes

    def test_store_project_cover_image_rejects_oversized_payload(self):
        original_dir = budget_api._PROJECT_COVER_UPLOAD_DIR
        original_max_bytes = budget_api._PROJECT_COVER_MAX_BYTES
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                budget_api._PROJECT_COVER_UPLOAD_DIR = temp_dir
                budget_api._PROJECT_COVER_MAX_BYTES = 4
                upload = UploadFile(
                    file=io.BytesIO(b"12345"),
                    filename="cover.png",
                    headers=Headers({"content-type": "image/png"}),
                )
                with self.assertRaises(HTTPException) as ctx:
                    budget_api._store_project_cover_image(upload)
                self.assertEqual(ctx.exception.status_code, 413)
        finally:
            budget_api._PROJECT_COVER_UPLOAD_DIR = original_dir
            budget_api._PROJECT_COVER_MAX_BYTES = original_max_bytes

    def test_budget_project_create_accepts_cover_image_url(self):
        payload = budget_api.BudgetProjectCreate(
            name="테스트",
            cover_image_url="/budget/project-covers/9f9ea38148b64d7aa723b69e22e7f5c7.png",
        )
        self.assertTrue(payload.cover_image_url.endswith(".png"))


if __name__ == "__main__":
    unittest.main()
