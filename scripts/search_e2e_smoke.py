#!/usr/bin/env python3
"""Run end-to-end smoke checks for document/project search quality."""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*|[가-힣]+")


@dataclass
class SmokeCase:
    name: str
    query: str
    min_doc_count: int = 1
    min_doc_token_hits: int = 1
    must_include_doc_type: str | None = None
    max_project_count: int = 8


DEFAULT_CASES = [
    SmokeCase(
        name="line-profile",
        query="라인 프로파일 센서",
        min_doc_count=1,
        min_doc_token_hits=2,
        max_project_count=1,
    ),
    SmokeCase(
        name="basler",
        query="basler",
        min_doc_count=1,
        min_doc_token_hits=1,
        max_project_count=1,
    ),
    SmokeCase(
        name="failure-report",
        query="장애 조치",
        min_doc_count=1,
        must_include_doc_type="equipment_failure_report",
        max_project_count=8,
    ),
]


def _http_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> Any:
    request_headers = dict(headers or {})
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url=url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        detail = body.strip() or str(exc)
        raise RuntimeError(f"HTTP {exc.code} {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"URL error for {url}: {exc}") from exc

    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON response from {url}: {raw[:400]}") from exc


def _extract_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return [item for item in payload["items"] if isinstance(item, dict)]
    return []


def _tokenize(value: str) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for token in TOKEN_PATTERN.findall((value or "").lower()):
        token = token.strip()
        if len(token) < 2 or token in seen:
            continue
        seen.add(token)
        output.append(token)
    return output


def _doc_matches_query(items: list[dict[str, Any]], query: str, min_token_hits: int) -> bool:
    tokens = _tokenize(query)
    if not tokens:
        return True
    min_hits = max(1, int(min_token_hits or 1))
    for item in items:
        haystack = " ".join(
            [
                str(item.get("title") or ""),
                str(item.get("filename") or ""),
                str(item.get("summary") or ""),
                str(item.get("snippet") or ""),
            ]
        ).lower()
        hits = sum(1 for token in tokens if token in haystack)
        if hits >= min_hits:
            return True
    return False


def _contains_doc_type(items: list[dict[str, Any]], doc_type: str) -> bool:
    target = doc_type.lower().strip()
    for item in items:
        raw_types = item.get("document_types")
        if isinstance(raw_types, list):
            types = [str(v).strip().lower() for v in raw_types]
        elif isinstance(raw_types, str):
            types = [v.strip().lower() for v in raw_types.split(",")]
        else:
            types = []
        if target in types:
            return True
    return False


def _project_top_matches_query(items: list[dict[str, Any]], query: str, top_n: int = 3) -> bool:
    tokens = _tokenize(query)
    if len(tokens) < 2:
        return True
    for item in items[:top_n]:
        haystack = " ".join(
            [
                str(item.get("name") or ""),
                str(item.get("description") or ""),
                str(item.get("customer_name") or ""),
                str(item.get("manager_name") or ""),
            ]
        ).lower()
        token_hits = sum(1 for token in tokens if token in haystack)
        if token_hits >= 2:
            return True
    return False


def _signup_verify_login(api_base: str, domain: str) -> str:
    def _signup_with_domain(target_domain: str) -> tuple[dict[str, Any], str, str]:
        nonce = f"{int(time.time())}-{secrets.token_hex(4)}"
        email = f"search-smoke-{nonce}@{target_domain}"
        password = f"SmokePass!{secrets.token_hex(4)}"
        payload = _http_json(
            f"{api_base.rstrip('/')}/auth/signup",
            method="POST",
            payload={"email": email, "password": password, "full_name": "Search Smoke"},
        )
        return payload, email, password

    try:
        signup, email, password = _signup_with_domain(domain)
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        marker = "Only allowed email domains can sign up:"
        if marker not in message:
            raise
        allowed_part = message.split(marker, 1)[1].strip()
        allowed_domains = [item.strip() for item in allowed_part.split(",") if item.strip()]
        if not allowed_domains:
            raise
        signup, email, password = _signup_with_domain(allowed_domains[0])
    verify_link = str((signup or {}).get("debug_verify_link") or "").strip()
    if not verify_link:
        raise RuntimeError(
            "signup succeeded but debug_verify_link is missing. "
            "Set AUTH_EMAIL_DEBUG_LINK=true or pass --email/--password."
        )

    parsed = urllib.parse.urlparse(verify_link)
    token = urllib.parse.parse_qs(parsed.query).get("token", [""])[0].strip()
    if not token:
        raise RuntimeError(f"failed to parse verify token from link: {verify_link}")

    _http_json(
        f"{api_base.rstrip('/')}/auth/verify-email",
        method="POST",
        payload={"token": token},
    )

    login = _http_json(
        f"{api_base.rstrip('/')}/auth/login",
        method="POST",
        payload={"email": email, "password": password},
    )
    access_token = str((login or {}).get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("login did not return access_token")
    return access_token


def _resolve_access_token(args: argparse.Namespace) -> str:
    if args.access_token:
        return args.access_token.strip()

    if args.email and args.password:
        login = _http_json(
            f"{args.api_base.rstrip('/')}/auth/login",
            method="POST",
            payload={"email": args.email, "password": args.password},
        )
        token = str((login or {}).get("access_token") or "").strip()
        if not token:
            raise RuntimeError("login did not return access_token")
        return token

    if args.auto_signup:
        return _signup_verify_login(args.api_base, args.signup_domain)

    raise RuntimeError("project search requires authentication. pass --access-token or --email/--password")


def _document_search(api_base: str, query: str) -> list[dict[str, Any]]:
    encoded = urllib.parse.quote(query, safe="")
    payload = _http_json(f"{api_base.rstrip('/')}/documents/search?q={encoded}&page=1&page_size=10")
    return _extract_items(payload)


def _project_search(api_base: str, query: str, access_token: str) -> list[dict[str, Any]]:
    encoded = urllib.parse.quote(query, safe="")
    payload = _http_json(
        f"{api_base.rstrip('/')}/budget/projects/search?q={encoded}&limit=8",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    return _extract_items(payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run search E2E smoke checks.")
    parser.add_argument("--api-base", default=os.getenv("SEARCH_SMOKE_API_BASE", "http://localhost:8001"))
    parser.add_argument("--access-token", default=os.getenv("SEARCH_SMOKE_ACCESS_TOKEN", ""))
    parser.add_argument("--email", default=os.getenv("SEARCH_SMOKE_EMAIL", ""))
    parser.add_argument("--password", default=os.getenv("SEARCH_SMOKE_PASSWORD", ""))
    parser.add_argument(
        "--auto-signup",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Auto-create/verify/login a temporary account when no credentials are provided.",
    )
    parser.add_argument(
        "--signup-domain",
        default=os.getenv("SEARCH_SMOKE_SIGNUP_DOMAIN", "example.com"),
        help="Domain used for auto-signup email.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    failures: list[str] = []

    try:
        access_token = _resolve_access_token(args)
    except Exception as exc:  # noqa: BLE001
        print(f"[search-smoke] auth setup failed: {exc}")
        return 1

    print(f"[search-smoke] api_base={args.api_base}")

    for case in DEFAULT_CASES:
        try:
            doc_items = _document_search(args.api_base, case.query)
            project_items = _project_search(args.api_base, case.query, access_token)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{case.name}: request failed: {exc}")
            continue

        print(
            f"[search-smoke] case={case.name} query={case.query!r} "
            f"doc_count={len(doc_items)} project_count={len(project_items)}"
        )

        if len(doc_items) < case.min_doc_count:
            failures.append(
                f"{case.name}: expected at least {case.min_doc_count} document results, got {len(doc_items)}"
            )

        if not _doc_matches_query(doc_items, case.query, case.min_doc_token_hits):
            failures.append(
                f"{case.name}: top document results do not satisfy token-hit threshold ({case.min_doc_token_hits})"
            )

        if case.must_include_doc_type and not _contains_doc_type(doc_items, case.must_include_doc_type):
            failures.append(
                f"{case.name}: document_type {case.must_include_doc_type!r} was not found in top document results"
            )

        if len(project_items) > case.max_project_count:
            failures.append(
                f"{case.name}: expected project results <= {case.max_project_count}, got {len(project_items)}"
            )

        if case.name in {"line-profile", "basler"} and project_items:
            if not _project_top_matches_query(project_items, case.query):
                failures.append(
                    f"{case.name}: top project results look weakly related to query {case.query!r}"
                )

    if failures:
        print("[search-smoke] FAILED")
        for item in failures:
            print(f"- {item}")
        return 1

    print("[search-smoke] PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
