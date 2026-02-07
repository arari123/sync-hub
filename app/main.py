import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import models
from .core.ocr import get_ocr_worker_health
from .core.vector_store import vector_store
from .database import engine, ensure_runtime_schema
from .api import admin_debug, admin_dedup, auth, budget, documents

# Create tables
models.Base.metadata.create_all(bind=engine)
ensure_runtime_schema()

def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000")
    origins: list[str] = []
    for item in raw.split(","):
        origin = item.strip()
        if origin and origin not in origins:
            origins.append(origin)
    return origins or ["http://localhost:8000", "http://127.0.0.1:8000"]


cors_origins = _parse_cors_origins()

app = FastAPI(title="Sync-Hub API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(documents.router)
app.include_router(auth.router)
app.include_router(budget.router)
app.include_router(admin_debug.router)
app.include_router(admin_dedup.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Sync-Hub API!"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


def _db_health() -> dict:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"healthy": True}
    except Exception as exc:  # noqa: BLE001
        return {"healthy": False, "error": str(exc)}


@app.get("/health/detail")
def health_detail():
    dependencies = {
        "db": {
            "required": True,
            **_db_health(),
        },
        "elasticsearch": {
            "required": True,
            **vector_store.health_snapshot(),
        },
        "ocr_worker": {
            "required": False,
            **get_ocr_worker_health(),
        },
    }

    required_ok = all(
        dep.get("healthy", False)
        for dep in dependencies.values()
        if dep.get("required", False)
    )

    return {
        "status": "healthy" if required_ok else "degraded",
        "dependencies": dependencies,
    }
