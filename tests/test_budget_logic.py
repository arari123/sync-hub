import unittest

from app.core.budget_logic import (
    aggregate_equipment_costs_from_detail,
    normalize_stage,
    parse_detail_payload,
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
        self.assertEqual(item["labor_install_cost"], 480000)
        self.assertEqual(item["expense_fab_cost"], 120000)


if __name__ == "__main__":
    unittest.main()
