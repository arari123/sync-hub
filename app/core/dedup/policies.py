from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any, Tuple


DEDUP_MODES = {"off", "exact_only", "exact_and_near"}
INDEX_POLICIES = {"index_all", "index_primary_only", "index_primary_prefer"}

CLI_DEDUP_TO_MODE = {
    "off": "off",
    "exact": "exact_only",
    "near": "exact_and_near",
}

CLI_POLICY_TO_MODE = {
    "all": "index_all",
    "primary-only": "index_primary_only",
    "prefer": "index_primary_prefer",
}


@dataclass
class DedupPolicyConfig:
    dedup_mode: str = "exact_only"
    index_policy: str = "index_all"

    @classmethod
    def from_env(cls) -> "DedupPolicyConfig":
        mode = os.getenv("DEDUP_MODE", "exact_only").strip().lower()
        policy = os.getenv("INDEX_POLICY", "index_all").strip().lower()
        return cls(
            dedup_mode=normalize_dedup_mode(mode),
            index_policy=normalize_index_policy(policy),
        )


def normalize_dedup_mode(mode: str) -> str:
    candidate = (mode or "").strip().lower()
    return candidate if candidate in DEDUP_MODES else "exact_only"


def normalize_index_policy(policy: str) -> str:
    candidate = (policy or "").strip().lower()
    return candidate if candidate in INDEX_POLICIES else "index_all"


def resolve_policy(
    dedup_mode_override: str | None = None,
    index_policy_override: str | None = None,
) -> DedupPolicyConfig:
    env_config = DedupPolicyConfig.from_env()

    if dedup_mode_override:
        env_config.dedup_mode = normalize_dedup_mode(dedup_mode_override)

    if index_policy_override:
        env_config.index_policy = normalize_index_policy(index_policy_override)

    return env_config


def _read_field(obj: Any, field_name: str, default=None):
    if isinstance(obj, dict):
        return obj.get(field_name, default)
    return getattr(obj, field_name, default)


def is_primary_document(doc: Any) -> bool:
    doc_id = _read_field(doc, "id")
    primary_doc_id = _read_field(doc, "dedup_primary_doc_id")
    if primary_doc_id is None:
        return True
    return doc_id == primary_doc_id


def should_index_document(doc: Any, config: DedupPolicyConfig) -> Tuple[bool, str]:
    dedup_status = (_read_field(doc, "dedup_status", "unique") or "unique").strip().lower()

    if dedup_status == "ignored":
        return False, "ignored"

    if config.dedup_mode == "off":
        return True, "dedup_off"

    if dedup_status == "exact_dup":
        return False, "exact_duplicate"

    if config.dedup_mode == "exact_only":
        return True, "exact_only_pass"

    if config.index_policy == "index_primary_only" and dedup_status == "near_dup" and not is_primary_document(doc):
        return False, "near_duplicate_non_primary"

    return True, "allowed"


def search_penalty_for_non_primary(doc: Any, config: DedupPolicyConfig) -> float:
    if config.index_policy != "index_primary_prefer":
        return 0.0

    dedup_status = (_read_field(doc, "dedup_status", "unique") or "unique").strip().lower()
    if dedup_status == "near_dup" and not is_primary_document(doc):
        return 0.35

    return 0.0
