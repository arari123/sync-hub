from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from typing import Dict, Iterable, List, Sequence, Tuple

from .doc_embedding import (
    best_embedding_match_for_doc,
    cosine_similarity,
    find_embedding_near_pairs,
    hashed_text_embedding,
)
from .hash import normalized_text_sha256, normalize_text_for_hash, safe_file_sha256
from .minhash import best_near_match_for_doc, build_shingles, find_near_duplicate_pairs, jaccard_similarity


NEAR_DUP_METHODS = {"minhash", "doc_embedding", "hybrid"}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class DedupThresholdConfig:
    near_dup_jaccard_threshold: float = 0.93
    near_dup_cosine_threshold: float = 0.95
    near_dup_method: str = "minhash"
    minhash_shingle_size: int = 5
    minhash_num_perm: int = 64
    minhash_bands: int = 8
    doc_embedding_dims: int = 256
    doc_embedding_simhash_bands: int = 8

    @classmethod
    def from_env(cls) -> "DedupThresholdConfig":
        return cls(
            near_dup_jaccard_threshold=float(os.getenv("NEAR_DUP_JACCARD_THRESHOLD", "0.93")),
            near_dup_cosine_threshold=float(os.getenv("NEAR_DUP_COSINE_THRESHOLD", "0.95")),
            near_dup_method=_normalize_near_method(os.getenv("NEAR_DUP_METHOD", "minhash")),
            minhash_shingle_size=max(2, int(os.getenv("MINHASH_SHINGLE_SIZE", "5"))),
            minhash_num_perm=max(16, int(os.getenv("MINHASH_NUM_PERM", "64"))),
            minhash_bands=max(2, int(os.getenv("MINHASH_BANDS", "8"))),
            doc_embedding_dims=max(64, int(os.getenv("DOC_EMBEDDING_DIMS", "256"))),
            doc_embedding_simhash_bands=max(2, int(os.getenv("DOC_EMBEDDING_SIMHASH_BANDS", "8"))),
        )


def _normalize_near_method(method: str) -> str:
    candidate = (method or "").strip().lower()
    if candidate in NEAR_DUP_METHODS:
        return candidate
    return "minhash"


def compute_document_hashes(file_path: str, clean_text: str) -> Tuple[str, str, str]:
    file_hash = safe_file_sha256(file_path)
    normalized_text = normalize_text_for_hash(clean_text)
    text_hash = normalized_text_sha256(clean_text) if normalized_text else ""
    return file_hash, text_hash, normalized_text


def _load_models():
    from ... import models

    return models


def _sql_or(*conditions):
    try:
        from sqlalchemy import or_
    except ModuleNotFoundError as exc:
        raise RuntimeError("sqlalchemy is required for dedup DB operations") from exc
    return or_(*conditions)


def _delete_doc_memberships(db, doc_ids: Iterable[int]) -> None:
    models = _load_models()
    ids = sorted(set(int(doc_id) for doc_id in doc_ids if doc_id is not None))
    if not ids:
        return

    db.query(models.DedupClusterMember).filter(models.DedupClusterMember.doc_id.in_(ids)).delete(
        synchronize_session=False
    )


def _cleanup_empty_clusters(db) -> None:
    models = _load_models()
    cluster_ids = {cluster_id for cluster_id, in db.query(models.DedupCluster.id).all()}
    if not cluster_ids:
        return

    used_cluster_ids = {
        cluster_id for cluster_id, in db.query(models.DedupClusterMember.cluster_id).distinct().all()
    }
    stale_ids = sorted(cluster_ids - used_cluster_ids)
    if not stale_ids:
        return

    db.query(models.DedupCluster).filter(models.DedupCluster.id.in_(stale_ids)).delete(
        synchronize_session=False
    )


def _ensure_cluster(db, method: str, primary_doc_id: int, threshold_used: dict, notes: str = ""):
    models = _load_models()
    now = _utcnow_iso()

    cluster = None
    if method == "exact" and notes:
        cluster = (
            db.query(models.DedupCluster)
            .filter(models.DedupCluster.method == "exact")
            .filter(models.DedupCluster.notes == notes)
            .first()
        )

    if cluster is None:
        cluster = models.DedupCluster(
            method=method,
            primary_doc_id=primary_doc_id,
            created_at=now,
            updated_at=now,
            threshold_used=json.dumps(threshold_used, ensure_ascii=True),
            notes=notes or None,
        )
        db.add(cluster)
        db.flush()
        return cluster

    cluster.primary_doc_id = primary_doc_id
    cluster.updated_at = now
    cluster.threshold_used = json.dumps(threshold_used, ensure_ascii=True)
    if notes:
        cluster.notes = notes
    db.flush()
    return cluster


