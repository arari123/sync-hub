from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import re
import secrets
from typing import Iterable

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
_PBKDF2_ITERATIONS = 260_000
_PBKDF2_ALGORITHM = "sha256"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def parse_iso(value: str) -> datetime:
    normalized = (value or "").strip()
    if not normalized:
        return utcnow()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def is_valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(normalize_email(value)))


def parse_allowed_domains(raw_value: str) -> list[str]:
    domains = []
    seen = set()
    for part in (raw_value or "").split(","):
        item = part.strip().lower().lstrip("@")
        if not item or item in seen:
            continue
        seen.add(item)
        domains.append(item)
    return domains


def is_email_domain_allowed(email: str, allowed_domains: Iterable[str]) -> bool:
    normalized = normalize_email(email)
    if "@" not in normalized:
        return False
    domain = normalized.rsplit("@", 1)[-1]
    allowed = {item.strip().lower().lstrip("@") for item in allowed_domains if item.strip()}
    if not allowed:
        return False
    return domain in allowed


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Password is required.")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        _PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_{_PBKDF2_ALGORITHM}${_PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, encoded_password: str) -> bool:
    try:
        method, iter_text, salt, expected_digest = (encoded_password or "").split("$", 3)
    except ValueError:
        return False

    if not method.startswith("pbkdf2_"):
        return False
    algorithm = method.replace("pbkdf2_", "", 1)

    try:
        iterations = int(iter_text)
    except ValueError:
        return False

    actual_digest = hashlib.pbkdf2_hmac(
        algorithm,
        (password or "").encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(actual_digest, expected_digest)


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def token_expiry(minutes: int) -> datetime:
    return utcnow() + timedelta(minutes=max(1, int(minutes)))


def session_expiry(hours: int) -> datetime:
    return utcnow() + timedelta(hours=max(1, int(hours)))


def auth_allowed_domains() -> list[str]:
    raw = os.getenv("AUTH_ALLOWED_EMAIL_DOMAINS", "example.com")
    return parse_allowed_domains(raw)
