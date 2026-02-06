from __future__ import annotations

import hashlib
import math
import re
from statistics import median
from typing import Dict, Iterable, List, Sequence, Set, Tuple


_TOKEN_RE = re.compile(r"[a-z0-9가-힣]+", re.IGNORECASE)


def _dot(left: Sequence[float], right: Sequence[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def _norm(vector: Sequence[float]) -> float:
    return math.sqrt(_dot(vector, vector))


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0

    denom = _norm(left) * _norm(right)
    if denom == 0.0:
        return 0.0
    return _dot(left, right) / denom


def mean_document_embedding(vectors: Iterable[Sequence[float]]) -> List[float]:
    vectors = [list(vector) for vector in vectors if vector]
    if not vectors:
        return []

    dims = len(vectors[0])
    accumulator = [0.0 for _ in range(dims)]

    for vector in vectors:
        if len(vector) != dims:
            continue
        for index, value in enumerate(vector):
            accumulator[index] += float(value)

    count = max(1, len(vectors))
    return [value / count for value in accumulator]


def median_document_embedding(vectors: Iterable[Sequence[float]]) -> List[float]:
    vectors = [list(vector) for vector in vectors if vector]
    if not vectors:
        return []

    dims = len(vectors[0])
    output = []

    for index in range(dims):
        values = [float(vector[index]) for vector in vectors if len(vector) == dims]
        if not values:
            output.append(0.0)
            continue
        output.append(float(median(values)))

    return output


def tokenize(text: str) -> List[str]:
    return [token.lower() for token in _TOKEN_RE.findall(text or "")]


def hashed_text_embedding(text: str, dims: int = 256) -> List[float]:
    if dims <= 0:
        return []

    tokens = tokenize(text)
    if not tokens:
        return [0.0 for _ in range(dims)]

    vector = [0.0 for _ in range(dims)]
    for token in tokens:
        digest = hashlib.sha1(token.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % dims
        sign = 1.0 if (digest[4] & 1) else -1.0
        vector[bucket] += sign

    norm = _norm(vector)
    if norm == 0.0:
        return vector

    return [value / norm for value in vector]


def _simhash(text: str) -> int:
    tokens = tokenize(text)
    if not tokens:
        return 0

    weights = [0 for _ in range(64)]
    for token in tokens:
        digest = hashlib.sha1(token.encode("utf-8")).digest()
        value = int.from_bytes(digest[:8], "big")
        for bit in range(64):
            if value & (1 << bit):
                weights[bit] += 1
            else:
                weights[bit] -= 1

    output = 0
    for bit, weight in enumerate(weights):
        if weight >= 0:
            output |= (1 << bit)
    return output


def _simhash_bands(value: int, bands: int = 8) -> List[Tuple[int, int]]:
    band_count = max(1, bands)
    bits_per_band = max(1, 64 // band_count)
    keys: List[Tuple[int, int]] = []

    for band in range(band_count):
        start = band * bits_per_band
        if start >= 64:
            break
        end = min(64, start + bits_per_band)
        width = end - start
        mask = (1 << width) - 1
        key = (value >> start) & mask
        keys.append((band, key))

    return keys


def candidate_pairs_from_simhash(text_by_doc: Dict[int, str], bands: int = 8) -> Set[Tuple[int, int]]:
    buckets: Dict[Tuple[int, int], List[int]] = {}
    for doc_id, text in text_by_doc.items():
        if not (text or "").strip():
            continue
        doc_hash = _simhash(text)
        for band_key in _simhash_bands(doc_hash, bands=bands):
            buckets.setdefault(band_key, []).append(doc_id)

    pairs: Set[Tuple[int, int]] = set()
    for doc_ids in buckets.values():
        unique_ids = sorted(set(doc_ids))
        if len(unique_ids) < 2:
            continue
        for index, left in enumerate(unique_ids):
            for right in unique_ids[index + 1 :]:
                pairs.add((left, right))
    return pairs


def find_embedding_near_pairs(
    text_by_doc: Dict[int, str],
    cosine_threshold: float = 0.95,
    dims: int = 256,
    simhash_bands: int = 8,
) -> List[Tuple[int, int, float]]:
    if len(text_by_doc) < 2:
        return []

    embeddings = {
        doc_id: hashed_text_embedding(text, dims=dims)
        for doc_id, text in text_by_doc.items()
        if (text or "").strip()
    }
    candidates = candidate_pairs_from_simhash(text_by_doc, bands=simhash_bands)

    pairs: List[Tuple[int, int, float]] = []
    for left_id, right_id in sorted(candidates):
        left = embeddings.get(left_id)
        right = embeddings.get(right_id)
        if not left or not right:
            continue

        score = cosine_similarity(left, right)
        if score >= cosine_threshold:
            pairs.append((left_id, right_id, score))

    pairs.sort(key=lambda item: item[2], reverse=True)
    return pairs


def best_embedding_match_for_doc(
    target_doc_id: int,
    text_by_doc: Dict[int, str],
    cosine_threshold: float = 0.95,
    dims: int = 256,
    simhash_bands: int = 8,
) -> Tuple[int | None, float]:
    pairs = find_embedding_near_pairs(
        text_by_doc=text_by_doc,
        cosine_threshold=cosine_threshold,
        dims=dims,
        simhash_bands=simhash_bands,
    )

    best_doc_id = None
    best_score = 0.0
    for left_id, right_id, score in pairs:
        if left_id == target_doc_id and score > best_score:
            best_doc_id = right_id
            best_score = score
        elif right_id == target_doc_id and score > best_score:
            best_doc_id = left_id
            best_score = score

    return best_doc_id, best_score
