from __future__ import annotations

import base64
import importlib.util
import inspect
import json
import mimetypes
import os
import tempfile
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib import error, request
from urllib.parse import urlparse, urlunparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None

try:
    import pypdfium2 as pdfium
except ImportError:  # pragma: no cover
    pdfium = None


app = FastAPI(title="Sync-Hub OCR Worker")

OCR_ACCELERATOR = os.getenv("OCR_ACCELERATOR", "cpu").strip().lower()
OCR_PROVIDER = os.getenv("OCR_PROVIDER", "pypdf").strip().lower()

GLM_OCR_ENDPOINT = os.getenv("GLM_OCR_ENDPOINT", "").strip()
GLM_OCR_API_KEY = os.getenv("GLM_OCR_API_KEY", "").strip()
GLM_OCR_API_KEY_HEADER = os.getenv("GLM_OCR_API_KEY_HEADER", "Authorization").strip()
GLM_OCR_API_KEY_PREFIX = os.getenv("GLM_OCR_API_KEY_PREFIX", "Bearer").strip()
GLM_OCR_MODE = os.getenv("GLM_OCR_MODE", "openai-chat").strip().lower()
GLM_OCR_FILE_FIELD = os.getenv("GLM_OCR_FILE_FIELD", "file").strip()
GLM_OCR_BASE64_FIELD = os.getenv("GLM_OCR_BASE64_FIELD", "file_base64").strip()
GLM_OCR_FILENAME_FIELD = os.getenv("GLM_OCR_FILENAME_FIELD", "filename").strip()
GLM_OCR_MIMETYPE_FIELD = os.getenv("GLM_OCR_MIMETYPE_FIELD", "mime_type").strip()
GLM_OCR_MODEL = os.getenv("GLM_OCR_MODEL", "").strip()
GLM_OCR_PROMPT = os.getenv("GLM_OCR_PROMPT", "").strip()
GLM_OCR_TEXT_PATH = os.getenv("GLM_OCR_TEXT_PATH", "").strip()
GLM_OCR_TIMEOUT_SECONDS = float(os.getenv("GLM_OCR_TIMEOUT_SECONDS", "30"))
GLM_OCR_MAX_TOKENS = max(256, int(os.getenv("GLM_OCR_MAX_TOKENS", "4096")))
GLM_MAX_PAGES = max(0, int(os.getenv("GLM_MAX_PAGES", "0")))
GLM_RENDER_DPI = max(96, int(os.getenv("GLM_RENDER_DPI", "180")))
GLM_OCR_EXTRA_HEADERS_RAW = os.getenv("GLM_OCR_EXTRA_HEADERS", "").strip()
GLM_DEFAULT_PROMPT = (
    "Recognize the text in the image and output in Markdown format. "
    "Preserve the original layout (headings/paragraphs/tables/formulas). "
    "Do not fabricate content that does not exist in the image."
)
GLM_PADDLE_LITE_LANG = os.getenv("GLM_PADDLE_LITE_LANG", "korean").strip() or "korean"
GLM_PADDLE_LITE_MAX_PAGES = max(0, int(os.getenv("GLM_PADDLE_LITE_MAX_PAGES", "4")))
GLM_PADDLE_LITE_RENDER_DPI = max(96, int(os.getenv("GLM_PADDLE_LITE_RENDER_DPI", "144")))
GLM_PADDLE_LITE_FAST_MODE = (
    os.getenv("GLM_PADDLE_LITE_FAST_MODE", "true").strip().lower() in {"1", "true", "yes", "on"}
)
GLM_PADDLE_LITE_FAST_FIRST_PAGES = max(1, int(os.getenv("GLM_PADDLE_LITE_FAST_FIRST_PAGES", "2")))
GLM_PADDLE_LITE_FAST_RENDER_DPI = max(96, int(os.getenv("GLM_PADDLE_LITE_FAST_RENDER_DPI", "120")))
GLM_PADDLE_LITE_FAST_MIN_TEXT_CHARS = max(64, int(os.getenv("GLM_PADDLE_LITE_FAST_MIN_TEXT_CHARS", "180")))

OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT", "").strip()
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2-vision").strip()
OLLAMA_PROMPT = os.getenv(
    "OLLAMA_PROMPT",
    "Extract all visible text from these document page images. Return plain text only.",
).strip()
OLLAMA_MODE = os.getenv("OLLAMA_MODE", "chat").strip().lower()
if OLLAMA_MODE not in {"chat", "generate"}:
    OLLAMA_MODE = "chat"
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "60"))
OLLAMA_MAX_PAGES = max(0, int(os.getenv("OLLAMA_MAX_PAGES", "6")))
OLLAMA_RENDER_DPI = max(96, int(os.getenv("OLLAMA_RENDER_DPI", "180")))
OLLAMA_EXTRA_OPTIONS_RAW = os.getenv("OLLAMA_EXTRA_OPTIONS", "").strip()
OLLAMA_HEALTHCHECK_URL = os.getenv("OLLAMA_HEALTHCHECK_URL", "").strip()

