import unittest

from app.api.budget import _EXECUTION_ONLY_STAGES


class BudgetStagePolicyTests(unittest.TestCase):
    def test_execution_only_stages_include_design_and_progress_stages(self):
        self.assertIn("design", _EXECUTION_ONLY_STAGES)
        self.assertIn("fabrication", _EXECUTION_ONLY_STAGES)
        self.assertIn("installation", _EXECUTION_ONLY_STAGES)
        self.assertIn("warranty", _EXECUTION_ONLY_STAGES)

    def test_review_stage_is_not_execution_only(self):
        self.assertNotIn("review", _EXECUTION_ONLY_STAGES)


if __name__ == "__main__":
    unittest.main()
