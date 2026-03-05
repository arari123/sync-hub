import unittest

from app.core.html_sanitizer import sanitize_rich_text_html


class HtmlSanitizerTests(unittest.TestCase):
    def test_strips_script_blocks_and_event_handlers(self):
        raw = (
            '<p onclick="alert(1)">Hello</p>'
            "<script>alert('xss')</script>"
            '<img src="https://example.com/a.png" onerror="alert(2)" />'
        )
        cleaned = sanitize_rich_text_html(raw)

        lowered = cleaned.lower()
        self.assertIn("hello", lowered)
        self.assertNotIn("<script", lowered)
        self.assertNotIn("onclick", lowered)
        self.assertNotIn("onerror", lowered)
        self.assertNotIn("alert('xss')", lowered)

    def test_allows_table_with_basic_styles(self):
        raw = (
            '<table style="width:100%;border-collapse:collapse;margin:12px 0;">'
            "<tbody>"
            "<tr>"
            '<td style="border:1px solid #cbd5e1;padding:6px;background-color:#f8fafc;">A</td>'
            "</tr>"
            "</tbody>"
            "</table>"
        )
        cleaned = sanitize_rich_text_html(raw)

        self.assertIn("<table", cleaned)
        self.assertIn("<td", cleaned)
        self.assertIn("border-collapse", cleaned)
        self.assertIn("background-color", cleaned)

    def test_allows_font_size_color_and_bold(self):
        raw = '<p><font size="5" color="#ff0000"><b>Bold</b></font></p>'
        cleaned = sanitize_rich_text_html(raw)

        lowered = cleaned.lower()
        self.assertIn("<font", lowered)
        self.assertIn('size="5"', lowered)
        self.assertIn('color="#ff0000"', lowered)
        self.assertIn("<b>", lowered)

    def test_allows_data_image_png_blocks_svg(self):
        data_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA=="
        data_svg = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+"
        raw = f'<p><img src="{data_png}" alt="ok" /><img src="{data_svg}" alt="bad" /></p>'
        cleaned = sanitize_rich_text_html(raw)

        lowered = cleaned.lower()
        self.assertIn("data:image/png;base64", lowered)
        self.assertNotIn("image/svg+xml", lowered)


if __name__ == "__main__":
    unittest.main()

