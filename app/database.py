import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

_DOCUMENT_COLUMN_SPECS = {
    "file_sha256": "VARCHAR(64)",
    "normalized_text_sha256": "VARCHAR(64)",
    "dedup_status": "VARCHAR(32) DEFAULT 'unique'",
    "dedup_primary_doc_id": "INTEGER",
    "dedup_cluster_id": "INTEGER",
    "document_types": "VARCHAR(255)",
    "ai_title": "VARCHAR(255)",
    "ai_summary_short": "VARCHAR(512)",
    "project_id": "INTEGER",
}

_BUDGET_VERSION_COLUMN_SPECS = {
    "budget_detail_json": "TEXT",
}

_BUDGET_PROJECT_COLUMN_SPECS = {
    "created_by_user_id": "INTEGER",
    "manager_user_id": "INTEGER",
    "project_type": "VARCHAR(32)",
    "parent_project_id": "INTEGER",
    "customer_name": "VARCHAR(180)",
    "installation_site": "VARCHAR(180)",
    "business_trip_distance_km": "FLOAT",
    "cover_image_url": "VARCHAR(500)",
    "summary_milestones_json": "TEXT",
    "schedule_wbs_json": "TEXT",
}

def _run_schema_statement(connection, sql: str) -> None:
    try:
        connection.execute(text(sql))
    except Exception as exc:  # noqa: BLE001
        print(f"[database] schema statement skipped: {exc} | sql={sql}")


def ensure_runtime_schema() -> None:
    """Keep table/column compatibility without Alembic migrations."""
    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        if "documents" in table_names:
            existing_columns = {column["name"] for column in inspector.get_columns("documents")}

            for column_name, column_spec in _DOCUMENT_COLUMN_SPECS.items():
                if column_name in existing_columns:
                    continue
                _run_schema_statement(
                    connection,
                    f"ALTER TABLE documents ADD COLUMN {column_name} {column_spec}",
                )

            # Fill null status to preserve policy checks.
            _run_schema_statement(
                connection,
                "UPDATE documents SET dedup_status='unique' WHERE dedup_status IS NULL",
            )

            # Add indexes for dedup lookups.
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_documents_file_sha256 ON documents (file_sha256)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_documents_normalized_text_sha256 ON documents (normalized_text_sha256)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_documents_dedup_status ON documents (dedup_status)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_documents_dedup_primary_doc_id ON documents (dedup_primary_doc_id)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_documents_dedup_cluster_id ON documents (dedup_cluster_id)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents (project_id)",
            )

        if "budget_versions" in table_names:
            existing_columns = {column["name"] for column in inspector.get_columns("budget_versions")}
            for column_name, column_spec in _BUDGET_VERSION_COLUMN_SPECS.items():
                if column_name in existing_columns:
                    continue
                _run_schema_statement(
                    connection,
                    f"ALTER TABLE budget_versions ADD COLUMN {column_name} {column_spec}",
                )

        if "budget_projects" in table_names:
            existing_columns = {column["name"] for column in inspector.get_columns("budget_projects")}
            for column_name, column_spec in _BUDGET_PROJECT_COLUMN_SPECS.items():
                if column_name in existing_columns:
                    continue
                _run_schema_statement(
                    connection,
                    f"ALTER TABLE budget_projects ADD COLUMN {column_name} {column_spec}",
                )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_budget_projects_created_by_user_id ON budget_projects (created_by_user_id)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_budget_projects_manager_user_id ON budget_projects (manager_user_id)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_budget_projects_project_type ON budget_projects (project_type)",
            )
            _run_schema_statement(
                connection,
                "CREATE INDEX IF NOT EXISTS idx_budget_projects_parent_project_id ON budget_projects (parent_project_id)",
            )

    # Data migrations that rely on the schema above (safe/idempotent).
    _ensure_as_project_parent_links()


def _infer_parent_project_code(as_code: str) -> str:
    code = (as_code or "").strip()
    if not code:
        return ""

    upper = code.upper()
    suffixes = (
        "-AS",
        "_AS",
        ".AS",
        " AS",
        "-A/S",
        "_A/S",
        ".A/S",
        "-WARRANTY",
        "_WARRANTY",
        ".WARRANTY",
    )
    for suffix in suffixes:
        if upper.endswith(suffix):
            return code[: -len(suffix)].strip()
    return ""


def _ensure_as_project_parent_links() -> None:
    """Backfill AS project parenting so legacy data matches the new rule.

    Strategy (idempotent):
    - If an AS project already has parent_project_id: keep it.
    - Else if the project code looks like "<PARENT>-AS": link to equipment project with code "<PARENT>".
    - Else create/reuse a per-manager placeholder equipment project and link the AS project to it.
    """
    from sqlalchemy import func  # local import to keep module load light

    from . import models
    from .core.auth_utils import to_iso, utcnow

    session = SessionLocal()
    try:
        as_projects = (
            session.query(models.BudgetProject)
            .filter(models.BudgetProject.project_type == "as")
            .filter(models.BudgetProject.parent_project_id.is_(None))
            .order_by(models.BudgetProject.id.asc())
            .all()
        )
        if not as_projects:
            return

        # Build equipment project lookup by code (case-insensitive).
        equipment_projects = (
            session.query(models.BudgetProject)
            .filter(func.coalesce(func.nullif(models.BudgetProject.project_type, ""), "equipment") == "equipment")
            .all()
        )
        equipment_by_code: dict[str, models.BudgetProject] = {}
        for project in equipment_projects:
            code = (project.code or "").strip()
            if not code:
                continue
            equipment_by_code.setdefault(code.lower(), project)

        now_iso = to_iso(utcnow())
        placeholder_by_manager_id: dict[int, models.BudgetProject] = {}

        for project in as_projects:
            parent_id = None

            inferred_code = _infer_parent_project_code(project.code or "")
            if inferred_code:
                matched = equipment_by_code.get(inferred_code.lower())
                if matched is not None:
                    parent_id = int(matched.id)

            if parent_id is None:
                manager_id = int(project.manager_user_id or project.created_by_user_id or 0)
                if manager_id <= 0:
                    manager_id = 0

                placeholder = placeholder_by_manager_id.get(manager_id)
                if placeholder is None:
                    placeholder_code = f"AUTO-EQ-M{manager_id:04d}" if manager_id > 0 else "AUTO-EQ-UNASSIGNED"
                    existing = (
                        session.query(models.BudgetProject)
                        .filter(models.BudgetProject.code == placeholder_code)
                        .first()
                    )
                    if existing is not None:
                        placeholder = existing
                    else:
                        placeholder = models.BudgetProject(
                            name="미지정 설비 (AS 종속)",
                            code=placeholder_code,
                            description="AS 프로젝트 마이그레이션을 위해 자동 생성된 설비 프로젝트입니다.",
                            project_type="equipment",
                            parent_project_id=None,
                            customer_name=None,
                            installation_site=None,
                            business_trip_distance_km=0.0,
                            created_by_user_id=manager_id or None,
                            manager_user_id=manager_id or None,
                            current_stage="warranty",
                            created_at=now_iso,
                            updated_at=now_iso,
                        )
                        session.add(placeholder)
                        session.flush()
                    placeholder_by_manager_id[manager_id] = placeholder
                parent_id = int(placeholder.id)

            project.parent_project_id = parent_id
            if project.schedule_wbs_json:
                project.schedule_wbs_json = None
            project.updated_at = now_iso

        session.commit()
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        print(f"[database] AS project parenting migration skipped: {exc}")
    finally:
        session.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