def _upsert_cluster_member(
    db,
    cluster_id: int,
    doc_id: int,
    similarity_score: float | None,
    is_primary: bool,
) -> None:
    models = _load_models()

    db.query(models.DedupClusterMember).filter(
        models.DedupClusterMember.cluster_id == cluster_id,
        models.DedupClusterMember.doc_id == doc_id,
    ).delete(synchronize_session=False)

    db.add(
        models.DedupClusterMember(
            cluster_id=cluster_id,
            doc_id=doc_id,
            similarity_score=similarity_score,
            is_primary=is_primary,
        )
    )


def _append_audit_log(
    db,
    *,
    action: str,
    actor: str = "system",
    cluster_id: int | None = None,
    doc_id: int | None = None,
    previous_primary_doc_id: int | None = None,
    new_primary_doc_id: int | None = None,
    details: dict | None = None,
) -> None:
    models = _load_models()

    db.add(
        models.DedupAuditLog(
            action=action,
            actor=actor or "system",
            cluster_id=cluster_id,
            doc_id=doc_id,
            previous_primary_doc_id=previous_primary_doc_id,
            new_primary_doc_id=new_primary_doc_id,
            detail_json=json.dumps(details or {}, ensure_ascii=True),
            created_at=_utcnow_iso(),
        )
    )


def _apply_doc_dedup_fields(doc, dedup_status: str, primary_doc_id: int | None, cluster_id: int | None) -> None:
    if (doc.dedup_status or "").lower() == "ignored":
        return

    doc.dedup_status = dedup_status
    doc.dedup_primary_doc_id = primary_doc_id
    doc.dedup_cluster_id = cluster_id


def _build_doc_text_map(documents: Iterable) -> Dict[int, str]:
    text_map: Dict[int, str] = {}
    for document in documents:
        if not document.content_text:
            continue
        normalized = normalize_text_for_hash(document.content_text)
        if not normalized:
            continue
        text_map[document.id] = normalized
    return text_map


def _create_union_find(nodes: Iterable[int]) -> Tuple[Dict[int, int], Dict[int, int]]:
    parents = {node: node for node in nodes}
    ranks = {node: 0 for node in nodes}
    return parents, ranks


def _find(parents: Dict[int, int], node: int) -> int:
    while parents[node] != node:
        parents[node] = parents[parents[node]]
        node = parents[node]
    return node


def _union(parents: Dict[int, int], ranks: Dict[int, int], left: int, right: int) -> None:
    left_root = _find(parents, left)
    right_root = _find(parents, right)
    if left_root == right_root:
        return

    if ranks[left_root] < ranks[right_root]:
        parents[left_root] = right_root
        return

    if ranks[left_root] > ranks[right_root]:
        parents[right_root] = left_root
        return

    parents[right_root] = left_root
    ranks[left_root] += 1


def _pair_dict_from_pairs(pairs: Sequence[Tuple[int, int, float]]) -> Dict[Tuple[int, int], float]:
    output: Dict[Tuple[int, int], float] = {}
    for left_id, right_id, score in pairs:
        key = (min(left_id, right_id), max(left_id, right_id))
        previous = output.get(key, 0.0)
        if score > previous:
            output[key] = score
    return output