PADDLE_PIPELINE_VERSION = os.getenv("PADDLE_PIPELINE_VERSION", "v1.5").strip()
PADDLE_MODEL_NAME = os.getenv("PADDLE_MODEL_NAME", "PaddleOCR-VL-1.5-0.9B").strip()
PADDLE_DEVICE = os.getenv("PADDLE_DEVICE", "cpu").strip()
PADDLE_MAX_PAGES = max(0, int(os.getenv("PADDLE_MAX_PAGES", "6")))
PADDLE_RENDER_DPI = max(96, int(os.getenv("PADDLE_RENDER_DPI", "180")))
PADDLE_USE_DOC_ORIENTATION_CLASSIFY = (
    os.getenv("PADDLE_USE_DOC_ORIENTATION_CLASSIFY", "true").strip().lower() in {"1", "true", "yes", "on"}
)
PADDLE_USE_DOC_UNWARPING = (
    os.getenv("PADDLE_USE_DOC_UNWARPING", "false").strip().lower() in {"1", "true", "yes", "on"}
)
PADDLE_USE_TEXTLINE_ORIENTATION = (
    os.getenv("PADDLE_USE_TEXTLINE_ORIENTATION", "false").strip().lower() in {"1", "true", "yes", "on"}
)
PADDLE_DISABLE_MODEL_SOURCE_CHECK = (
    os.getenv("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "true").strip().lower() in {"1", "true", "yes", "on"}
)
if PADDLE_DISABLE_MODEL_SOURCE_CHECK:
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

GLM_HEALTHCHECK_URL = os.getenv("GLM_HEALTHCHECK_URL", "").strip()
OCR_PROVIDER_HEALTH_TIMEOUT_SECONDS = float(os.getenv("OCR_PROVIDER_HEALTH_TIMEOUT_SECONDS", "3"))
OCR_PYPDF_PREFLIGHT_MIN_CHARS = max(32, int(os.getenv("OCR_PYPDF_PREFLIGHT_MIN_CHARS", "120")))
PADDLE_FORCE_RENDER_PDF_DEFAULT = (
    os.getenv("PADDLE_FORCE_RENDER_PDF", "true").strip().lower() in {"1", "true", "yes", "on"}
)
PADDLE_FAST_MODE_DEFAULT = (
    os.getenv("PADDLE_FAST_MODE", "true").strip().lower() in {"1", "true", "yes", "on"}
)
PADDLE_FAST_FIRST_PAGES = max(1, int(os.getenv("PADDLE_FAST_FIRST_PAGES", "2")))
PADDLE_FAST_RENDER_DPI = max(96, int(os.getenv("PADDLE_FAST_RENDER_DPI", "120")))
PADDLE_FAST_MIN_TEXT_CHARS = max(64, int(os.getenv("PADDLE_FAST_MIN_TEXT_CHARS", "180")))
PADDLE_SKIP_PDF_OCR_ON_CPU = (
    os.getenv("PADDLE_SKIP_PDF_OCR_ON_CPU", "true").strip().lower() in {"1", "true", "yes", "on"}
)

_PADDLE_PIPELINE: Any = None
_PADDLE_PIPELINE_ERROR = ""
_PADDLE_LITE_OCR: Any = None
_PADDLE_LITE_OCR_ERROR = ""


class OCRRequest(BaseModel):
    file_path: str
    max_pages: int | None = None
    render_dpi: int | None = None
    fast_mode: bool | None = None
    force_render_pdf: bool | None = None
    pypdf_preflight: bool | None = None


class OCRResponse(BaseModel):
    text: str
    engine: str
    pages: int
    used_fallback: bool
    error: str | None = None


def _read_json_object(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def _read_extra_headers() -> dict[str, str]:
    data = _read_json_object(GLM_OCR_EXTRA_HEADERS_RAW)

    headers: dict[str, str] = {}
    for key, value in data.items():
        if key and value is not None:
            headers[str(key)] = str(value)
    return headers


def _glm_auth_value() -> str:
    if not GLM_OCR_API_KEY:
        return ""
    if not GLM_OCR_API_KEY_PREFIX:
        return GLM_OCR_API_KEY
    return f"{GLM_OCR_API_KEY_PREFIX} {GLM_OCR_API_KEY}"


def _build_headers(content_type: str | None = None) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type

    auth_value = _glm_auth_value()
    if auth_value and GLM_OCR_API_KEY_HEADER:
        headers[GLM_OCR_API_KEY_HEADER] = auth_value

    headers.update(_read_extra_headers())
    return headers


def _extract_by_path(data: Any, path: str) -> Any:
    cursor = data
    for token in path.split("."):
        token = token.strip()
        if not token:
            return None

        if isinstance(cursor, list):
            if not token.isdigit():
                return None
            index = int(token)
            if index < 0 or index >= len(cursor):
                return None
            cursor = cursor[index]
            continue

        if isinstance(cursor, dict):
            if token not in cursor:
                return None
            cursor = cursor[token]
            continue

        return None
    return cursor


def _extract_text_recursive(payload: Any, depth: int = 0) -> str:
    if depth > 8 or payload is None:
        return ""

    if isinstance(payload, str):
        return payload.strip()

    if isinstance(payload, dict):
        priority_keys = (
            "text",
            "ocr_text",
            "extracted_text",
            "result_text",
            "content",
            "result",
            "output",
            "answer",
            "response",
        )
        for key in priority_keys:
            if key in payload:
                candidate = _extract_text_recursive(payload.get(key), depth + 1)
                if candidate:
                    return candidate

        choices = payload.get("choices")
        if isinstance(choices, list):
            for choice in choices:
                candidate = _extract_text_recursive(choice, depth + 1)
                if candidate:
                    return candidate

        for key, value in payload.items():
            lowered = str(key).lower()
            if "text" in lowered or "content" in lowered:
                candidate = _extract_text_recursive(value, depth + 1)
                if candidate:
                    return candidate

        for value in payload.values():
            candidate = _extract_text_recursive(value, depth + 1)
            if candidate:
                return candidate
        return ""

    if isinstance(payload, list):
        for item in payload:
            candidate = _extract_text_recursive(item, depth + 1)
            if candidate:
                return candidate
        return ""

    return ""


def _extract_pages_recursive(payload: Any, depth: int = 0) -> int:
    if depth > 6 or payload is None:
        return 0

    if isinstance(payload, (int, float)):
        if payload > 0:
            return int(payload)
        return 0

    if isinstance(payload, dict):
        keys = ("pages", "page_count", "num_pages", "total_pages")
        for key in keys:
            if key in payload:
                value = _extract_pages_recursive(payload.get(key), depth + 1)
                if value > 0:
                    return value
        for value in payload.values():
            parsed = _extract_pages_recursive(value, depth + 1)
            if parsed > 0:
                return parsed
        return 0

    if isinstance(payload, list):
        for item in payload:
            parsed = _extract_pages_recursive(item, depth + 1)
            if parsed > 0:
                return parsed
        return 0

    return 0


def _build_multipart_body(file_path: str) -> tuple[bytes, str]:
    boundary = f"----sync-hub-{uuid.uuid4().hex}"
    filename = os.path.basename(file_path)
    mime_type = mimetypes.guess_type(filename)[0] or "application/pdf"

    with open(file_path, "rb") as file_obj:
        binary = file_obj.read()

    chunks: list[bytes] = []

    def _append_field(name: str, value: str):
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        chunks.append(value.encode("utf-8"))
        chunks.append(b"\r\n")

    if GLM_OCR_MODEL:
        _append_field("model", GLM_OCR_MODEL)
    if GLM_OCR_PROMPT:
        _append_field("prompt", GLM_OCR_PROMPT)

    chunks.append(f"--{boundary}\r\n".encode("utf-8"))
    chunks.append(
        (
            f'Content-Disposition: form-data; name="{GLM_OCR_FILE_FIELD}"; '
            f'filename="{filename}"\r\n'
        ).encode("utf-8")
    )
    chunks.append(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
    chunks.append(binary)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))

    return b"".join(chunks), boundary


def _build_json_body(file_path: str) -> bytes:
    filename = os.path.basename(file_path)
    mime_type = mimetypes.guess_type(filename)[0] or "application/pdf"
    with open(file_path, "rb") as file_obj:
        raw = file_obj.read()

    payload: dict[str, Any] = {
        GLM_OCR_BASE64_FIELD: base64.b64encode(raw).decode("utf-8"),
        GLM_OCR_FILENAME_FIELD: filename,
        GLM_OCR_MIMETYPE_FIELD: mime_type,
    }
    if GLM_OCR_MODEL:
        payload["model"] = GLM_OCR_MODEL
    if GLM_OCR_PROMPT:
        payload["prompt"] = GLM_OCR_PROMPT

    return json.dumps(payload).encode("utf-8")


def _derive_ollama_health_url() -> str:
    if OLLAMA_HEALTHCHECK_URL:
        return OLLAMA_HEALTHCHECK_URL

    parsed = urlparse(OLLAMA_ENDPOINT)
    if not parsed.scheme or not parsed.netloc:
        return ""

    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            "/api/tags",
            "",
            "",
            "",
        )
    )


