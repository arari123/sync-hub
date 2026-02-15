import time
import unittest

from app.core.data_hub_ai import (
    TTLCache,
    build_answer_prompt,
    build_excerpt,
    build_rag_context,
    contexts_fingerprint,
)


class DataHubAiTests(unittest.TestCase):
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

