import unittest
from types import SimpleNamespace

from app.api.budget import (
    _build_default_milestones,
    _build_generated_cover_image,
    _build_monitoring_payload,
    _parse_custom_milestones,
)


class BudgetProjectMetadataTests(unittest.TestCase):
    def _sample_project(self, **overrides):
        base = {
            "id": 7,
            "name": "라인 검사 설비 고도화",
            "project_type": "equipment",
            "customer_name": "미래정밀",
            "current_stage": "fabrication",
            "created_at": "2026-02-01T00:00:00+00:00",
            "summary_milestones_json": None,
        }
        base.update(overrides)
        return SimpleNamespace(**base)

    def test_generated_cover_image_returns_data_url(self):
        project = self._sample_project()
        value = _build_generated_cover_image(project)
        self.assertTrue(value.startswith("data:image/svg+xml;utf8,"))
        self.assertIn("%EB%9D%BC%EC%9D%B8%20%EA%B2%80%EC%82%AC", value)

    def test_default_milestones_follow_stage(self):
        project = self._sample_project(current_stage="installation")
        milestones = _build_default_milestones(project)
        self.assertEqual(len(milestones), 3)
        self.assertEqual(milestones[0]["status"], "done")
        self.assertEqual(milestones[1]["status"], "done")
        self.assertEqual(milestones[2]["status"], "active")

    def test_monitoring_payload_has_spent_and_variance(self):
        project = self._sample_project(current_stage="warranty")
        monitoring = _build_monitoring_payload(
            project,
            {
                "material_total": 500000,
                "labor_total": 300000,
                "expense_total": 200000,
                "grand_total": 1000000,
            },
        )
        self.assertEqual(monitoring["confirmed_budget_total"], 1000000)
        self.assertEqual(monitoring["confirmed_budget_material"], 500000)
        self.assertEqual(monitoring["confirmed_budget_labor"], 300000)
        self.assertEqual(monitoring["confirmed_budget_expense"], 200000)
        self.assertGreater(monitoring["actual_spent_material"], 0)
        self.assertGreater(monitoring["actual_spent_labor"], 0)
        self.assertGreater(monitoring["actual_spent_expense"], 0)
        self.assertGreater(monitoring["actual_spent_total"], 0)
        self.assertIsNotNone(monitoring["variance_material"])
        self.assertIsNotNone(monitoring["variance_labor"])
        self.assertIsNotNone(monitoring["variance_expense"])
        self.assertIsNotNone(monitoring["variance_total"])

    def test_custom_milestone_parser_normalizes_status(self):
        parsed = _parse_custom_milestones('[{"label":"설계","date":"2026-02-10","status":"DONE"}]')
        self.assertEqual(parsed[0]["status"], "done")
        self.assertEqual(parsed[0]["status_label"], "완료")

    def test_monitoring_payload_prefers_executed_amount(self):
        project = self._sample_project(current_stage="installation")
        monitoring = _build_monitoring_payload(
            project,
            {
                "material_total": 500000,
                "labor_total": 300000,
                "expense_total": 200000,
                "grand_total": 1000000,
            },
            executed_summary={
                "material_executed_total": 120000,
                "labor_executed_total": 80000,
                "expense_executed_total": 50000,
            },
        )
        self.assertEqual(monitoring["actual_spent_material"], 120000)
        self.assertEqual(monitoring["actual_spent_labor"], 80000)
        self.assertEqual(monitoring["actual_spent_expense"], 50000)
        self.assertEqual(monitoring["actual_spent_total"], 250000)


if __name__ == "__main__":
    unittest.main()
