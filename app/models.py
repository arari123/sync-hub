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


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    full_name = Column(String(120), nullable=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=False, nullable=False, index=True)
    email_verified = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(String, nullable=False, index=True)
    updated_at = Column(String, nullable=False)


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(String, nullable=False, index=True)
    consumed_at = Column(String, nullable=True, index=True)
    created_at = Column(String, nullable=False, index=True)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(String, nullable=False, index=True)
    revoked_at = Column(String, nullable=True, index=True)
    created_at = Column(String, nullable=False, index=True)


class BudgetProject(Base):
    __tablename__ = "budget_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    code = Column(String(64), nullable=True, unique=True, index=True)
    description = Column(String(500), nullable=True)
    customer_name = Column(String(180), nullable=True)
    installation_site = Column(String(180), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    current_stage = Column(String(32), nullable=False, default="review", index=True)
    created_at = Column(String, nullable=False, index=True)
    updated_at = Column(String, nullable=False, index=True)


class BudgetVersion(Base):
    __tablename__ = "budget_versions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("budget_projects.id"), nullable=False, index=True)
    stage = Column(String(32), nullable=False, index=True)  # review|progress|closure
    status = Column(String(32), nullable=False, index=True)  # draft|confirmed|revision
    version_no = Column(Integer, nullable=False, default=1, index=True)
    revision_no = Column(Integer, nullable=False, default=0, index=True)
    parent_version_id = Column(Integer, ForeignKey("budget_versions.id"), nullable=True, index=True)
    change_reason = Column(String(500), nullable=True)
    budget_detail_json = Column(String, nullable=True)
    is_current = Column(Boolean, nullable=False, default=True, index=True)
    confirmed_at = Column(String, nullable=True, index=True)
    created_at = Column(String, nullable=False, index=True)
    updated_at = Column(String, nullable=False, index=True)


class BudgetEquipment(Base):
    __tablename__ = "budget_equipments"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("budget_versions.id"), nullable=False, index=True)
    equipment_name = Column(String(180), nullable=False, index=True)
    material_fab_cost = Column(Float, nullable=False, default=0.0)
    material_install_cost = Column(Float, nullable=False, default=0.0)
    labor_fab_cost = Column(Float, nullable=False, default=0.0)
    labor_install_cost = Column(Float, nullable=False, default=0.0)
    expense_fab_cost = Column(Float, nullable=False, default=0.0)
    expense_install_cost = Column(Float, nullable=False, default=0.0)
    currency = Column(String(8), nullable=False, default="KRW")
    sort_order = Column(Integer, nullable=False, default=0, index=True)
    created_at = Column(String, nullable=False, index=True)
    updated_at = Column(String, nullable=False, index=True)