def _find_near_pairs(text_map: Dict[int, str], cfg: DedupThresholdConfig) -> Tuple[str, List[Tuple[int, int, float]], dict]:
    method = _normalize_near_method(cfg.near_dup_method)

    if method == "minhash":
        pairs = find_near_duplicate_pairs(
            text_by_doc=text_map,
            shingle_size=cfg.minhash_shingle_size,
            num_perm=cfg.minhash_num_perm,
            bands=cfg.minhash_bands,
            threshold=cfg.near_dup_jaccard_threshold,
        )
        threshold_used = {
            "near_dup_method": "minhash",
            "near_dup_jaccard_threshold": cfg.near_dup_jaccard_threshold,
            "minhash_num_perm": cfg.minhash_num_perm,
            "minhash_bands": cfg.minhash_bands,
            "minhash_shingle_size": cfg.minhash_shingle_size,
        }
        return "minhash", pairs, threshold_used

    if method == "doc_embedding":
        pairs = find_embedding_near_pairs(
            text_by_doc=text_map,
            cosine_threshold=cfg.near_dup_cosine_threshold,
            dims=cfg.doc_embedding_dims,
            simhash_bands=cfg.doc_embedding_simhash_bands,
        )
        threshold_used = {
            "near_dup_method": "doc_embedding",
            "near_dup_cosine_threshold": cfg.near_dup_cosine_threshold,
            "doc_embedding_dims": cfg.doc_embedding_dims,
            "doc_embedding_simhash_bands": cfg.doc_embedding_simhash_bands,
        }
        return "doc_embedding", pairs, threshold_used

    minhash_pairs = find_near_duplicate_pairs(
        text_by_doc=text_map,
        shingle_size=cfg.minhash_shingle_size,
        num_perm=cfg.minhash_num_perm,
        bands=cfg.minhash_bands,
        threshold=cfg.near_dup_jaccard_threshold,
    )
    embedding_pairs = find_embedding_near_pairs(
        text_by_doc=text_map,
        cosine_threshold=cfg.near_dup_cosine_threshold,
        dims=cfg.doc_embedding_dims,
        simhash_bands=cfg.doc_embedding_simhash_bands,
    )

    pair_scores = _pair_dict_from_pairs(minhash_pairs)
    for key, score in _pair_dict_from_pairs(embedding_pairs).items():
        pair_scores[key] = max(score, pair_scores.get(key, 0.0))

    pairs = [(left, right, score) for (left, right), score in pair_scores.items()]
    pairs.sort(key=lambda item: item[2], reverse=True)

    threshold_used = {
        "near_dup_method": "hybrid",
        "near_dup_jaccard_threshold": cfg.near_dup_jaccard_threshold,
        "near_dup_cosine_threshold": cfg.near_dup_cosine_threshold,
        "minhash_num_perm": cfg.minhash_num_perm,
        "minhash_bands": cfg.minhash_bands,
        "minhash_shingle_size": cfg.minhash_shingle_size,
        "doc_embedding_dims": cfg.doc_embedding_dims,
        "doc_embedding_simhash_bands": cfg.doc_embedding_simhash_bands,
    }
    return "hybrid", pairs, threshold_used


def _similarity_to_primary(
    primary_doc_id: int,
    member_doc_id: int,
    text_map: Dict[int, str],
    cfg: DedupThresholdConfig,
    near_method: str,
) -> float:
    if member_doc_id == primary_doc_id:
        return 1.0

    primary_text = text_map.get(primary_doc_id, "")
    member_text = text_map.get(member_doc_id, "")
    if not primary_text or not member_text:
        return 0.0

    if near_method == "minhash":
        primary_shingles = build_shingles(primary_text, shingle_size=cfg.minhash_shingle_size)
        member_shingles = build_shingles(member_text, shingle_size=cfg.minhash_shingle_size)
        return jaccard_similarity(primary_shingles, member_shingles)

    if near_method == "doc_embedding":
        primary_vec = hashed_text_embedding(primary_text, dims=cfg.doc_embedding_dims)
        member_vec = hashed_text_embedding(member_text, dims=cfg.doc_embedding_dims)
        return cosine_similarity(primary_vec, member_vec)

    primary_shingles = build_shingles(primary_text, shingle_size=cfg.minhash_shingle_size)
    member_shingles = build_shingles(member_text, shingle_size=cfg.minhash_shingle_size)
    jaccard_score = jaccard_similarity(primary_shingles, member_shingles)

    primary_vec = hashed_text_embedding(primary_text, dims=cfg.doc_embedding_dims)
    member_vec = hashed_text_embedding(member_text, dims=cfg.doc_embedding_dims)
    cosine_score = cosine_similarity(primary_vec, member_vec)
    return max(jaccard_score, cosine_score)