def _probe_json_endpoint(url: str, timeout_seconds: float) -> tuple[bool, str]:
    if not url:
        return False, "Health URL is not configured."

    req = request.Request(
        url,
        headers={"Accept": "application/json"},
        method="GET",
    )

    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            status_code = int(getattr(response, "status", 200))
        if 200 <= status_code < 400:
            return True, ""
        return False, f"HTTP {status_code}"
    except error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except (error.URLError, TimeoutError, OSError, ValueError) as exc:
        return False, str(exc)


def _provider_health_snapshot() -> dict[str, Any]:
    if OCR_PROVIDER == "pypdf":
        return {
            "provider_ready": True,
            "provider_health_url": "",
            "provider_error": None,
        }

    if OCR_PROVIDER == "glm":
        if not GLM_OCR_ENDPOINT:
            return {
                "provider_ready": False,
                "provider_health_url": "",
                "provider_error": "GLM_OCR_ENDPOINT is not configured.",
            }

        health_url = GLM_HEALTHCHECK_URL or GLM_OCR_ENDPOINT
        if GLM_HEALTHCHECK_URL:
            ok, message = _probe_json_endpoint(health_url, OCR_PROVIDER_HEALTH_TIMEOUT_SECONDS)
            return {
                "provider_ready": ok,
                "provider_health_url": health_url,
                "provider_error": message or None,
            }

        return {
            "provider_ready": True,
            "provider_health_url": health_url,
            "provider_error": None,
        }

    if OCR_PROVIDER == "ollama":
        if not OLLAMA_ENDPOINT:
            return {
                "provider_ready": False,
                "provider_health_url": "",
                "provider_error": "OLLAMA_ENDPOINT is not configured.",
            }

        health_url = _derive_ollama_health_url()
        ok, message = _probe_json_endpoint(health_url, OCR_PROVIDER_HEALTH_TIMEOUT_SECONDS)
        return {
            "provider_ready": ok,
            "provider_health_url": health_url,
            "provider_error": message or None,
        }

    if OCR_PROVIDER == "paddle":
        has_paddleocr = importlib.util.find_spec("paddleocr") is not None
        has_paddle = importlib.util.find_spec("paddle") is not None
        provider_ready = has_paddleocr and has_paddle
        provider_error = None
        if not has_paddleocr:
            provider_error = "paddleocr is not installed."
        elif not has_paddle:
            provider_error = "paddlepaddle is not installed."

        return {
            "provider_ready": provider_ready,
            "provider_health_url": "",
            "provider_error": provider_error,
        }

    return {
        "provider_ready": False,
        "provider_health_url": "",
        "provider_error": f"Unsupported OCR provider: {OCR_PROVIDER}",
    }


def _parse_json_or_jsonl(response_body: str) -> Any:
    try:
        return json.loads(response_body)
    except json.JSONDecodeError:
        chunks: list[dict[str, Any]] = []
        for line in response_body.splitlines():
            text = line.strip()
            if not text:
                continue
            try:
                decoded = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(decoded, dict):
                chunks.append(decoded)

        if chunks:
            return {"chunks": chunks}
        return None


def _extract_ollama_text(payload: Any) -> str:
    if isinstance(payload, dict):
        message = payload.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()

        response = payload.get("response")
        if isinstance(response, str) and response.strip():
            return response.strip()

        chunks = payload.get("chunks")
        if isinstance(chunks, list):
            parts: list[str] = []
            for chunk in chunks:
                part = _extract_ollama_text(chunk)
                if part:
                    parts.append(part)
            if parts:
                return "\n".join(parts).strip()

    return _extract_text_recursive(payload)


def _build_glm_openai_payload(data_url: str) -> dict[str, Any]:
    prompt = GLM_OCR_PROMPT or GLM_DEFAULT_PROMPT
    payload: dict[str, Any] = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
        "max_tokens": GLM_OCR_MAX_TOKENS,
    }
    if GLM_OCR_MODEL:
        payload["model"] = GLM_OCR_MODEL
    return payload


