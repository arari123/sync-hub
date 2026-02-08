import unittest

from app.core.budget_logic import (
    aggregate_equipment_costs_from_detail,
    normalize_stage,
    parse_detail_payload,
    summarize_executed_costs_from_detail,
    stage_label,
    summarize_costs,
)


class _Item:
    def __init__(
        self,
        material_fab_cost=0.0,
        material_install_cost=0.0,
        labor_fab_cost=0.0,
        labor_install_cost=0.0,
        expense_fab_cost=0.0,
        expense_install_cost=0.0,
    ):
        self.material_fab_cost = material_fab_cost
        self.material_install_cost = material_install_cost
        self.labor_fab_cost = labor_fab_cost
        self.labor_install_cost = labor_install_cost
        self.expense_fab_cost = expense_fab_cost
        self.expense_install_cost = expense_install_cost


class BudgetLogicTests(unittest.TestCase):
    def test_normalize_stage_supports_korean_and_code(self):
        self.assertEqual(normalize_stage("review"), "review")
        self.assertEqual(normalize_stage("검토"), "review")
        self.assertEqual(normalize_stage("진행"), "fabrication")
        self.assertEqual(normalize_stage("progress"), "fabrication")
        self.assertEqual(normalize_stage("제작"), "fabrication")
        self.assertEqual(normalize_stage("installation"), "installation")
        self.assertEqual(normalize_stage("설치"), "installation")
        self.assertEqual(normalize_stage("warranty"), "warranty")
        self.assertEqual(normalize_stage("워런티"), "warranty")

    def test_normalize_stage_rejects_unknown(self):
        with self.assertRaises(ValueError):
            normalize_stage("unknown")

    def test_stage_label(self):
        self.assertEqual(stage_label("review"), "검토")
        self.assertEqual(stage_label("fabrication"), "제작")
        self.assertEqual(stage_label("progress"), "제작")
        self.assertEqual(stage_label("installation"), "설치")
        self.assertEqual(stage_label("warranty"), "워런티")
        self.assertEqual(stage_label("closure"), "종료")
        self.assertEqual(stage_label("custom"), "custom")

    def test_summarize_costs(self):
        items = [
            _Item(100, 40, 20, 10, 5, 2),
            _Item(50, 20, 10, 5, 2, 1),
        ]
        totals = summarize_costs(items)
        self.assertEqual(totals["material_total"], 210)
        self.assertEqual(totals["labor_total"], 45)
        self.assertEqual(totals["expense_total"], 10)
        self.assertEqual(totals["fab_total"], 187)
        self.assertEqual(totals["install_total"], 78)
        self.assertEqual(totals["grand_total"], 265)

    def test_parse_detail_payload_handles_invalid_json(self):
        parsed = parse_detail_payload("not-json")
        self.assertEqual(parsed["material_items"], [])
        self.assertEqual(parsed["labor_items"], [])
        self.assertEqual(parsed["expense_items"], [])
        self.assertEqual(parsed["execution_material_items"], [])
        self.assertEqual(parsed["execution_labor_items"], [])
        self.assertEqual(parsed["execution_expense_items"], [])
        self.assertIn("budget_settings", parsed)
        self.assertEqual(parsed["budget_settings"]["installation_locale"], "domestic")

    def test_aggregate_equipment_costs_from_detail(self):
        payload = {
            "material_items": [
                {
                    "equipment_name": "검사기A",
                    "quantity": 2,
                    "unit_price": 15000,
                    "phase": "fabrication",
                },
                {
                    "equipment_name": "검사기A",
                    "quantity": 1,
                    "unit_price": 5000,
                    "phase": "installation",
                },
            ],
            "labor_items": [
                {
                    "equipment_name": "검사기A",
                    "quantity": 2,
                    "headcount": 2,
                    "location_type": "domestic",
                    "hourly_rate": 30000,
                    "unit": "D",
                    "phase": "installation",
                },
            ],
            "expense_items": [
                {
                    "equipment_name": "검사기A",
                    "amount": 120000,
                    "phase": "fabrication",
                },
            ],
        }
        results = aggregate_equipment_costs_from_detail(payload)
        self.assertEqual(len(results), 1)
        item = results[0]
        self.assertEqual(item["equipment_name"], "검사기A")
        self.assertEqual(item["material_fab_cost"], 30000)
        self.assertEqual(item["material_install_cost"], 5000)
        self.assertEqual(item["labor_install_cost"], 960000)
        self.assertEqual(item["expense_fab_cost"], 120000)

    def test_aggregate_equipment_costs_supports_overseas_week_month_units(self):
        payload = {
            "budget_settings": {
                "installation_locale": "overseas",
            },
            "labor_items": [
                {
                    "equipment_name": "검사기B",
                    "quantity": 1,
                    "headcount": 1,
                    "location_type": "overseas",
                    "hourly_rate": 10000,
                    "unit": "W",
                    "phase": "installation",
                },
                {
                    "equipment_name": "검사기B",
                    "quantity": 1,
                    "headcount": 1,
                    "location_type": "overseas",
                    "hourly_rate": 10000,
                    "unit": "M",
                    "phase": "installation",
                },
            ],
        }
        results = aggregate_equipment_costs_from_detail(payload)
        self.assertEqual(len(results), 1)
        item = results[0]
        # W=7D=56H, M=30D=240H
        self.assertEqual(item["labor_install_cost"], 2960000)

    def test_summarize_executed_costs_from_detail(self):
        payload = {
            "material_items": [
                {"executed_amount": 1500, "phase": "fabrication"},
                {"executed_amount": 2500, "phase": "installation"},
            ],
            "labor_items": [
                {"executed_amount": 3000, "phase": "fabrication"},
            ],
            "expense_items": [
                {"executed_amount": 1200, "phase": "installation"},
            ],
        }
        summary = summarize_executed_costs_from_detail(payload)
        self.assertEqual(summary["material_executed_total"], 4000)
        self.assertEqual(summary["labor_executed_total"], 3000)
        self.assertEqual(summary["expense_executed_total"], 1200)
        self.assertEqual(summary["fab_executed_total"], 4500)
        self.assertEqual(summary["install_executed_total"], 3700)
        self.assertEqual(summary["grand_executed_total"], 8200)

    def test_summarize_executed_costs_prefers_execution_rows(self):
        payload = {
            "material_items": [{"executed_amount": 9999, "phase": "fabrication"}],
            "labor_items": [{"executed_amount": 9999, "phase": "fabrication"}],
            "expense_items": [{"executed_amount": 9999, "phase": "fabrication"}],
            "execution_material_items": [{"executed_amount": 1000, "phase": "fabrication"}],
            "execution_labor_items": [{"executed_amount": 2000, "phase": "installation"}],
            "execution_expense_items": [{"executed_amount": 3000, "phase": "fabrication"}],
        }
        summary = summarize_executed_costs_from_detail(payload)
        self.assertEqual(summary["material_executed_total"], 1000)
        self.assertEqual(summary["labor_executed_total"], 2000)
        self.assertEqual(summary["expense_executed_total"], 3000)
        self.assertEqual(summary["grand_executed_total"], 6000)


if __name__ == "__main__":
    unittest.main()
