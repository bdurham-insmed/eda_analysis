import json
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy import text


def test_archived_workflow_returns_409(client, seeded_workflow, database_url):
    """
    POST /jobs against a workflow whose parent is archived returns 409 workflow_archived.
    """
    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE workflows SET archived_at = NOW() WHERE id = :id"),
            {"id": seeded_workflow["workflow_id"]},
        )
    engine.dispose()
    res = client.post(
        "/jobs",
        json={
            "workflow_version_id": seeded_workflow["version_id"],
            "parameters": {"reference_genome": "hg38"},
            "count": 1,
        },
    )
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "workflow_archived"


def test_archived_version_returns_409(client, seeded_workflow, database_url):
    """
    POST /jobs against an archived version returns 409 version_archived.
    """
    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE workflow_versions SET archived_at = NOW() WHERE id = :id"),
            {"id": seeded_workflow["version_id"]},
        )
    engine.dispose()
    res = client.post(
        "/jobs",
        json={
            "workflow_version_id": seeded_workflow["version_id"],
            "parameters": {"reference_genome": "hg38"},
            "count": 1,
        },
    )
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "version_archived"


def test_draft_version_returns_409(client, seeded_workflow, database_url):
    """
    POST /jobs against a draft version returns 409 version_not_published.
    """
    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE workflow_versions SET status = 'draft' WHERE id = :id"),
            {"id": seeded_workflow["version_id"]},
        )
    engine.dispose()
    res = client.post(
        "/jobs",
        json={
            "workflow_version_id": seeded_workflow["version_id"],
            "parameters": {"reference_genome": "hg38"},
            "count": 1,
        },
    )
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "version_not_published"


def test_archived_parameter_returns_409(client, seeded_workflow, database_url):
    """
    POST /jobs returns 409 parameter_archived if a mapped parameter is archived.
    """
    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE workflow_parameters SET archived_at = NOW() WHERE id = :id"),
            {"id": seeded_workflow["reference_param_id"]},
        )
    engine.dispose()
    res = client.post(
        "/jobs",
        json={
            "workflow_version_id": seeded_workflow["version_id"],
            "parameters": {"reference_genome": "hg38"},
            "count": 1,
        },
    )
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["error"] == "parameter_archived"
    assert detail["parameter"] == "reference_genome"


def test_missing_gcs_object_returns_400(monkeypatch, client, initiator_module, seeded_workflow):
    """
    With GCS_BUCKET set, a missing object should yield 400 file_not_found.
    """
    monkeypatch.setenv("GCS_BUCKET", "fake-bucket")
    fake_blob = MagicMock()
    fake_blob.exists.return_value = False
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    monkeypatch.setattr(initiator_module, "get_bucket", lambda: fake_bucket)
    res = client.post(
        "/jobs",
        json={
            "workflow_version_id": seeded_workflow["version_id"],
            "parameters": {
                "reference_genome": "hg38",
                "fastq_url": "gs://fake-bucket/uploads/1/abc/x.fastq",
            },
            "count": 1,
        },
    )
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert detail["error"] == "file_not_found"
    assert detail["parameter"] == "fastq_url"


def test_happy_path_emits_started_event(client, initiator_module, seeded_workflow):
    """
    Successful POST /jobs produces a STARTED event with workflow + version metadata.
    """
    res = client.post(
        "/jobs",
        json={
            "workflow_version_id": seeded_workflow["version_id"],
            "parameters": {"reference_genome": "hg38"},
            "count": 1,
        },
    )
    assert res.status_code == 202, res.text
    initiator_module.kafka_producer.flush.assert_called()
    started_calls = [
        c
        for c in initiator_module.kafka_producer.produce.call_args_list
        if json.loads(c.kwargs["value"])["event_type"] == "STARTED"
    ]
    assert started_calls, "expected at least one STARTED event"
    payload = json.loads(started_calls[0].kwargs["value"])
    assert payload["workflow_id"] == seeded_workflow["workflow_id"]
    assert payload["workflow_version_id"] == seeded_workflow["version_id"]
    assert payload["version_number"] == 1
    assert payload["name"] == "seed"
    assert isinstance(payload["steps"], list)
    assert payload["steps"][0]["step_order"] == 0
