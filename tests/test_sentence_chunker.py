import unittest

from app.core.chunking.chunker import SourceSegment, build_chunks, table_group_to_structured_text
from app.core.chunking.sentence_splitter import split_sentences
from app.core.parsing.reflow import LayoutBlock, ReflowConfig, reflow_page_blocks


class SentenceChunkerTests(unittest.TestCase):
    def test_sentence_splitter_handles_decimal_and_abbreviation(self):
        text = "Dr. Smith scored 3.14 points. This is next! 한국어 문장입니다. 또 다음 문장입니다."
        sentences = split_sentences(text)

        self.assertEqual(len(sentences), 4)
        self.assertEqual(sentences[0], "Dr. Smith scored 3.14 points.")
        self.assertEqual(sentences[1], "This is next!")

    def test_sentence_aware_chunking_with_overlap(self):
        segments = [
            SourceSegment(
                page=1,
                chunk_type="paragraph",
                text="Sentence one. Sentence two. Sentence three. Sentence four.",
            )
        ]

        chunks = build_chunks(
            segments=segments,
            embedding_model_name="test-model",
            embedding_model_version="1",
            max_chars=28,
            overlap_sentences=1,
            min_chunk_chars=5,
            noise_threshold=0.0,
            chunk_schema_version="test-v2",
        )

        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0].content, "Sentence one. Sentence two.")
        self.assertEqual(chunks[1].content, "Sentence two. Sentence three.")
        self.assertEqual(chunks[2].content, "Sentence three. Sentence four.")

    def test_chunk_dedup_removes_identical_paragraph_chunks(self):
        segments = [
            SourceSegment(page=1, chunk_type="paragraph", text="Alpha sentence. Beta sentence."),
            SourceSegment(page=2, chunk_type="paragraph", text="Alpha sentence. Beta sentence."),
            SourceSegment(page=3, chunk_type="paragraph", text="Alpha sentence. Beta sentence."),
        ]

        chunks = build_chunks(
            segments=segments,
            embedding_model_name="test-model",
            embedding_model_version="1",
            max_chars=100,
            overlap_sentences=0,
            min_chunk_chars=5,
            noise_threshold=0.0,
            chunk_schema_version="test-v2",
            dedup_identical_chunks=True,
            dedup_identical_chunks_min_chars=10,
        )

        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0].content, "Alpha sentence. Beta sentence.")
        self.assertEqual(chunks[0].chunk_index, 0)

    def test_chunk_dedup_min_chars_preserves_short_duplicates(self):
        segments = [
            SourceSegment(page=1, chunk_type="table_row_sentence", text="A=1"),
            SourceSegment(page=2, chunk_type="table_row_sentence", text="A=1"),
        ]

        chunks = build_chunks(
            segments=segments,
            embedding_model_name="test-model",
            embedding_model_version="1",
            max_chars=100,
            overlap_sentences=0,
            min_chunk_chars=1,
            noise_threshold=0.0,
            chunk_schema_version="test-v2",
            dedup_identical_chunks=True,
            dedup_identical_chunks_min_chars=10,
        )

        self.assertEqual(len(chunks), 2)

    def test_max_chunks_cap_applies_even_sampling(self):
        segments = [
            SourceSegment(
                page=1,
                chunk_type="paragraph",
                text=" ".join(f"Sentence {idx}." for idx in range(1, 41)),
            )
        ]

        chunks = build_chunks(
            segments=segments,
            embedding_model_name="test-model",
            embedding_model_version="1",
            max_chars=20,
            overlap_sentences=0,
            min_chunk_chars=1,
            noise_threshold=0.0,
            chunk_schema_version="test-v2",
            dedup_identical_chunks=False,
            max_chunks_per_doc=5,
        )

        self.assertEqual(len(chunks), 5)
        self.assertEqual(chunks[0].chunk_index, 0)
        self.assertEqual(chunks[-1].chunk_index, 4)

    def test_reflow_does_not_merge_parallel_columns_on_same_row(self):
        blocks = [
            LayoutBlock(1, "I like CHATGPT", 40, 100, 200, 114),
            LayoutBlock(1, "left second line", 40, 130, 220, 144),
            LayoutBlock(1, "left third line", 40, 160, 220, 174),
            LayoutBlock(1, "left fourth line", 40, 190, 220, 204),
            LayoutBlock(1, "I use AI daily", 620, 101, 780, 115),
            LayoutBlock(1, "right second line", 620, 131, 790, 145),
            LayoutBlock(1, "right third line", 620, 161, 790, 175),
            LayoutBlock(1, "right fourth line", 620, 191, 790, 205),
        ]

        config = ReflowConfig(
            line_y_tol=6.0,
            gutter_gap_threshold_ratio=0.1,
            inline_gap_ratio=0.03,
            min_blocks_for_two_columns=2,
            parallel_min_rows=6,
        )

        result = reflow_page_blocks(
            page_number=1,
            page_width=1000,
            page_height=1400,
            blocks=blocks,
            config=config,
        )

        merged_text = "\n".join(result.paragraph_lines)
        self.assertNotIn("I like CHATGPT I use AI daily", merged_text)
        self.assertEqual(result.paragraph_lines[0], "I like CHATGPT")
        self.assertEqual(result.paragraph_lines[4], "I use AI daily")

    def test_table_group_conversion(self):
        table_raw, row_sentences = table_group_to_structured_text(
            [
                "Name | Value",
                "Latency | 20ms",
                "Throughput | 100",
            ]
        )

        self.assertIn("| Name | Value |", table_raw)
        self.assertIn("Name: Latency / Value: 20ms", row_sentences)

    def test_table_group_conversion_splits_numeric_ocr_rows(self):
        table_raw, row_sentences = table_group_to_structured_text(
            [
                "LJ-X8000 +1.290mm +2.000mm REW",
                "LJ-X8200 +0.500mm +0.700mm OK",
            ]
        )

        self.assertIn("| LJ-X8000 | +1.290mm | +2.000mm | REW |", table_raw)
        self.assertTrue(any("+1.290mm: +0.500mm" in sentence for sentence in row_sentences))
        self.assertTrue(any("+2.000mm: +0.700mm" in sentence for sentence in row_sentences))

    def test_table_row_sentence_chunks_are_merged(self):
        segments = [
            SourceSegment(
                page=1,
                chunk_type="table_row_sentence",
                text=f"col_1: row_{idx} / col_2: {idx}",
                raw_text="table_a",
            )
            for idx in range(1, 8)
        ]

        chunks = build_chunks(
            segments=segments,
            embedding_model_name="test-model",
            embedding_model_version="1",
            max_chars=900,
            overlap_sentences=0,
            min_chunk_chars=1,
            noise_threshold=0.0,
            chunk_schema_version="test-v2",
            dedup_identical_chunks=False,
            table_row_sentence_merge_size=3,
            table_row_sentence_max_per_table=100,
        )

        self.assertEqual(len(chunks), 3)
        self.assertIn("row_1", chunks[0].content)
        self.assertIn("row_3", chunks[0].content)
        self.assertIn("\n", chunks[0].content)

    def test_table_row_sentence_chunks_are_capped_per_table(self):
        segments = [
            SourceSegment(
                page=1,
                chunk_type="table_row_sentence",
                text=f"col_1: row_{idx}",
                raw_text="table_b",
            )
            for idx in range(1, 11)
        ]

        chunks = build_chunks(
            segments=segments,
            embedding_model_name="test-model",
            embedding_model_version="1",
            max_chars=900,
            overlap_sentences=0,
            min_chunk_chars=1,
            noise_threshold=0.0,
            chunk_schema_version="test-v2",
            dedup_identical_chunks=False,
            table_row_sentence_merge_size=1,
            table_row_sentence_max_per_table=4,
        )

        self.assertEqual(len(chunks), 4)
        all_text = "\n".join(chunk.content for chunk in chunks)
        self.assertIn("row_1", all_text)
        self.assertIn("row_2", all_text)
        self.assertIn("row_9", all_text)
        self.assertIn("row_10", all_text)


if __name__ == "__main__":
    unittest.main()
