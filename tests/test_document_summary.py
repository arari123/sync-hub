import json
import unittest
from unittest.mock import patch

from app.core import document_summary


class _DummyHttpResponse:
    def __init__(self, payload: str):
        self._payload = payload.encode("utf-8")

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class DocumentSummaryTests(unittest.TestCase):
    def test_extractive_summary_uses_whole_document_body(self):
        original_use_local_llm = document_summary.DOC_SUMMARY_USE_LOCAL_LLM
        text = (
            "반도체 공정 관리 보고서\n"
            "본 문서는 공정별 측정 기준과 허용 편차를 정리한다. "
            "라인별 샘플링 규칙과 이상치 대응 절차를 포함한다. "
            "최종적으로 검사 자동화 적용 범위를 제안한다."
        )

        try:
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = False
            title, summary = document_summary.build_document_summary(
                filename="report.pdf",
                content_text=text,
            )
        finally:
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = original_use_local_llm

        self.assertIn("반도체 공정 관리 보고서", title)
        self.assertIn("본 문서는 공정별 측정 기준과 허용 편차를 정리한다.", summary)
        self.assertLessEqual(len(summary), document_summary.DOC_SUMMARY_SHORT_MAX_CHARS)

    def test_summary_disabled_returns_filename_title_only(self):
        original_enabled = document_summary.DOC_SUMMARY_ENABLED
        try:
            document_summary.DOC_SUMMARY_ENABLED = False
            title, summary = document_summary.build_document_summary(
                filename="AS_161723_SAMPLE.pdf",
                content_text="임의 텍스트",
            )
            self.assertIn("AS 161723 SAMPLE", title)
            self.assertEqual(summary, "")
        finally:
            document_summary.DOC_SUMMARY_ENABLED = original_enabled

    def test_local_llm_summary_is_used_when_available(self):
        original_enabled = document_summary.DOC_SUMMARY_ENABLED
        original_use_local_llm = document_summary.DOC_SUMMARY_USE_LOCAL_LLM
        original_url = document_summary.DOC_SUMMARY_OLLAMA_URL
        original_model = document_summary.DOC_SUMMARY_OLLAMA_MODEL
        try:
            document_summary.DOC_SUMMARY_ENABLED = True
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = True
            document_summary.DOC_SUMMARY_OLLAMA_URL = "http://localhost:11434/api/generate"
            document_summary.DOC_SUMMARY_OLLAMA_MODEL = "llama3.1"

            envelope = {
                "response": json.dumps(
                    {
                        "title": "LLM 제목",
                        "summary": "LLM이 생성한 문서 전체 요약 문장으로 주요 내용을 설명합니다.",
                    }
                )
            }
            with patch("urllib.request.urlopen", return_value=_DummyHttpResponse(json.dumps(envelope))):
                title, summary = document_summary.build_document_summary(
                    filename="any.pdf",
                    content_text="긴 본문 텍스트",
                )

            self.assertEqual(title, "LLM 제목")
            self.assertEqual(summary, "LLM이 생성한 문서 전체 요약 문장으로 주요 내용을 설명합니다.")
        finally:
            document_summary.DOC_SUMMARY_ENABLED = original_enabled
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = original_use_local_llm
            document_summary.DOC_SUMMARY_OLLAMA_URL = original_url
            document_summary.DOC_SUMMARY_OLLAMA_MODEL = original_model

    def test_catalog_document_prefers_llm_style_but_not_hardcoded_template(self):
        original_enabled = document_summary.DOC_SUMMARY_ENABLED
        original_use_local_llm = document_summary.DOC_SUMMARY_USE_LOCAL_LLM
        original_url = document_summary.DOC_SUMMARY_OLLAMA_URL
        original_model = document_summary.DOC_SUMMARY_OLLAMA_MODEL
        try:
            document_summary.DOC_SUMMARY_ENABLED = True
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = True
            document_summary.DOC_SUMMARY_OLLAMA_URL = "http://localhost:11434/api/generate"
            document_summary.DOC_SUMMARY_OLLAMA_MODEL = "llama3.1"

            envelope = {
                "response": json.dumps(
                    {
                        "title": "KEYENCE LJ-X8000 라인 프로파일 센서 제품 카탈로그",
                        "summary": "3D 검사 용도의 라인 프로파일 센서 제품군을 소개하는 카탈로그 문서입니다.",
                    }
                )
            }
            with patch("urllib.request.urlopen", return_value=_DummyHttpResponse(json.dumps(envelope))):
                title, summary = document_summary.build_document_summary(
                    filename="AS_161723_LJ-X8000_sample.pdf",
                    content_text="KEYENCE LJ-X8000 시리즈 카탈로그, 3D 검사 라인 프로파일 센서 소개",
                )

            self.assertEqual(title, "KEYENCE LJ-X8000 라인 프로파일 센서 제품 카탈로그")
            self.assertIn("카탈로그", summary)
            self.assertIn("3D", summary)
        finally:
            document_summary.DOC_SUMMARY_ENABLED = original_enabled
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = original_use_local_llm
            document_summary.DOC_SUMMARY_OLLAMA_URL = original_url
            document_summary.DOC_SUMMARY_OLLAMA_MODEL = original_model

    def test_local_llm_retries_until_quality_passes(self):
        original_enabled = document_summary.DOC_SUMMARY_ENABLED
        original_use_local_llm = document_summary.DOC_SUMMARY_USE_LOCAL_LLM
        original_url = document_summary.DOC_SUMMARY_OLLAMA_URL
        original_model = document_summary.DOC_SUMMARY_OLLAMA_MODEL
        original_retries = document_summary.DOC_SUMMARY_LLM_MAX_RETRIES
        try:
            document_summary.DOC_SUMMARY_ENABLED = True
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = True
            document_summary.DOC_SUMMARY_OLLAMA_URL = "http://localhost:11434/api/generate"
            document_summary.DOC_SUMMARY_OLLAMA_MODEL = "llama3.1"
            document_summary.DOC_SUMMARY_LLM_MAX_RETRIES = 2

            bad = {"response": json.dumps({"title": "요약", "summary": "짧음"})}
            good = {
                "response": json.dumps(
                    {
                        "title": "KEYENCE LJ 시리즈 센서 카탈로그",
                        "summary": "3D 검사 라인 프로파일 센서 제품군을 소개하는 카탈로그 문서입니다.",
                    }
                )
            }

            with patch(
                "urllib.request.urlopen",
                side_effect=[
                    _DummyHttpResponse(json.dumps(bad)),
                    _DummyHttpResponse(json.dumps(good)),
                ],
            ):
                title, summary = document_summary.build_document_summary(
                    filename="sample.pdf",
                    content_text="KEYENCE LJ-X8000 series catalog for 3D line profile sensor inspection",
                )

            self.assertIn("KEYENCE", title)
            self.assertIn("카탈로그", summary)
        finally:
            document_summary.DOC_SUMMARY_ENABLED = original_enabled
            document_summary.DOC_SUMMARY_USE_LOCAL_LLM = original_use_local_llm
            document_summary.DOC_SUMMARY_OLLAMA_URL = original_url
            document_summary.DOC_SUMMARY_OLLAMA_MODEL = original_model
            document_summary.DOC_SUMMARY_LLM_MAX_RETRIES = original_retries

    def test_keyence_catalog_quality_requires_brand_and_series_mentions(self):
        source = "KEYENCE LJ-X8000 series catalog for 3D line profile sensor inspection"
        self.assertFalse(
            document_summary._is_high_quality_llm_summary(
                "산업용 라인 프로파일 센서 제품 카탈로그",
                "3D 검사용 라인 프로파일 센서 제품군의 특징과 적용 용도를 소개하는 문서입니다.",
                source,
            )
        )
        self.assertTrue(
            document_summary._is_high_quality_llm_summary(
                "KEYENCE LJ 시리즈 라인 프로파일 센서 카탈로그",
                "KEYENCE사의 LJ 시리즈를 중심으로 3D 검사 용도의 라인 프로파일 센서 제품군을 소개하는 문서입니다.",
                source,
            )
        )
