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


def test_happy_path_emits_pipeline_requested_command(client, initiator_module, seeded_workflow):
    """
    Successful POST /jobs produces exactly one PIPELINE_REQUESTED command on `pipeline-commands`
    with the workflow/version metadata and pre-rolled step durations/failure probabilities.
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
    initiator_module.kafka_producer.flush.assert_called_once()

    produce_calls = initiator_module.kafka_producer.produce.call_args_list
    assert len(produce_calls) == 1, f"expected 1 produce call, got {len(produce_calls)}"
    call = produce_calls[0]
    assert call.args[0] == "pipeline-commands" or call.kwargs.get("topic") == "pipeline-commands"

    payload = json.loads(call.kwargs["value"])
    assert payload["event_type"] == "PIPELINE_REQUESTED"
    assert payload["workflow_id"] == seeded_workflow["workflow_id"]
    assert payload["workflow_version_id"] == seeded_workflow["version_id"]
    assert payload["version_number"] == 1
    assert payload["workflow_name"] == "seed"
    assert "pipeline_id" in payload and payload["pipeline_id"]
    assert call.kwargs["key"] == payload["pipeline_id"]
    assert isinstance(payload["steps"], list) and payload["steps"]
    for step in payload["steps"]:
        assert "name" in step
        assert isinstance(step["duration"], int)
        assert isinstance(step["failure_prob"], float)
        assert "step_order" in step
        assert "step_type" in step


def test_multiple_count_emits_one_command_per_run(client, initiator_module, seeded_workflow):
    """
    POST /jobs with count=3 produces 3 distinct commands and exactly one final flush().
    """
    res = client.post(
        "/jobs",
        json={
            "workflow_version_id": seeded_workflow["version_id"],
            "parameters": {"reference_genome": "hg38"},
            "count": 3,
        },
    )
    assert res.status_code == 202, res.text
    initiator_module.kafka_producer.flush.assert_called_once()

    produce_calls = initiator_module.kafka_producer.produce.call_args_list
    assert len(produce_calls) == 3
    pipeline_ids = {json.loads(c.kwargs["value"])["pipeline_id"] for c in produce_calls}
    assert len(pipeline_ids) == 3, "expected 3 distinct pipeline_ids"