def _call_glm_openai_chat(data_url: str) -> str:
    body = json.dumps(_build_glm_openai_payload(data_url)).encode("utf-8")
    req = request.Request(
        GLM_OCR_ENDPOINT,
        data=body,
        headers=_build_headers("application/json"),
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=GLM_OCR_TIMEOUT_SECONDS) as response:
            response_body = response.read().decode("utf-8", errors="replace")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GLM HTTP {exc.code}: {body[:200]}") from exc
    except (error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"GLM request failed: {exc}") from exc

    payload = _parse_json_or_jsonl(response_body)
    if payload is None:
        text = response_body.strip()
        if text:
            return text
        raise ValueError("GLM response is not JSON and has no text content.")

    if GLM_OCR_TEXT_PATH:
        by_path = _extract_by_path(payload, GLM_OCR_TEXT_PATH)
        text = _extract_text_recursive(by_path)
    else:
        text = _extract_text_recursive(payload)

    if text:
        return text
    raise ValueError("GLM response did not include extractable text.")


def _file_to_data_uri(file_path: str) -> str:
    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    with open(file_path, "rb") as file_obj:
        raw = file_obj.read()
    encoded = base64.b64encode(raw).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def _call_glm(file_path: str, max_pages: int, render_dpi: int) -> tuple[str, int]:
    if not GLM_OCR_ENDPOINT:
        raise ValueError("GLM_OCR_ENDPOINT is not configured.")

    normalized_mode = GLM_OCR_MODE.replace("_", "-")
    if normalized_mode not in {"openai-chat", "sglang"}:
        raise ValueError(f"Unsupported GLM_OCR_MODE for local SGLang: {GLM_OCR_MODE}")

    lower_path = file_path.lower()
    if lower_path.endswith(".pdf"):
        page_images = _render_pdf_pages_for_ollama(
            file_path=file_path,
            max_pages=max_pages,
            render_dpi=render_dpi,
        )
        if not page_images:
            raise ValueError("No rendered pages generated from PDF input.")
        parts: list[str] = []
        for page_base64 in page_images:
            text = _call_glm_openai_chat(f"data:image/png;base64,{page_base64}")
            if text.strip():
                parts.append(text.strip())
        merged = "\n".join(parts).strip()
        if merged:
            return merged, len(page_images)
        raise ValueError("GLM response did not include extractable text.")

    data_url = _file_to_data_uri(file_path)
    text = _call_glm_openai_chat(data_url).strip()
    if text:
        return text, 1
    raise ValueError("GLM response did not include extractable text.")


def _render_pdf_pages_for_ollama(
    file_path: str,
    max_pages: int = OLLAMA_MAX_PAGES,
    render_dpi: int = OLLAMA_RENDER_DPI,
) -> list[str]:
    if pdfium is None:
        raise RuntimeError("pypdfium2 is not installed.")

    images_base64: list[str] = []
    document = pdfium.PdfDocument(file_path)
    page_total = len(document)
    render_count = page_total if max_pages <= 0 else min(page_total, max_pages)
    scale = max(96, render_dpi) / 72.0

    for page_index in range(render_count):
        page = document[page_index]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil()

        buffer = BytesIO()
        image.save(buffer, format="PNG")
        images_base64.append(base64.b64encode(buffer.getvalue()).decode("utf-8"))

        image.close()
        if hasattr(bitmap, "close"):
            bitmap.close()
        if hasattr(page, "close"):
            page.close()

    if hasattr(document, "close"):
        document.close()

    return images_base64


def _render_pdf_pages_to_pngs(
    file_path: str,
    output_dir: str,
    max_pages: int,
    render_dpi: int,
    start_page: int = 0,
) -> list[str]:
    if pdfium is None:
        raise RuntimeError("pypdfium2 is not installed.")

    page_paths: list[str] = []
    document = pdfium.PdfDocument(file_path)
    page_total = len(document)
    start_index = max(0, int(start_page))
    if max_pages <= 0:
        end_index = page_total
    else:
        end_index = min(page_total, start_index + max_pages)
    scale = render_dpi / 72.0

    for page_index in range(start_index, end_index):
        page = document[page_index]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil()
        png_path = os.path.join(output_dir, f"page_{page_index + 1:03d}.png")
        image.save(png_path, format="PNG")
        page_paths.append(png_path)

        image.close()
        if hasattr(bitmap, "close"):
            bitmap.close()
        if hasattr(page, "close"):
            page.close()

    if hasattr(document, "close"):
        document.close()

    return page_paths


def _paddle_gpu_available() -> bool:
    try:
        import paddle  # type: ignore
    except Exception:  # noqa: BLE001
        return False

    try:
        if not paddle.device.is_compiled_with_cuda():
            return False
    except Exception:  # noqa: BLE001
        return False

    try:
        return int(paddle.device.cuda.device_count()) > 0
    except Exception:  # noqa: BLE001
        return False


def _paddle_effective_device(requested_device: str) -> str:
    candidate = (requested_device or "").strip()
    if not candidate:
        return "cpu"
    if candidate.lower().startswith("gpu") and not _paddle_gpu_available():
        return "cpu"
    return candidate


def _build_paddle_init_kwargs() -> dict[str, Any]:
    effective_device = _paddle_effective_device(PADDLE_DEVICE)
    kwargs: dict[str, Any] = {
        "pipeline_version": PADDLE_PIPELINE_VERSION,
        "vl_rec_model_name": PADDLE_MODEL_NAME,
        "device": effective_device,
        "use_doc_orientation_classify": PADDLE_USE_DOC_ORIENTATION_CLASSIFY,
        "use_doc_unwarping": PADDLE_USE_DOC_UNWARPING,
        "use_textline_orientation": PADDLE_USE_TEXTLINE_ORIENTATION,
    }
    return {key: value for key, value in kwargs.items() if value not in {"", None}}