def run_exact_for_document(db, doc, dry_run: bool = False) -> dict:
    models = _load_models()

    if (doc.dedup_status or "").lower() == "ignored":
        return {"status": "ignored", "is_exact_duplicate": False}

    hash_filters = []
    if doc.file_sha256:
        hash_filters.append(models.Document.file_sha256 == doc.file_sha256)
    if doc.normalized_text_sha256:
        hash_filters.append(models.Document.normalized_text_sha256 == doc.normalized_text_sha256)

    if not hash_filters:
        return {"status": "no_hash", "is_exact_duplicate": False}

    candidates = (
        db.query(models.Document)
        .filter(models.Document.id != doc.id)
        .filter(models.Document.dedup_status != "ignored")
        .filter(_sql_or(*hash_filters))
        .all()
    )

    if not candidates:
        if (doc.dedup_status or "").lower() == "exact_dup":
            _apply_doc_dedup_fields(doc, dedup_status="unique", primary_doc_id=None, cluster_id=None)
        return {"status": "unique", "is_exact_duplicate": False}

    members = [doc] + [candidate for candidate in candidates if candidate.id != doc.id]
    members = {member.id: member for member in members}.values()
    member_ids = sorted(member.id for member in members)
    primary_doc_id = min(member_ids)
    hash_key = doc.file_sha256 or doc.normalized_text_sha256 or f"doc:{doc.id}"

    if dry_run:
        return {
            "status": "dry_run",
            "is_exact_duplicate": doc.id != primary_doc_id,
            "primary_doc_id": primary_doc_id,
            "member_doc_ids": member_ids,
            "hash_key": hash_key,
        }

    cluster = _ensure_cluster(
        db,
        method="exact",
        primary_doc_id=primary_doc_id,
        threshold_used={"type": "exact_hash", "hash": hash_key},
        notes=hash_key,
    )
    _delete_doc_memberships(db, member_ids)

    members_by_id = {member.id: member for member in members}
    for member_id in member_ids:
        member_doc = members_by_id[member_id]
        is_primary = member_id == primary_doc_id
        score = 1.0 if is_primary else 0.999

        _upsert_cluster_member(
            db,
            cluster_id=cluster.id,
            doc_id=member_id,
            similarity_score=score,
            is_primary=is_primary,
        )

        if is_primary:
            _apply_doc_dedup_fields(
                member_doc,
                dedup_status="unique",
                primary_doc_id=primary_doc_id,
                cluster_id=cluster.id,
            )
        else:
            _apply_doc_dedup_fields(
                member_doc,
                dedup_status="exact_dup",
                primary_doc_id=primary_doc_id,
                cluster_id=cluster.id,
            )

    db.flush()
    _cleanup_empty_clusters(db)
    return {
        "status": "exact_clustered",
        "is_exact_duplicate": doc.id != primary_doc_id,
        "primary_doc_id": primary_doc_id,
        "cluster_id": cluster.id,
        "member_doc_ids": member_ids,
    }


