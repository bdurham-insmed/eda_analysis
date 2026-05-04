from sqlalchemy import text

from .conftest import FakeConsumer


def test_started_event_inserts_pipeline_and_steps(state_tracker_module, engine_):
    """
    A valid STARTED event creates one pipelines row plus one pipeline_steps row per step.
    """
    consumer = FakeConsumer()
    event = {
        "pipeline_id": "33333333-3333-3333-3333-333333333333",
        "name": "RNA-Seq Analysis",
        "workflow_id": 7,
        "workflow_version_id": 11,
        "version_number": 1,
        "parameter_values": {"reference_genome": "hg38"},
        "event_type": "STARTED",
        "status": "RUNNING",
        "steps": [
            {"name": "ingest", "duration": 4, "failure_prob": 0.05, "step_order": 0, "step_type": "processing"},
            {"name": "analyze", "duration": 6, "failure_prob": 0.05, "step_order": 1, "step_type": "analysis"},
        ],
    }
    state_tracker_module.process_event(
        event,
        engine=engine_,
        kafka_consumer=consumer,
        broadcast=False,
    )
    with engine_.connect() as conn:
        pipeline_row = conn.execute(
            text(
                "SELECT name, status, workflow_id, workflow_version_id, parameter_values FROM pipelines WHERE id = :id"
            ),
            {"id": event["pipeline_id"]},
        ).fetchone()
        assert pipeline_row is not None
        assert pipeline_row[0] == "RNA-Seq Analysis"
        assert pipeline_row[1] == "RUNNING"
        assert pipeline_row[2] == 7
        assert pipeline_row[3] == 11
        assert pipeline_row[4] == {"reference_genome": "hg38"}

        steps = conn.execute(
            text(
                "SELECT step_name, step_order, step_type FROM pipeline_steps "
                "WHERE pipeline_id = :id ORDER BY step_order"
            ),
            {"id": event["pipeline_id"]},
        ).fetchall()
        assert len(steps) == 2
        assert steps[0] == ("ingest", 0, "processing")
        assert steps[1] == ("analyze", 1, "analysis")
    assert consumer.commit_calls == 1