def _get_paddle_pipeline():
    global _PADDLE_PIPELINE, _PADDLE_PIPELINE_ERROR
    if _PADDLE_PIPELINE is not None:
        return _PADDLE_PIPELINE
    if _PADDLE_PIPELINE_ERROR:
        raise RuntimeError(_PADDLE_PIPELINE_ERROR)

    try:
        from paddleocr import PaddleOCRVL  # type: ignore
    except ImportError as exc:
        _PADDLE_PIPELINE_ERROR = f"PaddleOCR import failed: {exc}"
        raise RuntimeError(_PADDLE_PIPELINE_ERROR) from exc

    kwargs = _build_paddle_init_kwargs()
    while True:
        try:
            _PADDLE_PIPELINE = PaddleOCRVL(**kwargs)
            return _PADDLE_PIPELINE
        except ValueError as exc:
            message = str(exc)
            prefix = "Unknown argument: "
            if not message.startswith(prefix):
                _PADDLE_PIPELINE_ERROR = f"PaddleOCRVL init failed: {exc}"
                raise RuntimeError(_PADDLE_PIPELINE_ERROR) from exc

            unknown_arg = message[len(prefix) :].strip()
            if unknown_arg in kwargs:
                kwargs.pop(unknown_arg)
                continue

            _PADDLE_PIPELINE_ERROR = f"PaddleOCRVL init failed: {exc}"
            raise RuntimeError(_PADDLE_PIPELINE_ERROR) from exc
        except Exception as exc:  # noqa: BLE001
            _PADDLE_PIPELINE_ERROR = f"PaddleOCRVL init failed: {exc}"
            raise RuntimeError(_PADDLE_PIPELINE_ERROR) from exc


def _build_paddle_lite_init_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "lang": GLM_PADDLE_LITE_LANG,
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
    }
    return kwargs


def _get_paddle_lite_ocr():
    global _PADDLE_LITE_OCR, _PADDLE_LITE_OCR_ERROR
    if _PADDLE_LITE_OCR is not None:
        return _PADDLE_LITE_OCR
    if _PADDLE_LITE_OCR_ERROR:
        raise RuntimeError(_PADDLE_LITE_OCR_ERROR)

    try:
        from paddleocr import PaddleOCR  # type: ignore
    except ImportError as exc:
        _PADDLE_LITE_OCR_ERROR = f"PaddleOCR import failed: {exc}"
        raise RuntimeError(_PADDLE_LITE_OCR_ERROR) from exc

    kwargs = _build_paddle_lite_init_kwargs()
    try:
        signature = inspect.signature(PaddleOCR.__init__)
    except Exception:  # noqa: BLE001
        signature = None

    if signature and "device" in signature.parameters and PADDLE_DEVICE:
        kwargs["device"] = _paddle_effective_device(PADDLE_DEVICE)

    try:
        _PADDLE_LITE_OCR = PaddleOCR(**kwargs)
        return _PADDLE_LITE_OCR
    except Exception as exc:  # noqa: BLE001
        _PADDLE_LITE_OCR_ERROR = f"PaddleOCR init failed: {exc}"
        raise RuntimeError(_PADDLE_LITE_OCR_ERROR) from exc


def _extract_text_from_lite_ocr_item(item: Any) -> str:
    if item is None:
        return ""

    if isinstance(item, list):
        lines: list[str] = []
        for row in item:
            if (
                isinstance(row, (list, tuple))
                and len(row) >= 2
                and isinstance(row[1], (list, tuple))
                and row[1]
                and isinstance(row[1][0], str)
            ):
                text = row[1][0].strip()
                if text:
                    lines.append(text)
        if lines:
            return "\n".join(lines).strip()

    if isinstance(item, dict) or hasattr(item, "get"):
        getter = item.get if hasattr(item, "get") else None
        if getter is not None:
            rec_texts = getter("rec_texts")
            if isinstance(rec_texts, list):
                lines = [str(value).strip() for value in rec_texts if str(value).strip()]
                if lines:
                    return "\n".join(lines).strip()
            if isinstance(rec_texts, str) and rec_texts.strip():
                return rec_texts.strip()

    text = _extract_text_recursive(item)
    return text.strip()


def _call_paddle_lite(
    file_path: str,
    max_pages: int = GLM_PADDLE_LITE_MAX_PAGES,
    render_dpi: int = GLM_PADDLE_LITE_RENDER_DPI,
    fast_mode: bool = GLM_PADDLE_LITE_FAST_MODE,
) -> tuple[str, int]:
    pipeline = _get_paddle_lite_ocr()
    lower_path = file_path.lower()

    def _predict_files(input_paths: list[str]) -> list[str]:
        if not input_paths:
            return []

        # `predict` is the new API; fall back to `ocr` for compatibility.
        if hasattr(pipeline, "predict"):
            output = pipeline.predict(input_paths if len(input_paths) > 1 else input_paths[0])
        else:
            output = pipeline.ocr(input_paths if len(input_paths) > 1 else input_paths[0])  # type: ignore[attr-defined]

        if not isinstance(output, list):
            output = list(output)

        parts: list[str] = []
        for item in output:
            text = _extract_text_from_lite_ocr_item(item)
            if text:
                parts.append(text)
        return parts

    if lower_path.endswith(".pdf"):
        with tempfile.TemporaryDirectory(prefix="sync-hub-paddle-lite-") as temp_dir:
            def _ocr_pages(start_page: int, page_count: int, dpi: int) -> tuple[list[str], int]:
                if page_count < 0:
                    return [], 0

                page_paths = _render_pdf_pages_to_pngs(
                    file_path=file_path,
                    output_dir=temp_dir,
                    max_pages=page_count,
                    render_dpi=dpi,
                    start_page=start_page,
                )
                if not page_paths:
                    return [], 0

                page_texts = _predict_files(page_paths)
                return page_texts, len(page_paths)

            texts: list[str] = []
            total_processed_pages = 0

            if fast_mode:
                fast_pass_pages = (
                    min(max_pages, GLM_PADDLE_LITE_FAST_FIRST_PAGES)
                    if max_pages > 0
                    else GLM_PADDLE_LITE_FAST_FIRST_PAGES
                )
                fast_pass_dpi = min(render_dpi, GLM_PADDLE_LITE_FAST_RENDER_DPI)
                fast_texts, fast_processed_pages = _ocr_pages(
                    start_page=0,
                    page_count=fast_pass_pages,
                    dpi=fast_pass_dpi,
                )
                texts.extend(fast_texts)
                total_processed_pages += fast_processed_pages

                fast_text = "\n".join(texts).strip()
                enough_text = len(fast_text) >= GLM_PADDLE_LITE_FAST_MIN_TEXT_CHARS
                exhausted_pages = max_pages > 0 and total_processed_pages >= max_pages
                if enough_text or exhausted_pages:
                    if fast_text:
                        return fast_text, total_processed_pages

            remaining_pages = 0 if max_pages <= 0 else max(0, max_pages - total_processed_pages)
            if max_pages <= 0 or remaining_pages > 0:
                remaining_texts, remaining_processed_pages = _ocr_pages(
                    start_page=total_processed_pages,
                    page_count=remaining_pages,
                    dpi=render_dpi,
                )
                texts.extend(remaining_texts)
                total_processed_pages += remaining_processed_pages

            text = "\n".join(texts).strip()
            if text:
                return text, total_processed_pages
            raise ValueError("PaddleOCR lite response did not include extractable text.")

    texts = _predict_files([file_path])
    text = "\n".join(texts).strip()
    if text:
        return text, 1
    raise ValueError("PaddleOCR lite response did not include extractable text.")


