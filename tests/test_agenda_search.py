import unittest

from app.api.agenda import _agenda_match_score_tuple, _tokenize_agenda_search_query


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


if __name__ == '__main__':
    unittest.main()
