import unittest

from app.core.dedup.doc_embedding import best_embedding_match_for_doc, find_embedding_near_pairs
from app.core.dedup.hash import normalize_text_for_hash, normalized_text_sha256
from app.core.dedup.minhash import find_near_duplicate_pairs
from app.core.dedup.policies import DedupPolicyConfig, should_index_document


class DedupModuleTests(unittest.TestCase):
    def test_normalized_hash_equivalence_for_whitespace_variants(self):
        left = "Sync Hub Guide\n\nPAGE 1\nAPI   health check"
        right = "sync hub guide\napi health check\n1"

        self.assertEqual(normalize_text_for_hash(left), normalize_text_for_hash(right))
        self.assertEqual(normalized_text_sha256(left), normalized_text_sha256(right))

    def test_exact_duplicate_detection_via_normalized_text_hash(self):
        text_a = "Line one.\nLine two."
        text_b = "Line one.  \n\nLine two."

        self.assertEqual(normalized_text_sha256(text_a), normalized_text_sha256(text_b))

    def test_near_duplicate_pairs_detected_by_minhash(self):
        docs = {
            1: "sync hub dedup feature provides exact duplicate and near duplicate detection for documents",
            2: "sync hub dedup feature provides exact duplicate and near duplicate detection for internal docs",
            3: "this text is unrelated to indexing policy and weather information",
        }

        pairs = find_near_duplicate_pairs(
            text_by_doc=docs,
            shingle_size=2,
            num_perm=64,
            bands=8,
            threshold=0.4,
        )

        self.assertTrue(any({left, right} == {1, 2} for left, right, _ in pairs))
        self.assertFalse(any({left, right} == {1, 3} for left, right, _ in pairs))

    def test_near_duplicate_pairs_detected_by_doc_embedding(self):
        docs = {
            1: "internal policy dedup quality scoring with table and paragraph normalization",
            2: "internal policy dedup quality scoring with table paragraph normalization",
            3: "completely unrelated sports weather and finance bulletin",
        }

        pairs = find_embedding_near_pairs(
            text_by_doc=docs,
            cosine_threshold=0.5,
            dims=128,
            simhash_bands=8,
        )

        self.assertTrue(any({left, right} == {1, 2} for left, right, _ in pairs))
        self.assertFalse(any({left, right} == {1, 3} for left, right, _ in pairs))

    def test_best_embedding_match_for_doc(self):
        docs = {
            11: "sync hub admin dedup cluster management endpoint and primary document",
            22: "sync hub admin dedup cluster management endpoint and primary docs",
            33: "table extraction markdown row sentence chunk quality",
        }

        best_doc_id, score = best_embedding_match_for_doc(
            target_doc_id=11,
            text_by_doc=docs,
            cosine_threshold=0.5,
            dims=128,
            simhash_bands=8,
        )
        self.assertEqual(best_doc_id, 22)
        self.assertGreater(score, 0.5)

    def test_primary_only_policy_excludes_non_primary_near_dup(self):
        config = DedupPolicyConfig(dedup_mode="exact_and_near", index_policy="index_primary_only")

        keep, _ = should_index_document(
            {
                "id": 11,
                "dedup_status": "near_dup",
                "dedup_primary_doc_id": 10,
            },
            config,
        )
        self.assertFalse(keep)

        keep_primary, _ = should_index_document(
            {
                "id": 10,
                "dedup_status": "unique",
                "dedup_primary_doc_id": 10,
            },
            config,
        )
        self.assertTrue(keep_primary)


if __name__ == "__main__":
    unittest.main()
