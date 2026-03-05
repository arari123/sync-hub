import unittest

from app.api.agenda import (
    _agenda_match_score_tuple,
    _agenda_search_score_and_explain,
    _tokenize_agenda_search_query,
)


class AgendaSearchTests(unittest.TestCase):
    def test_tokenizer_supports_space_and_comma(self):
        tokens = _tokenize_agenda_search_query('라인, 센서 설치')
        self.assertIn('라인', tokens)
        self.assertIn('센서', tokens)
        self.assertIn('설치', tokens)

    def test_score_prefers_in_order_match(self):
        query = '라인 센서'
        tokens = _tokenize_agenda_search_query(query)

        ordered = _agenda_match_score_tuple('라인 프로파일 센서 교체', query, tokens)
        unordered = _agenda_match_score_tuple('센서 라인 점검', query, tokens)

        self.assertGreater(ordered[0], unordered[0])
        self.assertEqual(ordered[1], 1)
        self.assertEqual(unordered[1], 1)

    def test_score_returns_zero_when_not_matched(self):
        query = '긴급 장애'
        tokens = _tokenize_agenda_search_query(query)
        score = _agenda_match_score_tuple('정기 점검 보고서', query, tokens)
        self.assertEqual(score, (0, 0, 0, 0))

    def test_global_search_score_returns_positive_when_title_matches(self):
        query = '긴급 장애'
        tokens = _tokenize_agenda_search_query(query)

        score, explain = _agenda_search_score_and_explain(
            thread_payload={
                "title": "긴급 장애 조치 보고",
                "root_title": "긴급 장애 조치 보고",
                "latest_title": "긴급 장애 조치 보고",
                "agenda_code": "AG-2026-000001",
                "summary_plain": "",
            },
            root_entry=None,
            latest_entry=None,
            project_name="로컬 데모 001",
            project_code="PJT-001",
            query=query,
            tokens=tokens,
        )

        self.assertGreater(score, 0.0)
        self.assertIn("title", explain.get("match_fields", []))

    def test_global_search_score_requires_multiple_tokens_when_no_phrase_match(self):
        query = '라인 센서 교체'
        tokens = _tokenize_agenda_search_query(query)

        score, explain = _agenda_search_score_and_explain(
            thread_payload={
                "title": "라인 점검 보고",
                "root_title": "라인 점검 보고",
                "latest_title": "라인 점검 보고",
                "agenda_code": "AG-2026-000002",
                "summary_plain": "",
            },
            root_entry=None,
            latest_entry=None,
            project_name="",
            project_code="",
            query=query,
            tokens=tokens,
        )

        self.assertEqual(score, 0.0)
        self.assertEqual(explain, {})

    def test_global_search_score_supports_author_label_query(self):
        query = '작성자 이용호'
        tokens = _tokenize_agenda_search_query(query)

        score, explain = _agenda_search_score_and_explain(
            thread_payload={
                "title": "점검 요청",
                "root_title": "점검 요청",
                "latest_title": "점검 요청",
                "agenda_code": "AG-2026-000003",
                "summary_plain": "",
                "author_name": "이용호",
            },
            root_entry=None,
            latest_entry=None,
            project_name="",
            project_code="",
            query=query,
            tokens=tokens,
        )

        self.assertIn('이용호', tokens)
        self.assertNotIn('작성자', [token.lower() for token in tokens])
        self.assertGreater(score, 0.0)
        self.assertIn("author", explain.get("match_fields", []))


if __name__ == '__main__':
    unittest.main()