def _extract_text_from_prediction_item(item: Any) -> str:
    # PaddleOCR-VL blocks keep recognized text under `content`.
    try:
        parsing_blocks = item.get("parsing_res_list")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        parsing_blocks = None

    if isinstance(parsing_blocks, list) and parsing_blocks:
        contents: list[str] = []
        for block in parsing_blocks:
            content = ""
            if isinstance(block, dict):
                value = block.get("content")
                if isinstance(value, str):
                    content = value
            elif hasattr(block, "content"):
                value = getattr(block, "content")
                if isinstance(value, str):
                    content = value
            if content.strip():
                contents.append(content.strip())
        if contents:
            return "\n".join(contents).strip()

    payload: Any = item

    if not isinstance(payload, (dict, list, str)):
        if hasattr(payload, "res"):
            payload = getattr(payload, "res")
        elif hasattr(payload, "to_dict"):
            try:
                payload = payload.to_dict()
            except Exception:  # noqa: BLE001
                payload = str(payload)
        else:
            payload = str(payload)

    text = _extract_text_recursive(payload)
    return text.strip()


def _extract_pages_from_prediction_item(item: Any) -> int:
    for key in ("page_count", "pages", "num_pages", "total_pages"):
        value = None
        if isinstance(item, dict):
            value = item.get(key)
        elif hasattr(item, "get"):
            try:
                value = item.get(key)  # type: ignore[attr-defined]
            except Exception:  # noqa: BLE001
                value = None
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
    return 0


def _call_paddle_predict(pipeline, input_path: str) -> tuple[str, int]:
    predict_signature = inspect.signature(pipeline.predict)
    if "input" in predict_signature.parameters:
        prediction_output = pipeline.predict(input=input_path)
    else:
        prediction_output = pipeline.predict(input_path)

    if isinstance(prediction_output, list):
        prediction_items = prediction_output
    else:
        prediction_items = list(prediction_output)

    texts: list[str] = []
    pages = 0
    for item in prediction_items:
        chunk = _extract_text_from_prediction_item(item)
        if chunk:
            texts.append(chunk)
        pages = max(pages, _extract_pages_from_prediction_item(item))

    if pages <= 0:
        pages = len(prediction_items)

    return "\n".join(texts).strip(), pages


def _call_paddle(
    file_path: str,
    max_pages: int = PADDLE_MAX_PAGES,
    render_dpi: int = PADDLE_RENDER_DPI,
    force_render_pdf: bool = PADDLE_FORCE_RENDER_PDF_DEFAULT,
    fast_mode: bool = PADDLE_FAST_MODE_DEFAULT,
) -> tuple[str, int]:
    pipeline = _get_paddle_pipeline()
    lower_path = file_path.lower()

    def _ocr_rendered_pages(
        *,
        start_page: int,
        page_count: int,
        dpi: int,
    ) -> tuple[list[str], int]:
        if page_count < 0:
            return [], 0

        with tempfile.TemporaryDirectory(prefix="sync-hub-paddle-") as temp_dir:
            page_paths = _render_pdf_pages_to_pngs(
                file_path=file_path,
                output_dir=temp_dir,
                max_pages=page_count,
                render_dpi=dpi,
                start_page=start_page,
            )
            if not page_paths:
                return [], 0

            texts: list[str] = []
            for page_path in page_paths:
                chunk, _ = _call_paddle_predict(pipeline, page_path)
                if chunk:
                    texts.append(chunk)
            return texts, len(page_paths)

    if lower_path.endswith(".pdf"):
        direct_error: Exception | None = None
        if not force_render_pdf:
            try:
                text, pages = _call_paddle_predict(pipeline, file_path)
                if text:
                    return text, pages
            except Exception as exc:  # noqa: BLE001
                direct_error = exc

        texts: list[str] = []
        total_processed_pages = 0

        if fast_mode:
            fast_pass_pages = min(max_pages, PADDLE_FAST_FIRST_PAGES) if max_pages > 0 else PADDLE_FAST_FIRST_PAGES
            fast_pass_dpi = min(render_dpi, PADDLE_FAST_RENDER_DPI)
            fast_texts, fast_processed_pages = _ocr_rendered_pages(
                start_page=0,
                page_count=fast_pass_pages,
                dpi=fast_pass_dpi,
            )
            texts.extend(fast_texts)
            total_processed_pages += fast_processed_pages

            fast_text = "\n".join(texts).strip()
            enough_text = len(fast_text) >= PADDLE_FAST_MIN_TEXT_CHARS
            exhausted_pages = max_pages > 0 and total_processed_pages >= max_pages
            if enough_text or exhausted_pages:
                if fast_text:
                    return fast_text, total_processed_pages

        remaining_pages = 0 if max_pages <= 0 else max(0, max_pages - total_processed_pages)
        if max_pages <= 0 or remaining_pages > 0:
            remaining_texts, remaining_processed_pages = _ocr_rendered_pages(
                start_page=total_processed_pages,
                page_count=remaining_pages,
                dpi=render_dpi,
            )
            texts.extend(remaining_texts)
            total_processed_pages += remaining_processed_pages

        text = "\n".join(texts).strip()
        if text:
            return text, total_processed_pages
        if direct_error is not None:
            raise RuntimeError(
                f"Paddle direct PDF predict failed: {direct_error}"
            ) from direct_error
        raise ValueError("PaddleOCR response did not include extractable text.")

    text, pages = _call_paddle_predict(pipeline, file_path)
    if text:
        return text, pages
    raise ValueError("PaddleOCR response did not include extractable text.")


