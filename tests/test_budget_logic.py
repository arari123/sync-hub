import unittest

from app.core.budget_logic import normalize_stage, stage_label, summarize_costs


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
        self.assertEqual(normalize_stage("진행"), "progress")

    def test_normalize_stage_rejects_unknown(self):
        with self.assertRaises(ValueError):
            normalize_stage("unknown")

    def test_stage_label(self):
        self.assertEqual(stage_label("review"), "검토")
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


if __name__ == "__main__":
    unittest.main()
