from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String

from .database import Base


class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(String)
    published = Column(Boolean, default=True)


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String)
    status = Column(String, default="pending")  # pending, processing, completed, failed
    content_text = Column(String, nullable=True)
    document_types = Column(String, nullable=True)
    ai_title = Column(String, nullable=True)
    ai_summary_short = Column(String, nullable=True)
    created_at = Column(String)

    file_sha256 = Column(String(64), nullable=True, index=True)
    normalized_text_sha256 = Column(String(64), nullable=True, index=True)
    dedup_status = Column(String, default="unique", index=True)
    dedup_primary_doc_id = Column(Integer, nullable=True, index=True)
    dedup_cluster_id = Column(Integer, ForeignKey("dedup_clusters.id"), nullable=True, index=True)


class DedupCluster(Base):
    __tablename__ = "dedup_clusters"

    id = Column(Integer, primary_key=True, index=True)
    method = Column(String, nullable=False, index=True)  # exact|minhash|doc_embedding
    primary_doc_id = Column(Integer, nullable=True, index=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    threshold_used = Column(String, nullable=True)
    notes = Column(String, nullable=True)


class DedupClusterMember(Base):
    __tablename__ = "dedup_cluster_members"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("dedup_clusters.id"), nullable=False, index=True)
    doc_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    similarity_score = Column(Float, nullable=True)
    is_primary = Column(Boolean, default=False, nullable=False)


class DedupAuditLog(Base):
    __tablename__ = "dedup_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False, index=True)
    actor = Column(String, nullable=True)
    cluster_id = Column(Integer, ForeignKey("dedup_clusters.id"), nullable=True, index=True)
    doc_id = Column(Integer, ForeignKey("documents.id"), nullable=True, index=True)
    previous_primary_doc_id = Column(Integer, nullable=True)
    new_primary_doc_id = Column(Integer, nullable=True)
    detail_json = Column(String, nullable=True)
    created_at = Column(String, nullable=False, index=True)