def _build_ollama_payload(images_base64: list[str]) -> bytes:
    payload: dict[str, Any]
    if OLLAMA_MODE == "generate":
        payload = {
            "model": OLLAMA_MODEL,
            "stream": False,
            "prompt": OLLAMA_PROMPT,
            "images": images_base64,
        }
    else:
        payload = {
            "model": OLLAMA_MODEL,
            "stream": False,
            "messages": [
                {
                    "role": "user",
                    "content": OLLAMA_PROMPT,
                    "images": images_base64,
                }
            ],
        }

    extra_options = _read_json_object(OLLAMA_EXTRA_OPTIONS_RAW)
    if extra_options:
        payload["options"] = extra_options

    return json.dumps(payload).encode("utf-8")


def _call_ollama(
    file_path: str,
    max_pages: int = OLLAMA_MAX_PAGES,
    render_dpi: int = OLLAMA_RENDER_DPI,
) -> tuple[str, int]:
    if not OLLAMA_ENDPOINT:
        raise ValueError("OLLAMA_ENDPOINT is not configured.")

    images_base64 = _render_pdf_pages_for_ollama(
        file_path=file_path,
        max_pages=max_pages,
        render_dpi=render_dpi,
    )
    if not images_base64:
        raise ValueError("No PDF pages were rendered for Ollama OCR.")

    req = request.Request(
        OLLAMA_ENDPOINT,
        data=_build_ollama_payload(images_base64),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=OLLAMA_TIMEOUT_SECONDS) as response:
            response_body = response.read().decode("utf-8", errors="replace")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama HTTP {exc.code}: {body[:200]}") from exc
    except (error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"Ollama request failed: {exc}") from exc

    payload = _parse_json_or_jsonl(response_body)
    if payload is None:
        text = response_body.strip()
        if text:
            return text, len(images_base64)
        raise ValueError("Ollama response is not JSON and has no text content.")

    text = _extract_ollama_text(payload)
    if text:
        return text, len(images_base64)

    raise ValueError("Ollama response did not include extractable text.")


def _extract_text_with_pypdf(file_path: str) -> tuple[str, int]:
    if PdfReader is None:
        return "", 0

    try:
        reader = PdfReader(file_path)
    except Exception as exc:  # noqa: BLE001
        print(f"[ocr-worker] PdfReader init failed: {exc}")
        return "", 0

    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception as exc:  # noqa: BLE001
            print(f"[ocr-worker] PDF decrypt skipped: {exc}")

    page_texts: list[str] = []
    for page in reader.pages:
        try:
            page_texts.append((page.extract_text() or "").strip())
        except Exception as exc:  # noqa: BLE001
            print(f"[ocr-worker] PDF page extract failed: {exc}")
            page_texts.append("")

    text = "\n".join([chunk for chunk in page_texts if chunk]).strip()
    return text, len(reader.pages)


def _paddle_runtime_info() -> dict[str, Any]:
    try:
        import paddle  # type: ignore
    except Exception:  # noqa: BLE001
        return {
            "paddle_cuda_compiled": False,
            "paddle_cuda_devices": 0,
        }

    try:
        cuda_compiled = bool(paddle.device.is_compiled_with_cuda())
    except Exception:  # noqa: BLE001
        cuda_compiled = False

    cuda_devices = 0
    if cuda_compiled:
        try:
            cuda_devices = int(paddle.device.cuda.device_count())
        except Exception:  # noqa: BLE001
            cuda_devices = 0

    return {
        "paddle_cuda_compiled": cuda_compiled,
        "paddle_cuda_devices": cuda_devices,
        "paddle_gpu_available": cuda_compiled and cuda_devices > 0,
        "paddle_effective_device": _paddle_effective_device(PADDLE_DEVICE),
    }


def _resolve_requested_max_pages(payload_max_pages: int | None, default_max_pages: int) -> int:
    if payload_max_pages is None:
        return max(0, int(default_max_pages))
    return max(0, int(payload_max_pages))


def _apply_page_cap(requested_max_pages: int, hard_limit_max_pages: int) -> int:
    requested = max(0, int(requested_max_pages))
    hard_limit = max(0, int(hard_limit_max_pages))

    if requested == 0 and hard_limit == 0:
        return 0
    if requested == 0:
        return hard_limit
    if hard_limit == 0:
        return requested
    return min(requested, hard_limit)


