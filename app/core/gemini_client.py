from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


@dataclass(frozen=True)
class GeminiGenerateResult:
    text: str
    usage: dict[str, Any]


class GeminiClient:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
    ):
        self.api_key = (api_key or "").strip()
        self.model = (model or "").strip()
        self.base_url = (base_url or DEFAULT_GEMINI_BASE_URL).strip().rstrip("/")
        self.timeout_seconds = float(timeout_seconds or float(os.getenv("GEMINI_TIMEOUT_SECONDS", "20")))

        if not self.api_key:
            raise ValueError("Gemini API key is required")
        if not self.model:
            raise ValueError("Gemini model is required")

    def _build_url(self) -> str:
        encoded_key = urllib.parse.quote(self.api_key, safe="")
        model_name = self.model
        if not model_name.startswith("models/"):
            model_name = f"models/{model_name}"
        return f"{self.base_url}/{model_name}:generateContent?key={encoded_key}"

    def generate(
        self,
        *,
        prompt: str,
        max_output_tokens: int = 600,
        temperature: float = 0.2,
        top_p: float = 0.95,
    ) -> GeminiGenerateResult:
        url = self._build_url()
        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": str(prompt or "")}],
                }
            ],
            "generationConfig": {
                "temperature": float(temperature),
                "topP": float(top_p),
                "maxOutputTokens": int(max(1, min(max_output_tokens, 2048))),
            },
        }

        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url=url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                detail = ""
            raise RuntimeError(f"Gemini request failed: status={exc.code} body={detail[:800]}") from exc
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        payload: dict[str, Any]
        try:
            payload = json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Gemini response is not JSON: {raw[:800]}") from exc

        candidates = payload.get("candidates") or []
        text = ""
        if candidates and isinstance(candidates, list):
            first = candidates[0] if candidates else {}
            content = first.get("content") or {}
            parts = content.get("parts") or []
            texts = []
            if isinstance(parts, list):
                for part in parts:
                    if not isinstance(part, dict):
                        continue
                    value = part.get("text")
                    if isinstance(value, str) and value.strip():
                        texts.append(value)
            text = "\n".join(texts).strip()

        usage = payload.get("usageMetadata") or {}
        if not isinstance(usage, dict):
            usage = {}

        return GeminiGenerateResult(text=text, usage=usage)

