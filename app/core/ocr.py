import json
import os
from urllib import error, request
from urllib.parse import urlparse, urlunparse

OCR_WORKER_URL = os.getenv("OCR_WORKER_URL", "").strip()
if not OCR_WORKER_URL:
    OCR_WORKER_URL = "http://ocr-worker:8100/ocr"

OCR_TIMEOUT_SECONDS = float(os.getenv("OCR_TIMEOUT_SECONDS", "60"))
OCR_HEALTH_URL = os.getenv("OCR_WORKER_HEALTH_URL", "").strip()


def _read_non_negative_int(name: str, default: str) -> int:
    try:
        value = int(os.getenv(name, default))
    except Exception:  # noqa: BLE001
        value = int(default)
    return max(0, value)


OCR_MAX_PAGES = _read_non_negative_int("OCR_MAX_PAGES", "4")
OCR_RENDER_DPI = max(96, int(os.getenv("OCR_RENDER_DPI", "144")))
OCR_FAST_MODE = (
    os.getenv("OCR_FAST_MODE", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
OCR_FORCE_RENDER_PDF = (
    os.getenv("OCR_FORCE_RENDER_PDF", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
OCR_PYPDF_PREFLIGHT = (
    os.getenv("OCR_PYPDF_PREFLIGHT", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
OCR_PROFILE = os.getenv("OCR_PROFILE", "balanced").strip().lower()
if OCR_PROFILE not in {"speed", "balanced", "quality"}:
    OCR_PROFILE = "balanced"

OCR_SPEED_MAX_PAGES = _read_non_negative_int("OCR_SPEED_MAX_PAGES", "2")
OCR_SPEED_RENDER_DPI = max(96, int(os.getenv("OCR_SPEED_RENDER_DPI", "120")))
OCR_SPEED_FAST_MODE = (
    os.getenv("OCR_SPEED_FAST_MODE", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
OCR_SPEED_FORCE_RENDER_PDF = (
    os.getenv("OCR_SPEED_FORCE_RENDER_PDF", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)

OCR_QUALITY_MAX_PAGES = _read_non_negative_int("OCR_QUALITY_MAX_PAGES", str(OCR_MAX_PAGES))
OCR_QUALITY_RENDER_DPI = max(96, int(os.getenv("OCR_QUALITY_RENDER_DPI", "180")))
OCR_QUALITY_FAST_MODE = (
    os.getenv("OCR_QUALITY_FAST_MODE", "false").strip().lower()
    in {"1", "true", "yes", "on"}
)
OCR_QUALITY_FORCE_RENDER_PDF = (
    os.getenv("OCR_QUALITY_FORCE_RENDER_PDF", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)


def _resolve_ocr_request_options() -> dict:
    if OCR_PROFILE == "speed":
        return {
            "max_pages": OCR_SPEED_MAX_PAGES,
            "render_dpi": OCR_SPEED_RENDER_DPI,
            "fast_mode": OCR_SPEED_FAST_MODE,
            "force_render_pdf": OCR_SPEED_FORCE_RENDER_PDF,
            "pypdf_preflight": OCR_PYPDF_PREFLIGHT,
        }

    if OCR_PROFILE == "quality":
        return {
            "max_pages": OCR_QUALITY_MAX_PAGES,
            "render_dpi": OCR_QUALITY_RENDER_DPI,
            "fast_mode": OCR_QUALITY_FAST_MODE,
            "force_render_pdf": OCR_QUALITY_FORCE_RENDER_PDF,
            "pypdf_preflight": OCR_PYPDF_PREFLIGHT,
        }

    return {
        "max_pages": OCR_MAX_PAGES,
        "render_dpi": OCR_RENDER_DPI,
        "fast_mode": OCR_FAST_MODE,
        "force_render_pdf": OCR_FORCE_RENDER_PDF,
        "pypdf_preflight": OCR_PYPDF_PREFLIGHT,
    }


def _resolve_health_url() -> str:
    if OCR_HEALTH_URL:
        return OCR_HEALTH_URL

    parsed = urlparse(OCR_WORKER_URL)
    if not parsed.scheme or not parsed.netloc:
        return ""

    health_path = "/health"
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            health_path,
            "",
            "",
            "",
        )
    )


def _call_ocr_worker(file_path: str) -> str:
    if not OCR_WORKER_URL:
        return ""

    payload_obj = {
        "file_path": file_path,
        **_resolve_ocr_request_options(),
    }
    payload = json.dumps(payload_obj).encode("utf-8")
    req = request.Request(
        OCR_WORKER_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with request.urlopen(req, timeout=OCR_TIMEOUT_SECONDS) as resp:
        body = resp.read().decode("utf-8")

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return ""

    text = data.get("text")
    if isinstance(text, str):
        return text.strip()
    return ""


def get_ocr_worker_health() -> dict:
    health_url = _resolve_health_url()
    if not health_url:
        return {
            "healthy": False,
            "configured": False,
            "url": OCR_WORKER_URL,
            "error": "OCR worker URL is not configured.",
        }

    try:
        with request.urlopen(health_url, timeout=OCR_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
        data = json.loads(body)
        return {
            "healthy": True,
            "configured": True,
            "url": health_url,
            "details": data,
        }
    except (error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        return {
            "healthy": False,
            "configured": True,
            "url": health_url,
            "error": str(exc),
        }


def perform_ocr(file_path: str) -> str:
    """
    Run OCR via external worker when configured.
    If worker is unavailable, return empty text so caller can decide fallback.
    """
    try:
        return _call_ocr_worker(file_path)
    except (error.URLError, TimeoutError, OSError, ValueError) as exc:
        print(f"[ocr] OCR worker call failed: {exc}")
        return ""
