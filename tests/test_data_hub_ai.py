import time
import unittest

from app.core.data_hub_ai import (
    TTLCache,
    build_agenda_summary_prompt,
    build_answer_prompt,
    build_excerpt,
    build_rag_context,
    contexts_fingerprint,
    is_agenda_code,
)


class DataHubAiTests(unittest.TestCase):
    def test_is_agenda_code_matches_exact_format(self):
        self.assertTrue(is_agenda_code("AG-2026-000001"))
        self.assertTrue(is_agenda_code("ag-2026-000001"))
        self.assertTrue(is_agenda_code("  AG-2026-000001  "))

        self.assertFalse(is_agenda_code(""))
        self.assertFalse(is_agenda_code("AG-2026-1"))
        self.assertFalse(is_agenda_code("AG-2026-000001-extra"))
        self.assertFalse(is_agenda_code("901 알람 조치방법"))

    def test_build_agenda_summary_prompt_contains_core_fields(self):
        prompt = build_agenda_summary_prompt(
            {
                "agenda_code": "AG-2026-000123",
                "title": "서보 알람 901 조치",
                "project_code": "P-001",
                "project_name": "라인 A 개선",
                "thread_kind": "work_report",
                "record_status": "published",
                "progress_status": "completed",
                "requester_name": "고객사",
                "requester_org": "OO전자",
                "responder_name": "엔지니어",
                "responder_org": "자사",
                "created_at": "2026-02-16T00:00:00Z",
                "last_updated_at": "2026-02-16T01:00:00Z",
                "report_payload": {
                    "work_date_start": "2026-02-15",
                    "work_date_end": "2026-02-15",
                    "work_location": "현장 <b>A</b> 라인",
                    "target_equipments": ["서보드라이브", "엔코더"],
                    "report_sections": {
                        "symptom": "알람 901 발생",
                        "cause": "엔코더 케이블 접촉 불량",
                        "interim_action": "케이블 재체결",
                        "final_action": "케이블 교체",
                    },
                    "workers": [
                        {"worker_name": "홍길동", "worker_affiliation": "자사", "work_hours": 3},
                    ],
                    "parts": [
                        {"part_name": "엔코더 케이블", "manufacturer": "KEYENCE", "model_name": "X-01", "quantity": 1},
                    ],
                },
                "entries": [
                    {"entry_kind": "root", "title": "초기 등록", "content": "<b>현상</b>: 901", "created_at": "2026-02-15T10:00:00Z"},
                    {"entry_kind": "reply", "title": "추가 정보", "content": "재발 방지 확인", "created_at": "2026-02-15T11:00:00Z"},
                ],
            }
        )

        self.assertIn("AG-2026-000123", prompt)
        self.assertIn("서보 알람 901 조치", prompt)
        self.assertIn("work_report_payload", prompt)
        self.assertNotIn("<b>", prompt)  # HTML tags should be cleaned.

    def test_build_excerpt_prefers_query_hit_window(self):
        content = "AAA\n\nKEYENCE LJ-V series supports profile measurement. X-axis width is 500mm.\n\nBBB"
        excerpt = build_excerpt(content, "X-axis width 500mm", max_chars=60)
        self.assertIn("500mm", excerpt)
        self.assertTrue(len(excerpt) <= 63)  # allow ellipsis

    def test_build_rag_context_respects_limits(self):
        hits = []
        for i in range(30):
            hits.append(
                {
                    "_score": 1.0 / (i + 1),
                    "_source": {
                        "doc_id": 10,
                        "chunk_id": i,
                        "page": 1,
                        "filename": "catalog.pdf",
                        "content": f"chunk-{i} " + ("x" * 1000),
                    },
                }
            )

        contexts = build_rag_context(
            hits,
            "chunk",
            max_chunks=5,
            max_chars_per_chunk=120,
            max_total_chars=400,
        )

        self.assertLessEqual(len(contexts), 5)
        self.assertTrue(all(len(item.excerpt) <= 123 for item in contexts))
        self.assertLessEqual(sum(len(item.excerpt) for item in contexts), 400)

    def test_fingerprint_changes_when_context_changes(self):
        contexts_a = build_rag_context(
            [
                {"_score": 1.0, "_source": {"doc_id": 1, "chunk_id": 1, "page": 1, "filename": "a.pdf", "content": "hello 700W servo"}},
            ],
            "700W",
            max_chunks=1,
        )
        contexts_b = build_rag_context(
            [
                {"_score": 1.0, "_source": {"doc_id": 1, "chunk_id": 1, "page": 1, "filename": "a.pdf", "content": "hello 750W servo"}},
            ],
            "700W",
            max_chunks=1,
        )
        fp_a = contexts_fingerprint("700W", contexts_a)
        fp_b = contexts_fingerprint("700W", contexts_b)
        self.assertNotEqual(fp_a, fp_b)

    def test_prompt_contains_sources(self):
        contexts = build_rag_context(
            [
                {"_score": 1.0, "_source": {"doc_id": 2, "chunk_id": 5, "page": 3, "filename": "manual.pdf", "content": "Alarm 901: check encoder cable."}},
            ],
            "901 알람",
            max_chunks=1,
        )
        prompt = build_answer_prompt("901 알람", contexts)
        self.assertIn("doc_id=2", prompt)
        self.assertIn("manual.pdf", prompt)

    def test_ttl_cache_expires(self):
        cache = TTLCache(ttl_seconds=1, max_items=4)
        cache.set("k", {"v": 1})
        self.assertEqual(cache.get("k"), {"v": 1})
        time.sleep(1.05)
        self.assertIsNone(cache.get("k"))


if __name__ == "__main__":
    unittest.main()