def run_near_scan(
    db,
    target_doc_ids: Iterable[int] | None = None,
    dry_run: bool = False,
    config: DedupThresholdConfig | None = None,
) -> dict:
    models = _load_models()
    cfg = config or DedupThresholdConfig.from_env()

    query = (
        db.query(models.Document)
        .filter(models.Document.dedup_status != "ignored")
        .filter(models.Document.content_text.isnot(None))
        .filter(models.Document.dedup_status != "exact_dup")
        .order_by(models.Document.id.asc())
    )
    documents = query.all()
    text_map = _build_doc_text_map(documents)
    if len(text_map) < 2:
        return {"status": "not_enough_documents", "clusters": []}

    near_method, near_pairs, threshold_used = _find_near_pairs(text_map=text_map, cfg=cfg)
    if not near_pairs:
        if not dry_run:
            for document in documents:
                if (document.dedup_status or "").lower() == "near_dup":
                    _apply_doc_dedup_fields(document, "unique", None, None)
        return {"status": "no_near_pairs", "clusters": [], "near_method": near_method}

    parents, ranks = _create_union_find(text_map.keys())
    for left_id, right_id, _ in near_pairs:
        _union(parents, ranks, left_id, right_id)

    grouped: Dict[int, List[int]] = {}
    for doc_id in text_map.keys():
        root = _find(parents, doc_id)
        grouped.setdefault(root, []).append(doc_id)

    clusters = [sorted(member_ids) for member_ids in grouped.values() if len(member_ids) >= 2]
    if target_doc_ids:
        target_set = {int(doc_id) for doc_id in target_doc_ids}
        clusters = [cluster for cluster in clusters if target_set.intersection(cluster)]

    if dry_run:
        summaries = []
        for member_ids in clusters:
            primary_doc_id = min(member_ids)
            summaries.append(
                {
                    "primary_doc_id": primary_doc_id,
                    "member_doc_ids": member_ids,
                    "size": len(member_ids),
                }
            )
        return {
            "status": "dry_run",
            "pair_count": len(near_pairs),
            "clusters": summaries,
            "near_method": near_method,
        }

    near_clusters = (
        db.query(models.DedupCluster)
        .filter(models.DedupCluster.method.in_(["minhash", "doc_embedding", "hybrid"]))
        .all()
    )
    near_cluster_ids = [cluster.id for cluster in near_clusters]
    if near_cluster_ids:
        db.query(models.DedupClusterMember).filter(
            models.DedupClusterMember.cluster_id.in_(near_cluster_ids)
        ).delete(synchronize_session=False)
        db.query(models.DedupCluster).filter(models.DedupCluster.id.in_(near_cluster_ids)).delete(
            synchronize_session=False
        )

    docs_by_id = {document.id: document for document in documents}
    for document in documents:
        if (document.dedup_status or "").lower() == "near_dup":
            _apply_doc_dedup_fields(document, "unique", None, None)

    created_clusters = []
    for member_ids in clusters:
        primary_doc_id = min(member_ids)
        cluster = _ensure_cluster(
            db,
            method=near_method,
            primary_doc_id=primary_doc_id,
            threshold_used=threshold_used,
            notes="near_scan",
        )

        for member_id in member_ids:
            member_doc = docs_by_id.get(member_id)
            if member_doc is None:
                continue

            is_primary = member_id == primary_doc_id
            similarity = _similarity_to_primary(
                primary_doc_id=primary_doc_id,
                member_doc_id=member_id,
                text_map=text_map,
                cfg=cfg,
                near_method=near_method,
            )
            _upsert_cluster_member(
                db,
                cluster_id=cluster.id,
                doc_id=member_id,
                similarity_score=similarity,
                is_primary=is_primary,
            )

            if is_primary:
                _apply_doc_dedup_fields(
                    member_doc,
                    dedup_status="unique",
                    primary_doc_id=primary_doc_id,
                    cluster_id=cluster.id,
                )
            else:
                _apply_doc_dedup_fields(
                    member_doc,
                    dedup_status="near_dup",
                    primary_doc_id=primary_doc_id,
                    cluster_id=cluster.id,
                )

        created_clusters.append(
            {
                "cluster_id": cluster.id,
                "primary_doc_id": primary_doc_id,
                "member_doc_ids": member_ids,
            }
        )

    db.flush()
    _cleanup_empty_clusters(db)
    return {
        "status": "clustered",
        "pair_count": len(near_pairs),
        "clusters": created_clusters,
        "near_method": near_method,
    }


def _best_match_for_doc(
    *,
    doc_id: int,
    text_map: Dict[int, str],
    cfg: DedupThresholdConfig,
) -> Tuple[str, int | None, float]:
    method = _normalize_near_method(cfg.near_dup_method)

    if method == "minhash":
        best_doc_id, score = best_near_match_for_doc(
            target_doc_id=doc_id,
            text_by_doc=text_map,
            shingle_size=cfg.minhash_shingle_size,
            num_perm=cfg.minhash_num_perm,
            bands=cfg.minhash_bands,
            threshold=cfg.near_dup_jaccard_threshold,
        )
        return "minhash", best_doc_id, score

    if method == "doc_embedding":
        best_doc_id, score = best_embedding_match_for_doc(
            target_doc_id=doc_id,
            text_by_doc=text_map,
            cosine_threshold=cfg.near_dup_cosine_threshold,
            dims=cfg.doc_embedding_dims,
            simhash_bands=cfg.doc_embedding_simhash_bands,
        )
        return "doc_embedding", best_doc_id, score

    minhash_doc_id, minhash_score = best_near_match_for_doc(
        target_doc_id=doc_id,
        text_by_doc=text_map,
        shingle_size=cfg.minhash_shingle_size,
        num_perm=cfg.minhash_num_perm,
        bands=cfg.minhash_bands,
        threshold=cfg.near_dup_jaccard_threshold,
    )
    embedding_doc_id, embedding_score = best_embedding_match_for_doc(
        target_doc_id=doc_id,
        text_by_doc=text_map,
        cosine_threshold=cfg.near_dup_cosine_threshold,
        dims=cfg.doc_embedding_dims,
        simhash_bands=cfg.doc_embedding_simhash_bands,
    )

    if embedding_score > minhash_score:
        return "hybrid", embedding_doc_id, embedding_score
    return "hybrid", minhash_doc_id, minhash_score