@app.get("/health")
def health():
    provider_health = _provider_health_snapshot()
    paddle_runtime = _paddle_runtime_info()
    gpu_runtime_ready = bool(paddle_runtime.get("paddle_gpu_available", False))
    gpu_runtime_warning = None
    if OCR_ACCELERATOR == "gpu" and not gpu_runtime_ready:
        gpu_runtime_warning = (
            "GPU accelerator requested but CUDA device is not available in container runtime. "
            "OCR currently runs on CPU fallback."
        )
    details = {
        "status": "healthy",
        "service": "ocr-worker",
        "accelerator": OCR_ACCELERATOR,
        "provider": OCR_PROVIDER,
        "gpu_runtime_ready": gpu_runtime_ready,
        "gpu_runtime_warning": gpu_runtime_warning,
        **paddle_runtime,
        **provider_health,
    }
    if OCR_PROVIDER == "glm":
        details.update(
            {
                "glm_mode": GLM_OCR_MODE,
                "glm_endpoint_configured": bool(GLM_OCR_ENDPOINT),
                "glm_max_pages": GLM_MAX_PAGES,
                "glm_render_dpi": GLM_RENDER_DPI,
            }
        )
    elif OCR_PROVIDER == "ollama":
        details.update(
            {
                "ollama_endpoint_configured": bool(OLLAMA_ENDPOINT),
                "ollama_model": OLLAMA_MODEL,
                "ollama_mode": OLLAMA_MODE,
            }
        )
    elif OCR_PROVIDER == "paddle":
        details.update(
            {
                "paddle_pipeline_version": PADDLE_PIPELINE_VERSION,
                "paddle_model": PADDLE_MODEL_NAME,
                "paddle_device": PADDLE_DEVICE,
                "paddle_disable_model_source_check": PADDLE_DISABLE_MODEL_SOURCE_CHECK,
                "paddle_fast_mode": PADDLE_FAST_MODE_DEFAULT,
                "paddle_fast_first_pages": PADDLE_FAST_FIRST_PAGES,
                "paddle_fast_render_dpi": PADDLE_FAST_RENDER_DPI,
                "paddle_fast_min_text_chars": PADDLE_FAST_MIN_TEXT_CHARS,
                "paddle_skip_pdf_ocr_on_cpu": PADDLE_SKIP_PDF_OCR_ON_CPU,
            }
        )
    return details


@app.post("/ocr", response_model=OCRResponse)
def ocr(payload: OCRRequest):
    file_path = Path(payload.file_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    if OCR_PROVIDER == "glm":
        default_max_pages = GLM_MAX_PAGES
        default_render_dpi = GLM_RENDER_DPI
    elif OCR_PROVIDER == "ollama":
        default_max_pages = OLLAMA_MAX_PAGES
        default_render_dpi = OLLAMA_RENDER_DPI
    else:
        default_max_pages = PADDLE_MAX_PAGES
        default_render_dpi = PADDLE_RENDER_DPI

    requested_max_pages = _resolve_requested_max_pages(payload.max_pages, default_max_pages)
    requested_render_dpi = max(96, int(payload.render_dpi or default_render_dpi))
    requested_fast_mode = (
        PADDLE_FAST_MODE_DEFAULT if payload.fast_mode is None else bool(payload.fast_mode)
    )
    force_render_pdf = (
        PADDLE_FORCE_RENDER_PDF_DEFAULT
        if payload.force_render_pdf is None
        else bool(payload.force_render_pdf)
    )
    use_pypdf_preflight = True if payload.pypdf_preflight is None else bool(payload.pypdf_preflight)
    if OCR_PROVIDER == "glm":
        # Enforce GLM-only OCR path.
        use_pypdf_preflight = False
    should_skip_heavy_paddle_pdf = (
        OCR_PROVIDER == "paddle"
        and str(PADDLE_DEVICE).strip().lower().startswith("cpu")
        and str(file_path).lower().endswith(".pdf")
        and PADDLE_SKIP_PDF_OCR_ON_CPU
    )

    if use_pypdf_preflight:
        pre_text, pre_pages = _extract_text_with_pypdf(str(file_path))
        if len(pre_text.strip()) >= OCR_PYPDF_PREFLIGHT_MIN_CHARS:
            return OCRResponse(
                text=pre_text.strip(),
                engine="pypdf-preflight",
                pages=pre_pages,
                used_fallback=OCR_PROVIDER in {"glm", "ollama", "paddle"},
            )

    if should_skip_heavy_paddle_pdf:
        text, pages = _extract_text_with_pypdf(str(file_path))
        return OCRResponse(
            text=text.strip(),
            engine="pypdf-fast-skip",
            pages=pages,
            used_fallback=True,
            error="Skipped heavy Paddle PDF OCR on CPU. Use GPU OCR service to enable full scanned-PDF extraction.",
        )

    if OCR_PROVIDER == "glm":
        if not GLM_OCR_ENDPOINT:
            raise HTTPException(status_code=503, detail="GLM_OCR_ENDPOINT is not configured.")
        try:
            text, pages = _call_glm(
                str(file_path),
                max_pages=requested_max_pages,
                render_dpi=requested_render_dpi,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"GLM OCR failed: {exc}") from exc

        if text.strip():
            return OCRResponse(
                text=text.strip(),
                engine="glm-ocr",
                pages=pages,
                used_fallback=False,
            )
        raise HTTPException(status_code=502, detail="GLM OCR returned empty text.")
    fallback_error = ""
    if OCR_PROVIDER == "ollama":
        try:
            text, pages = _call_ollama(
                str(file_path),
                max_pages=requested_max_pages,
                render_dpi=requested_render_dpi,
            )
            if text.strip():
                return OCRResponse(
                    text=text.strip(),
                    engine="ollama-ocr",
                    pages=pages,
                    used_fallback=False,
                )
        except Exception as exc:  # noqa: BLE001
            fallback_error = str(exc)
    elif OCR_PROVIDER == "paddle":
        try:
            text, pages = _call_paddle(
                str(file_path),
                max_pages=requested_max_pages,
                render_dpi=requested_render_dpi,
                force_render_pdf=force_render_pdf,
                fast_mode=requested_fast_mode,
            )
            if text.strip():
                return OCRResponse(
                    text=text.strip(),
                    engine="paddleocr-vl",
                    pages=pages,
                    used_fallback=False,
                )
        except Exception as exc:  # noqa: BLE001
            fallback_error = str(exc)

    text, pages = _extract_text_with_pypdf(str(file_path))
    return OCRResponse(
        text=text.strip(),
        engine="pypdf-fallback" if OCR_PROVIDER in {"glm", "ollama", "paddle"} else "pypdf",
        pages=pages,
        used_fallback=OCR_PROVIDER in {"glm", "ollama", "paddle"},
        error=fallback_error or None,
    )
