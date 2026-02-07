import unittest

from app.api.budget import _project_search_score, _tokenize_search_query


class BudgetSearchTests(unittest.TestCase):
    def test_multi_token_query_requires_multiple_token_matches(self):
        payload = {
            "name": "A1 광학검사 라인 구축",
            "description": "신규 광학검사 설비 도입 검토",
            "code": "SIM-EQ-001",
            "customer_name": "한빛전자",
            "manager_name": "admin",
        }

        tokens = _tokenize_search_query("라인 프로파일 센서")
        score = _project_search_score(payload, "라인 프로파일 센서", tokens)
        self.assertEqual(score, 0.0)

    def test_multi_token_query_is_scored_when_multiple_tokens_match(self):
        payload = {
            "name": "LJ 라인 프로파일 센서 도입",
            "description": "신규 센서 도입 검토",
            "code": "SIM-EQ-010",
            "customer_name": "미래정밀",
            "manager_name": "admin",
        }

        tokens = _tokenize_search_query("라인 프로파일 센서")
        score = _project_search_score(payload, "라인 프로파일 센서", tokens)
        self.assertGreater(score, 0.0)

    def test_exact_phrase_match_is_scored(self):
        payload = {
            "name": "라인 프로파일 센서 개선",
            "description": "",
            "code": "SIM-EQ-011",
            "customer_name": "",
            "manager_name": "admin",
        }

        tokens = _tokenize_search_query("라인 프로파일 센서 개선")
        score = _project_search_score(payload, "라인 프로파일 센서 개선", tokens)
        self.assertGreater(score, 0.0)


if __name__ == "__main__":
    unittest.main()