def _threshold_used_for_method(near_method: str, cfg: DedupThresholdConfig) -> dict:
    if near_method == "minhash":
        return {
            "near_dup_method": "minhash",
            "near_dup_jaccard_threshold": cfg.near_dup_jaccard_threshold,
            "minhash_num_perm": cfg.minhash_num_perm,
            "minhash_bands": cfg.minhash_bands,
            "minhash_shingle_size": cfg.minhash_shingle_size,
        }
    if near_method == "doc_embedding":
        return {
            "near_dup_method": "doc_embedding",
            "near_dup_cosine_threshold": cfg.near_dup_cosine_threshold,
            "doc_embedding_dims": cfg.doc_embedding_dims,
            "doc_embedding_simhash_bands": cfg.doc_embedding_simhash_bands,
        }
    return {
        "near_dup_method": "hybrid",
        "near_dup_jaccard_threshold": cfg.near_dup_jaccard_threshold,
        "near_dup_cosine_threshold": cfg.near_dup_cosine_threshold,
        "minhash_num_perm": cfg.minhash_num_perm,
        "minhash_bands": cfg.minhash_bands,
        "minhash_shingle_size": cfg.minhash_shingle_size,
        "doc_embedding_dims": cfg.doc_embedding_dims,
        "doc_embedding_simhash_bands": cfg.doc_embedding_simhash_bands,
    }


def _near_threshold_for_method(near_method: str, cfg: DedupThresholdConfig) -> float:
    if near_method == "doc_embedding":
        return cfg.near_dup_cosine_threshold
    if near_method == "hybrid":
        return min(cfg.near_dup_jaccard_threshold, cfg.near_dup_cosine_threshold)
    return cfg.near_dup_jaccard_threshold


def run_near_for_document(db, doc, dry_run: bool = False, config: DedupThresholdConfig | None = None) -> dict:
    models = _load_models()
    cfg = config or DedupThresholdConfig.from_env()

    if (doc.dedup_status or "").lower() in {"ignored", "exact_dup"}:
        return {"status": "skipped", "reason": doc.dedup_status}
    if not doc.content_text:
        return {"status": "no_text"}

    candidates = (
        db.query(models.Document)
        .filter(models.Document.id != doc.id)
        .filter(models.Document.content_text.isnot(None))
        .filter(models.Document.dedup_status != "ignored")
        .filter(models.Document.dedup_status != "exact_dup")
        .all()
    )
    text_map = _build_doc_text_map([doc] + candidates)

    near_method, best_doc_id, score = _best_match_for_doc(doc_id=doc.id, text_map=text_map, cfg=cfg)
    threshold = _near_threshold_for_method(near_method, cfg)

    if best_doc_id is None or score < threshold:
        if (doc.dedup_status or "").lower() == "near_dup":
            _apply_doc_dedup_fields(doc, dedup_status="unique", primary_doc_id=None, cluster_id=None)
        return {"status": "no_near_match", "best_score": score, "near_method": near_method}

    candidate_doc = next((item for item in candidates if item.id == best_doc_id), None)
    if candidate_doc is None:
        return {"status": "candidate_missing", "best_score": score, "near_method": near_method}

    candidate_cluster = None
    if candidate_doc.dedup_cluster_id:
        candidate_cluster = (
            db.query(models.DedupCluster)
            .filter(models.DedupCluster.id == candidate_doc.dedup_cluster_id)
            .filter(models.DedupCluster.method.in_(["minhash", "doc_embedding", "hybrid"]))
            .first()
        )

    primary_doc_id = candidate_doc.dedup_primary_doc_id or min(candidate_doc.id, doc.id)
    if dry_run:
        return {
            "status": "dry_run",
            "primary_doc_id": primary_doc_id,
            "matched_doc_id": candidate_doc.id,
            "similarity": score,
            "near_method": near_method,
        }

    if candidate_cluster is None:
        candidate_cluster = _ensure_cluster(
            db,
            method=near_method,
            primary_doc_id=primary_doc_id,
            threshold_used=_threshold_used_for_method(near_method, cfg),
            notes="pipeline_near",
        )
        _delete_doc_memberships(db, [candidate_doc.id])
        _upsert_cluster_member(
            db,
            cluster_id=candidate_cluster.id,
            doc_id=candidate_doc.id,
            similarity_score=1.0 if candidate_doc.id == primary_doc_id else score,
            is_primary=(candidate_doc.id == primary_doc_id),
        )

        if candidate_doc.id == primary_doc_id:
            _apply_doc_dedup_fields(candidate_doc, "unique", primary_doc_id, candidate_cluster.id)
        else:
            _apply_doc_dedup_fields(candidate_doc, "near_dup", primary_doc_id, candidate_cluster.id)

    _delete_doc_memberships(db, [doc.id])
    _upsert_cluster_member(
        db,
        cluster_id=candidate_cluster.id,
        doc_id=doc.id,
        similarity_score=score,
        is_primary=(doc.id == primary_doc_id),
    )
    if doc.id == primary_doc_id:
        _apply_doc_dedup_fields(doc, "unique", primary_doc_id, candidate_cluster.id)
    else:
        _apply_doc_dedup_fields(doc, "near_dup", primary_doc_id, candidate_cluster.id)

    candidate_cluster.primary_doc_id = primary_doc_id
    candidate_cluster.updated_at = _utcnow_iso()
    db.flush()
    _cleanup_empty_clusters(db)

    return {
        "status": "near_clustered",
        "primary_doc_id": primary_doc_id,
        "matched_doc_id": candidate_doc.id,
        "similarity": score,
        "cluster_id": candidate_cluster.id,
        "near_method": near_method,
    }


