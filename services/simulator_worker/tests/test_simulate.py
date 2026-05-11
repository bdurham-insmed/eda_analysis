import pytest

from .conftest import FakeProducer


def _command(steps, failure_prob=0.0, duration=0):
    """Build a PIPELINE_REQUESTED command with deterministic step values."""
    return {
        "event_type": "PIPELINE_REQUESTED",
        "pipeline_id": "pid-1",
        "workflow_id": 7,
        "workflow_version_id": 11,
        "version_number": 1,
        "workflow_name": "wf-test",
        "parameter_values": {"k": "v"},
        "steps": [
            {
                "name": name,
                "duration": duration,
                "failure_prob": failure_prob,
                "step_order": i,
                "step_type": "processing",
            }
            for i, name in enumerate(steps)
        ],
    }


def test_happy_path_emits_full_event_sequence(worker_module):
    """A 2-step command with no failures emits STARTED → STEP*2 → COMPLETED."""
    producer = FakeProducer()
    cmd = _command(["a", "b"], failure_prob=0.0, duration=0)

    worker_module.simulate(cmd, producer)

    event_types = [e["value"]["event_type"] for e in producer.produced]
    assert event_types == [
        "STARTED",
        "STEP_STARTED",
        "STEP_COMPLETED",
        "STEP_STARTED",
        "STEP_COMPLETED",
        "COMPLETED",
    ]
    started = producer.produced[0]["value"]
    assert started["workflow_id"] == 7
    assert started["workflow_version_id"] == 11
    assert started["version_number"] == 1
    assert started["parameter_values"] == {"k": "v"}
    assert started["name"] == "wf-test"
    assert started["steps"] == cmd["steps"]


def test_step_failure_short_circuits(worker_module):
    """failure_prob=1.0 on first step yields STARTED, STEP_STARTED, STEP_FAILED, FAILED."""
    producer = FakeProducer()
    cmd = _command(["a", "b"], failure_prob=1.0, duration=0)

    worker_module.simulate(cmd, producer)

    event_types = [e["value"]["event_type"] for e in producer.produced]
    assert event_types == ["STARTED", "STEP_STARTED", "STEP_FAILED", "FAILED"]


def test_no_reroll_of_pre_rolled_values(worker_module, monkeypatch):
    """The simulator must not call random.randint/random.uniform — those were pre-rolled."""

    def _boom(*args, **kwargs):
        raise AssertionError("simulator must not re-roll pre-rolled values")

    monkeypatch.setattr(worker_module.random, "randint", _boom)
    monkeypatch.setattr(worker_module.random, "uniform", _boom)

    producer = FakeProducer()
    worker_module.simulate(_command(["a"], failure_prob=0.0, duration=0), producer)

    # No exception raised → invariant holds.
    assert any(e["value"]["event_type"] == "COMPLETED" for e in producer.produced)


def test_started_event_schema_matches_state_tracker_contract(worker_module):
    """The STARTED event payload contains every field state_tracker.process_event reads."""
    producer = FakeProducer()
    cmd = _command(["a"], failure_prob=0.0, duration=0)

    worker_module.simulate(cmd, producer)

    started = producer.produced[0]["value"]
    assert started["event_type"] == "STARTED"
    assert started["pipeline_id"] == "pid-1"
    assert started["name"] == "wf-test"
    assert started["workflow_id"] == 7
    assert started["workflow_version_id"] == 11
    assert started["version_number"] == 1
    assert started["parameter_values"] == {"k": "v"}
    for step in started["steps"]:
        assert "name" in step
        assert "step_order" in step
        assert "step_type" in step


def test_simulate_propagates_produce_failure(worker_module):
    """If produce() raises mid-run, the exception propagates (caller must skip commit)."""
    producer = FakeProducer(raise_on_call=2)
    with pytest.raises(RuntimeError, match="simulated produce failure"):
        worker_module.simulate(_command(["a", "b"], failure_prob=0.0, duration=0), producer)
