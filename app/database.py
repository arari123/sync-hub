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
    "customer_name": "VARCHAR(180)",
    "installation_site": "VARCHAR(180)",
    "business_trip_distance_km": "FLOAT",
    "cover_image_url": "VARCHAR(500)",
    "summary_milestones_json": "TEXT",
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