def set_document_ignored(db, doc, actor: str = "system", note: str = "") -> dict:
    previous_status = (doc.dedup_status or "unique").lower()
    previous_cluster_id = doc.dedup_cluster_id
    previous_primary_doc_id = doc.dedup_primary_doc_id

    _delete_doc_memberships(db, [doc.id])
    doc.dedup_status = "ignored"
    doc.dedup_primary_doc_id = None
    doc.dedup_cluster_id = None
    _cleanup_empty_clusters(db)

    _append_audit_log(
        db,
        action="ignore_document",
        actor=actor,
        cluster_id=previous_cluster_id,
        doc_id=doc.id,
        previous_primary_doc_id=previous_primary_doc_id,
        new_primary_doc_id=None,
        details={"previous_status": previous_status, "note": note},
    )

    return {
        "status": "ignored",
        "doc_id": doc.id,
    }


def set_cluster_primary(
    db,
    cluster,
    primary_doc_id: int,
    actor: str = "system",
    note: str = "",
) -> dict:
    models = _load_models()
    previous_primary_doc_id = cluster.primary_doc_id

    members = (
        db.query(models.DedupClusterMember)
        .filter(models.DedupClusterMember.cluster_id == cluster.id)
        .all()
    )
    member_doc_ids = [member.doc_id for member in members]
    if primary_doc_id not in member_doc_ids:
        raise ValueError("Primary document must be a cluster member.")

    docs = db.query(models.Document).filter(models.Document.id.in_(member_doc_ids)).all()
    docs_by_id = {doc.id: doc for doc in docs}

    for member in members:
        is_primary = member.doc_id == primary_doc_id
        member.is_primary = is_primary

        document = docs_by_id.get(member.doc_id)
        if document is None:
            continue

        if is_primary:
            _apply_doc_dedup_fields(document, "unique", primary_doc_id, cluster.id)
        else:
            dedup_status = "exact_dup" if cluster.method == "exact" else "near_dup"
            _apply_doc_dedup_fields(document, dedup_status, primary_doc_id, cluster.id)

    cluster.primary_doc_id = primary_doc_id
    cluster.updated_at = _utcnow_iso()

    _append_audit_log(
        db,
        action="set_primary",
        actor=actor,
        cluster_id=cluster.id,
        doc_id=primary_doc_id,
        previous_primary_doc_id=previous_primary_doc_id,
        new_primary_doc_id=primary_doc_id,
        details={"method": cluster.method, "note": note},
    )

    return {
        "status": "primary_updated",
        "cluster_id": cluster.id,
        "primary_doc_id": primary_doc_id,
    }
