from __future__ import annotations

import os
from typing import Optional


def _parse_admin_identifiers() -> set[str]:
    raw = (os.getenv("ADMIN_IDENTIFIERS") or "").strip()
    if not raw:
        raw = os.getenv("BUDGET_ADMIN_IDENTIFIERS", "admin,admin@example.com")
    return {
        token.strip().lower()
        for token in raw.split(",")
        if token and token.strip()
    }


_ADMIN_IDENTIFIERS = _parse_admin_identifiers()


def is_admin_user(user: Optional[object]) -> bool:
    if user is None:
        return False

    email = (getattr(user, "email", "") or "").strip().lower()
    if not email:
        return False

    local_part = email.split("@", 1)[0] if "@" in email else email
    return email in _ADMIN_IDENTIFIERS or local_part in _ADMIN_IDENTIFIERS

