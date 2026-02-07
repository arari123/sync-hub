import unittest

from app.api.budget import _normalize_project_sort, _sort_project_payloads


class BudgetProjectSortTests(unittest.TestCase):
    def test_normalize_project_sort_accepts_alias(self):
        self.assertEqual(_normalize_project_sort("updated"), "updated_desc")
        self.assertEqual(_normalize_project_sort("updated_at_asc"), "updated_asc")

    def test_normalize_project_sort_rejects_unknown_value(self):
        with self.assertRaises(ValueError):
            _normalize_project_sort("score_desc")

    def test_sort_projects_by_updated_desc(self):
        rows = [
            {"id": 1, "name": "B", "updated_at": "2026-02-01T00:00:00+00:00"},
            {"id": 2, "name": "A", "updated_at": "2026-02-03T00:00:00+00:00"},
            {"id": 3, "name": "C", "updated_at": "2026-02-02T00:00:00+00:00"},
        ]
        sorted_rows = _sort_project_payloads(rows, "updated_desc")
        self.assertEqual([row["id"] for row in sorted_rows], [2, 3, 1])

    def test_sort_projects_by_name_asc(self):
        rows = [
            {"id": 1, "name": "Zeta", "updated_at": "2026-02-01T00:00:00+00:00"},
            {"id": 2, "name": "alpha", "updated_at": "2026-02-03T00:00:00+00:00"},
            {"id": 3, "name": "Beta", "updated_at": "2026-02-02T00:00:00+00:00"},
        ]
        sorted_rows = _sort_project_payloads(rows, "name_asc")
        self.assertEqual([row["id"] for row in sorted_rows], [2, 3, 1])


if __name__ == "__main__":
    unittest.main()
