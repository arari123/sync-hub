import math
import os
import re
from typing import Dict, List, Tuple

from dotenv import load_dotenv

load_dotenv()

ES_HOST = os.getenv("ES_HOST", "http://elasticsearch:9200")
INDEX_NAME = "documents_index"
RRF_K = 60
HYBRID_REQUIRE_KEYWORD_MATCH = (
    os.getenv("HYBRID_REQUIRE_KEYWORD_MATCH", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
QUERY_TERM_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")

try:
    from elasticsearch import Elasticsearch
except ImportError:  # pragma: no cover - runtime fallback for lightweight environments
    Elasticsearch = None


def _rrf_fuse(
    keyword_hits: List[dict],
    vector_hits: List[dict],
    top_k: int,
) -> Dict[str, dict]:
    """Reciprocal Rank Fusion over hit ids."""
    fused: Dict[str, dict] = {}
    rankings = [keyword_hits, vector_hits]

    for hit_list in rankings:
        for rank, hit in enumerate(hit_list, start=1):
            hit_id = hit.get("_id")
            if not hit_id:
                continue

            if hit_id not in fused:
                fused[hit_id] = {"hit": hit, "score": 0.0}

            fused[hit_id]["score"] += 1.0 / (RRF_K + rank)

    ranked = sorted(
        fused.items(),
        key=lambda item: item[1]["score"],
        reverse=True,
    )[:top_k]

    return {hit_id: payload for hit_id, payload in ranked}


def _dot(lhs: List[float], rhs: List[float]) -> float:
    return sum(a * b for a, b in zip(lhs, rhs))


def _norm(values: List[float]) -> float:
    return math.sqrt(_dot(values, values))


def _cosine_similarity(lhs: List[float], rhs: List[float]) -> float:
    if not lhs or not rhs or len(lhs) != len(rhs):
        return 0.0

    denom = _norm(lhs) * _norm(rhs)
    if denom == 0.0:
        return 0.0
    return _dot(lhs, rhs) / denom


class VectorStore:
    def __init__(self):
        self.index_name = INDEX_NAME
        self.client = None
        self.memory_mode = Elasticsearch is None
        self._memory_docs: Dict[str, dict] = {}

        if self.memory_mode:
            print("[vector_store] elasticsearch package not found, using in-memory store.")
            return

        self._connect()

    def _connect(self) -> bool:
        if Elasticsearch is None:
            return False

        try:
            self.client = Elasticsearch(ES_HOST)
            self.client.info()
            self.memory_mode = False
            return True
        except Exception as exc:  # noqa: BLE001
            self.client = None
            self.memory_mode = True
            print(f"[vector_store] Elasticsearch unavailable, using in-memory store: {exc}")
            return False

    def _ensure_client(self) -> bool:
        if self.client is not None and not self.memory_mode:
            return True
        return self._connect()

    def create_index_if_not_exists(self):
        if not self._ensure_client():
            return

        if self.client.indices.exists(index=self.index_name):
            try:
                self.client.indices.put_mapping(
                    index=self.index_name,
                    body={
                        "properties": {
                            "table_cell_refs": {"type": "keyword"},
                            "table_layout": {"type": "keyword"},
                        }
                    },
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[vector_store] Failed to update mapping fields: {exc}")
            return

        mapping = {
            "settings": {
                "analysis": {
                    "analyzer": {
                        "nori_analyzer": {
                            "type": "custom",
                            "tokenizer": "nori_tokenizer",
                        }
                    }
                }
            },
            "mappings": {
                "properties": {
                    "doc_id": {"type": "integer"},
                    "chunk_id": {"type": "integer"},
                    "chunk_index": {"type": "integer"},
                    "page": {"type": "integer"},
                    "chunk_type": {"type": "keyword"},
                    "section_title": {"type": "keyword"},
                    "quality_score": {"type": "float"},
                    "table_cell_refs": {"type": "keyword"},
                    "table_layout": {"type": "keyword"},
                    "chunk_schema_version": {"type": "keyword"},
                    "embedding_model_name": {"type": "keyword"},
                    "embedding_model_version": {"type": "keyword"},
                    "dedup_status": {"type": "keyword"},
                    "dedup_primary_doc_id": {"type": "integer"},
                    "dedup_cluster_id": {"type": "integer"},
                    "dedup_is_primary": {"type": "boolean"},
                    "document_types": {"type": "keyword"},
                    "ai_title": {"type": "text"},
                    "ai_summary_short": {"type": "text"},
                    "filename": {"type": "keyword"},
                    "content": {
                        "type": "text",
                        "analyzer": "nori_analyzer",
                    },
                    "raw_text": {
                        "type": "text",
                    },
                    "embedding": {
                        "type": "dense_vector",
                        "dims": 384,
                        "index": True,
                        "similarity": "cosine",
                    },
                }
            },
        }

        try:
            self.client.indices.create(index=self.index_name, body=mapping)
        except Exception as exc:  # noqa: BLE001
            self.client = None
            self.memory_mode = True
            print(f"[vector_store] Failed to create index, switching to memory mode: {exc}")

    def delete_document(self, doc_id: int):
        for key in list(self._memory_docs.keys()):
            if self._memory_docs[key].get("doc_id") == doc_id:
                del self._memory_docs[key]

        if not self._ensure_client():
            return

        try:
            self.client.delete_by_query(
                index=self.index_name,
                body={"query": {"term": {"doc_id": doc_id}}},
                refresh=True,
                conflicts="proceed",
            )
        except Exception as exc:  # noqa: BLE001
            self.client = None
            self.memory_mode = True
            print(f"[vector_store] Delete by doc_id failed, switching to memory mode: {exc}")

    def index_document(
        self,
        doc_id,
        filename,
        document_types,
        ai_title,
        ai_summary_short,
        content,
        embedding,
        chunk_id=0,
        chunk_index=None,
        page=None,
        chunk_type="paragraph",
        section_title="",
        quality_score=0.0,
        raw_text="",
        table_cell_refs="",
        table_layout="",
        chunk_schema_version="",
        embedding_model_name="",
        embedding_model_version="",
        dedup_status="unique",
        dedup_primary_doc_id=None,
        dedup_cluster_id=None,
        dedup_is_primary=True,
    ):
        chunk_key = f"{doc_id}:{chunk_id}"
        doc = {
            "doc_id": doc_id,
            "chunk_id": chunk_id,
            "chunk_index": chunk_id if chunk_index is None else chunk_index,
            "page": page,
            "chunk_type": chunk_type,
            "section_title": section_title,
            "quality_score": quality_score,
            "table_cell_refs": table_cell_refs,
            "table_layout": table_layout,
            "chunk_schema_version": chunk_schema_version,
            "embedding_model_name": embedding_model_name,
            "embedding_model_version": embedding_model_version,
            "dedup_status": dedup_status,
            "dedup_primary_doc_id": dedup_primary_doc_id,
            "dedup_cluster_id": dedup_cluster_id,
            "dedup_is_primary": dedup_is_primary,
            "document_types": document_types or [],
            "ai_title": ai_title,
            "ai_summary_short": ai_summary_short,
            "filename": filename,
            "content": content,
            "raw_text": raw_text,
            "embedding": embedding,
        }
        self._memory_docs[chunk_key] = doc

        if not self._ensure_client():
            return

        try:
            self.client.index(
                index=self.index_name,
                id=chunk_key,
                body=doc,
                refresh=True,
            )
        except Exception as exc:  # noqa: BLE001
            self.client = None
            self.memory_mode = True
            print(f"[vector_store] Indexing failed, switching to memory mode: {exc}")

    def _memory_keyword_hits(self, query_text: str, size: int) -> List[dict]:
        keyword = (query_text or "").strip().lower()
        if not keyword:
            return []

        scored = []
        for chunk_key, doc in self._memory_docs.items():
            content = (doc.get("content") or "").lower()
            filename = (doc.get("filename") or "").lower()

            score = 0.0
            if keyword in content:
                score += 2.0
            if keyword in filename:
                score += 1.0
            score += content.count(keyword) * 0.12

            if score > 0:
                scored.append(
                    {
                        "_id": chunk_key,
                        "_score": score,
                        "_source": doc,
                    }
                )

        scored.sort(key=lambda item: item.get("_score", 0.0), reverse=True)
        return scored[:size]

    def _memory_vector_hits(self, query_vector: List[float], size: int) -> List[dict]:
        if not query_vector:
            return []

        scored = []
        for chunk_key, doc in self._memory_docs.items():
            embedding = doc.get("embedding") or []
            similarity = _cosine_similarity(query_vector, embedding)
            score = similarity + 1.0

            scored.append(
                {
                    "_id": chunk_key,
                    "_score": score,
                    "_source": doc,
                }
            )

        scored.sort(key=lambda item: item.get("_score", 0.0), reverse=True)
        return scored[:size]

    def _keyword_search(self, query_text: str, size: int) -> List[dict]:
        if not query_text.strip():
            return []

        normalized_query = query_text.strip()
        wildcard_query = normalized_query.replace("*", " ").replace("?", " ").strip()
        query_terms = []
        seen_terms = set()
        for term in [normalized_query, *QUERY_TERM_RE.findall(normalized_query)]:
            cleaned = (term or "").strip()
            lowered = cleaned.lower()
            if not cleaned or len(cleaned) < 2 or lowered in seen_terms:
                continue
            seen_terms.add(lowered)
            query_terms.append(cleaned)

        should_clauses: List[dict] = [
            {
                "term": {
                    "filename": {
                        "value": normalized_query,
                        "boost": 6.0,
                    }
                }
            },
            {
                "match_phrase": {
                    "content": {
                        "query": normalized_query,
                        "boost": 4.0,
                    }
                }
            },
            {
                "match_phrase": {
                    "ai_title": {
                        "query": normalized_query,
                        "boost": 3.0,
                    }
                }
            },
            {
                "match": {
                    "ai_summary_short": {
                        "query": normalized_query,
                        "boost": 2.0,
                    }
                }
            },
            {
                "match": {
                    "content": {
                        "query": normalized_query,
                        "operator": "and",
                        "minimum_should_match": "70%",
                        "boost": 2.0,
                    }
                }
            },
            {
                "match": {
                    "content": {
                        "query": normalized_query,
                        "boost": 1.0,
                    }
                }
            },
        ]

        for token in query_terms:
            if token == normalized_query:
                continue
            safe_token = token.replace("*", " ").replace("?", " ").strip()
            if not safe_token:
                continue
            should_clauses.extend(
                [
                    {
                        "match_phrase": {
                            "content": {
                                "query": token,
                                "boost": 1.6,
                            }
                        }
                    },
                    {
                        "match_phrase": {
                            "ai_title": {
                                "query": token,
                                "boost": 1.4,
                            }
                        }
                    },
                    {
                        "wildcard": {
                            "filename": {
                                "value": f"*{safe_token}*",
                                "case_insensitive": True,
                                "boost": 2.0,
                            }
                        }
                    },
                ]
            )

        if wildcard_query:
            should_clauses.append(
                {
                    "wildcard": {
                        "filename": {
                            "value": f"*{wildcard_query}*",
                            "case_insensitive": True,
                            "boost": 3.5,
                        }
                    }
                }
            )

        body = {
            "size": size,
            "query": {
                "bool": {
                    "should": should_clauses,
                    "minimum_should_match": 1,
                }
            },
            "highlight": {
                "pre_tags": ["<em>"],
                "post_tags": ["</em>"],
                "fields": {
                    "content": {
                        "fragment_size": 200,
                        "number_of_fragments": 1,
                    }
                },
            },
        }
        response = self.client.search(index=self.index_name, body=body)
        return response.get("hits", {}).get("hits", [])

    def _vector_search(self, query_vector: List[float], size: int) -> List[dict]:
        if not query_vector:
            return []

        body = {
            "size": size,
            "query": {
                "script_score": {
                    "query": {"match_all": {}},
                    "script": {
                        "source": "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
                        "params": {"query_vector": query_vector},
                    },
                }
            },
        }
        response = self.client.search(index=self.index_name, body=body)
        return response.get("hits", {}).get("hits", [])

    def _collapse_doc_hits(self, hits: List[dict], top_k: int) -> List[dict]:
        by_doc: Dict[int, Tuple[float, dict]] = {}

        for hit in hits:
            source = hit.get("_source", {})
            doc_id = source.get("doc_id")
            if doc_id is None:
                continue

            score = float(hit.get("_score", 0.0))
            current = by_doc.get(doc_id)
            if current is None or score > current[0]:
                by_doc[doc_id] = (score, hit)

        ranked = sorted(by_doc.values(), key=lambda item: item[0], reverse=True)[:top_k]
        return [item[1] for item in ranked]

    def health_snapshot(self) -> Dict[str, object]:
        snapshot: Dict[str, object] = {
            "healthy": False,
            "mode": "memory" if self.memory_mode else "elasticsearch",
            "host": ES_HOST,
        }

        if not self._ensure_client():
            snapshot["mode"] = "memory"
            snapshot["error"] = "Elasticsearch client unavailable."
            return snapshot

        try:
            info = self.client.info()
            snapshot["healthy"] = True
            snapshot["mode"] = "elasticsearch"
            snapshot["cluster_name"] = info.get("cluster_name")
            snapshot["version"] = (info.get("version") or {}).get("number")
            return snapshot
        except Exception as exc:  # noqa: BLE001
            snapshot["healthy"] = False
            snapshot["mode"] = "memory"
            snapshot["error"] = str(exc)
            self.client = None
            self.memory_mode = True
            return snapshot

    def debug_search(self, query_text: str, query_vector: List[float], top_k: int = 10) -> Dict[str, object]:
        size = max(1, min(top_k, 100))

        if not self._ensure_client():
            keyword_hits = self._memory_keyword_hits(query_text, size)
            vector_hits = self._memory_vector_hits(query_vector, size)
        else:
            try:
                keyword_hits = self._keyword_search(query_text, size)
            except Exception as exc:  # noqa: BLE001
                print(f"[vector_store] Keyword search failed in debug mode: {exc}")
                keyword_hits = []

            try:
                vector_hits = self._vector_search(query_vector, size)
            except Exception as exc:  # noqa: BLE001
                print(f"[vector_store] Vector search failed in debug mode: {exc}")
                vector_hits = []

        fused = _rrf_fuse(keyword_hits, vector_hits, top_k=size)
        fused_hits: List[dict] = []

        keyword_hits_by_id = {hit.get("_id"): hit for hit in keyword_hits if hit.get("_id")}
        for hit_id, payload in fused.items():
            base_hit = dict(payload["hit"])
            keyword_hit = keyword_hits_by_id.get(hit_id, {})
            if "highlight" not in base_hit and isinstance(keyword_hit, dict):
                highlight = keyword_hit.get("highlight")
                if highlight:
                    base_hit["highlight"] = highlight

            base_hit["_score"] = payload["score"]
            fused_hits.append(base_hit)

        return {
            "mode": "memory" if self.memory_mode else "elasticsearch",
            "keyword_hits": keyword_hits,
            "vector_hits": vector_hits,
            "fused_hits": fused_hits,
        }

    def search(self, query_text, query_vector, top_k=5):
        candidate_size = max(top_k * 4, 10)
        debug_payload = self.debug_search(query_text, query_vector, top_k=candidate_size)
        keyword_hits = debug_payload.get("keyword_hits", [])
        vector_hits = debug_payload.get("vector_hits", [])

        if HYBRID_REQUIRE_KEYWORD_MATCH and query_text.strip() and keyword_hits and vector_hits:
            keyword_ids = {hit.get("_id") for hit in keyword_hits if hit.get("_id")}
            vector_hits = [hit for hit in vector_hits if hit.get("_id") in keyword_ids]

        if not keyword_hits and not vector_hits:
            return {"hits": {"hits": []}}

        fused = _rrf_fuse(keyword_hits, vector_hits, top_k=candidate_size)
        keyword_hits_by_id = {
            hit.get("_id"): hit
            for hit in keyword_hits
            if hit.get("_id")
        }

        fused_hits = []
        for hit_id, payload in fused.items():
            base_hit = dict(payload["hit"])
            keyword_hit = keyword_hits_by_id.get(hit_id, {})
            if "highlight" not in base_hit and isinstance(keyword_hit, dict):
                highlight = keyword_hit.get("highlight")
                if highlight:
                    base_hit["highlight"] = highlight

            base_hit["_score"] = payload["score"]
            fused_hits.append(base_hit)

        collapsed = self._collapse_doc_hits(fused_hits, top_k=top_k)
        return {"hits": {"hits": collapsed}}


vector_store = VectorStore()
