from __future__ import annotations

import hashlib
import itertools
import re
from typing import Dict, Iterable, List, Sequence, Set, Tuple


_TOKEN_RE = re.compile(r"[a-z0-9가-힣]+", re.IGNORECASE)


def tokenize(text: str) -> List[str]:
    return [token.lower() for token in _TOKEN_RE.findall(text or "")]


def build_shingles(text: str, shingle_size: int = 5) -> Set[str]:
    tokens = tokenize(text)
    if not tokens:
        return set()

    if len(tokens) < shingle_size:
        return {" ".join(tokens)}

    shingles = {
        " ".join(tokens[index : index + shingle_size])
        for index in range(len(tokens) - shingle_size + 1)
    }
    return shingles


def _perm_hash(value: str, seed: int) -> int:
    payload = f"{seed}:{value}".encode("utf-8")
    digest = hashlib.sha1(payload).digest()
    return int.from_bytes(digest[:8], "big")


def minhash_signature(shingles: Set[str], num_perm: int = 64) -> List[int]:
    if not shingles:
        return [0 for _ in range(num_perm)]

    signature: List[int] = []
    for perm_index in range(num_perm):
        min_hash = min(_perm_hash(shingle, perm_index + 1) for shingle in shingles)
        signature.append(min_hash)
    return signature


def _lsh_buckets(signature: Sequence[int], bands: int) -> Iterable[Tuple[int, str]]:
    if bands <= 0:
        return []

    rows_per_band = max(1, len(signature) // bands)
    buckets = []

    for band in range(bands):
        start = band * rows_per_band
        end = start + rows_per_band
        if band == bands - 1:
            end = len(signature)
        if start >= len(signature):
            break

        band_slice = signature[start:end]
        band_key = hashlib.md5(str(tuple(band_slice)).encode("utf-8")).hexdigest()
        buckets.append((band, band_key))

    return buckets


def candidate_pairs_from_signatures(
    signatures: Dict[int, Sequence[int]],
    bands: int,
) -> Set[Tuple[int, int]]:
    bucket_map: Dict[Tuple[int, str], List[int]] = {}

    for doc_id, signature in signatures.items():
        for bucket in _lsh_buckets(signature, bands=bands):
            bucket_map.setdefault(bucket, []).append(doc_id)

    pairs: Set[Tuple[int, int]] = set()
    for docs in bucket_map.values():
        if len(docs) < 2:
            continue

        for left, right in itertools.combinations(sorted(set(docs)), 2):
            pairs.add((left, right))

    return pairs


def jaccard_similarity(left: Set[str], right: Set[str]) -> float:
    if not left or not right:
        return 0.0

    intersection = len(left.intersection(right))
    union = len(left.union(right))
    if union == 0:
        return 0.0
    return intersection / union


def find_near_duplicate_pairs(
    text_by_doc: Dict[int, str],
    shingle_size: int = 5,
    num_perm: int = 64,
    bands: int = 8,
    threshold: float = 0.92,
) -> List[Tuple[int, int, float]]:
    shingles_by_doc = {
        doc_id: build_shingles(text, shingle_size=shingle_size)
        for doc_id, text in text_by_doc.items()
        if (text or "").strip()
    }

    signatures = {
        doc_id: minhash_signature(shingles, num_perm=num_perm)
        for doc_id, shingles in shingles_by_doc.items()
    }

    pairs = candidate_pairs_from_signatures(signatures, bands=bands)
    scored_pairs: List[Tuple[int, int, float]] = []

    for left_id, right_id in sorted(pairs):
        score = jaccard_similarity(
            shingles_by_doc.get(left_id, set()),
            shingles_by_doc.get(right_id, set()),
        )
        if score >= threshold:
            scored_pairs.append((left_id, right_id, score))

    scored_pairs.sort(key=lambda item: item[2], reverse=True)
    return scored_pairs


def best_near_match_for_doc(
    target_doc_id: int,
    text_by_doc: Dict[int, str],
    shingle_size: int = 5,
    num_perm: int = 64,
    bands: int = 8,
    threshold: float = 0.92,
) -> Tuple[int | None, float]:
    if target_doc_id not in text_by_doc:
        return None, 0.0

    pairs = find_near_duplicate_pairs(
        text_by_doc=text_by_doc,
        shingle_size=shingle_size,
        num_perm=num_perm,
        bands=bands,
        threshold=threshold,
    )

    best_doc_id = None
    best_score = 0.0
    for left_id, right_id, score in pairs:
        if left_id == target_doc_id:
            if score > best_score:
                best_doc_id = right_id
                best_score = score
        elif right_id == target_doc_id:
            if score > best_score:
                best_doc_id = left_id
                best_score = score

    return best_doc_id, best_score
