import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

REPO_ROOT = Path(__file__).resolve().parents[3]
INIT_SQL_PATH = REPO_ROOT / "db_init" / "init.sql"
SERVICE_SRC = REPO_ROOT / "services" / "pipeline_initiator"


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
def initiator_module(database_url, monkeypatch):
    """
    Imports the pipeline_initiator package with DATABASE_URL pointed at the container,
    Kafka producer mocked out, and the upload_file_handler imports stubbed.
    """
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka-mock:9092")
    sys.path.insert(0, str(SERVICE_SRC))
    for mod in ("main", "upload_file_handler", "upload_file_handler.main"):
        sys.modules.pop(mod, None)

    fake_producer_class = MagicMock()
    monkeypatch.setattr("confluent_kafka.Producer", fake_producer_class)

    import importlib

    module = importlib.import_module("main")
    module.kafka_producer = MagicMock()
    yield module
    module.engine.dispose()
    sys.modules.pop("main", None)
    if str(SERVICE_SRC) in sys.path:
        sys.path.remove(str(SERVICE_SRC))


@pytest.fixture
def client(initiator_module):
    """
    Provides a TestClient bound to the initiator FastAPI app.
    """
    with TestClient(initiator_module.app) as test_client:
        yield test_client


@pytest.fixture
def seeded_workflow(database_url):
    """
    Seeds a workflow with a published v1 — one select parameter, one file parameter, and two steps.
    """
    engine = create_engine(database_url)
    with engine.begin() as conn:
        wf_id = conn.execute(
            text("INSERT INTO workflows (name, description) VALUES ('seed', 'desc') RETURNING id"),
        ).scalar_one()
        ref_id = conn.execute(
            text(
                "INSERT INTO workflow_parameters (name, type, options, default_value, required) "
                "VALUES ('reference_genome', 'select', ARRAY['hg19','hg38'], 'hg38', true) RETURNING id"
            ),
        ).scalar_one()
        file_id = conn.execute(
            text(
                "INSERT INTO workflow_parameters (name, type, required) "
                "VALUES ('fastq_url', 'file', false) RETURNING id"
            ),
        ).scalar_one()
        version_id = conn.execute(
            text(
                "INSERT INTO workflow_versions (workflow_id, version_number, status, published_at) "
                "VALUES (:w, 1, 'published', NOW()) RETURNING id"
            ),
            {"w": wf_id},
        ).scalar_one()
        for pid in (ref_id, file_id):
            conn.execute(
                text("INSERT INTO workflow_version_parameters (workflow_version_id, parameter_id) VALUES (:v, :p)"),
                {"v": version_id, "p": pid},
            )
        conn.execute(
            text(
                "INSERT INTO workflow_version_steps "
                "(workflow_version_id, step_order, step_name, step_type) "
                "VALUES (:v, 0, 'ingest', 'processing'), (:v, 1, 'analyze', 'analysis')"
            ),
            {"v": version_id},
        )
    engine.dispose()
    return {
        "workflow_id": wf_id,
        "version_id": version_id,
        "reference_param_id": ref_id,
        "file_param_id": file_id,
    }
