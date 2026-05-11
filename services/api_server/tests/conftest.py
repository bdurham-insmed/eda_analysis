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
    url = postgres_container.get_connection_url().replace("postgresql+psycopg2://", "postgresql://")
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}gssencmode=disable"


@pytest.fixture(scope="session")
def _initialised_schema(database_url):
    """
    Loads init.sql once per session. Tables are TRUNCATEd between tests via `fresh_schema`.
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


@pytest.fixture(autouse=True)
def fresh_schema(database_url, _initialised_schema):
    """
    Truncates all user tables before every test, resetting identity sequences.
    """
    engine = create_engine(database_url)
    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'")
        ).all()
        tables = [r[0] for r in rows]
        if tables:
            quoted = ", ".join(f'"{t}"' for t in tables)
            conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
    engine.dispose()
    yield


@pytest.fixture(scope="session")
def client(database_url, _initialised_schema):
    """
    Provides a TestClient bound to the api_server FastAPI app, with DATABASE_URL pointed at the container.

    Session-scoped: the FastAPI app, db engine, and TestClient are built once and reused across tests.
    Per-test isolation comes from the autouse `fresh_schema` TRUNCATE fixture.
    """
    prior_db_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    sys.path.insert(0, str(SERVICE_SRC))
    reloaded = [
        name
        for name in list(sys.modules)
        if name in {"main", "db", "schemas", "websocket_manager"}
        or name.startswith("queries")
        or name.startswith("routes")
    ]
    for mod in reloaded:
        sys.modules.pop(mod, None)
    import importlib

    main_module = importlib.import_module("main")
    db_module = importlib.import_module("db")
    with TestClient(main_module.app) as test_client:
        yield test_client
    db_module.engine.dispose()
    for mod in reloaded + ["main", "db"]:
        sys.modules.pop(mod, None)
    if str(SERVICE_SRC) in sys.path:
        sys.path.remove(str(SERVICE_SRC))
    if prior_db_url is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = prior_db_url
