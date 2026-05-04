import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

REPO_ROOT = Path(__file__).resolve().parents[3]
INIT_SQL_PATH = REPO_ROOT / "db_init" / "init.sql"
SERVICE_SRC = REPO_ROOT / "services" / "state_tracker"


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
    Drops and re-applies init.sql before every test.
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
def engine_(database_url):
    """
    Yields a SQLAlchemy engine bound to the test container.
    """
    eng = create_engine(database_url)
    yield eng
    eng.dispose()


@pytest.fixture
def state_tracker_module():
    """
    Imports services/state_tracker/main.py as `state_tracker_main`.
    """
    sys.path.insert(0, str(SERVICE_SRC))
    sys.modules.pop("main", None)
    import importlib

    module = importlib.import_module("main")
    yield module
    sys.modules.pop("main", None)
    if str(SERVICE_SRC) in sys.path:
        sys.path.remove(str(SERVICE_SRC))


class FakeConsumer:
    """
    Minimal fake Kafka consumer that records commit calls.
    """

    def __init__(self) -> None:
        self.commit_calls = 0

    def commit(self) -> None:
        """Records a commit call."""
        self.commit_calls += 1
