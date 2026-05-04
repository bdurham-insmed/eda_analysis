import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

REPO_ROOT = Path(__file__).resolve().parents[3]
INIT_SQL_PATH = REPO_ROOT / "db_init" / "init.sql"
SERVICE_SRC = REPO_ROOT / "services" / "api_server"


@pytest.fixture(scope="session")
def postgres_container():
    """
    Spins up a Postgres container for the duration of the test session.
    """
    with PostgresContainer("postgres:17") as container:
        yield container


@pytest.fixture(scope="session")
def database_url(postgres_container) -> str:
    """
    Yields a connection URL pointing at the Postgres container.
    """
    return postgres_container.get_connection_url().replace("postgresql+psycopg2://", "postgresql://")


@pytest.fixture(autouse=True)
def fresh_schema(database_url):
    """
    Resets the schema before every test by dropping the public schema and re-running init.sql.
    """
    engine = create_engine(database_url)
    sql = INIT_SQL_PATH.read_text()
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute(sql)
        raw.commit()
    finally:
        raw.close()
    engine.dispose()
    yield


@pytest.fixture
def client(database_url, monkeypatch):
    """
    Provides a TestClient bound to the api_server FastAPI app, with DATABASE_URL pointed at the container.
    """
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.syspath_prepend(str(SERVICE_SRC))
    for mod in ("main", "queries", "schemas"):
        sys.modules.pop(mod, None)
    import importlib

    main_module = importlib.import_module("main")
    main_module.engine.dispose()
    main_module.engine = create_engine(database_url)
    with TestClient(main_module.app) as test_client:
        yield test_client
    main_module.engine.dispose()
    sys.modules.pop("main", None)
    sys.modules.pop("queries", None)
    sys.modules.pop("schemas", None)
    sys.path.remove(str(SERVICE_SRC)) if str(SERVICE_SRC) in sys.path else None
    os.environ.pop("DATABASE_URL", None)
