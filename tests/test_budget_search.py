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

    def test_installation_site_query_is_scored(self):
        payload = {
            "name": "2차 조립라인 구축",
            "description": "설치 일정 수립",
            "code": "SIM-EQ-020",
            "customer_name": "한빛정밀",
            "manager_name": "admin",
            "installation_site": "울산 북구 공장",
            "equipment_names": ["검사기A"],
        }

        tokens = _tokenize_search_query("울산 북구")
        score = _project_search_score(payload, "울산 북구", tokens)
        self.assertGreater(score, 0.0)

    def test_equipment_name_query_is_scored(self):
        payload = {
            "name": "검사라인 개선",
            "description": "",
            "code": "SIM-EQ-021",
            "customer_name": "미래테크",
            "manager_name": "admin",
            "installation_site": "대전",
            "equipment_names": ["레이저 마킹기", "비전 검사기"],
        }

        tokens = _tokenize_search_query("비전 검사기")
        score = _project_search_score(payload, "비전 검사기", tokens)
        self.assertGreater(score, 0.0)

    def test_manager_label_query_is_scored(self):
        payload = {
            "name": "프로젝트A",
            "description": "",
            "code": "SIM-EQ-999",
            "customer_name": "",
            "manager_name": "이용호",
        }

        tokens = _tokenize_search_query("담당자 이용호")
        self.assertIn("이용호", tokens)
        self.assertNotIn("담당자", tokens)

        score = _project_search_score(payload, "담당자 이용호", tokens)
        self.assertGreater(score, 0.0)


if __name__ == "__main__":
    unittest.main()
