"""Tests for the consumer-loop semantics: poison messages, step-count guard, commit discipline.

We don't drive `_run()` end-to-end (that owns signal handlers and a real Kafka client). Instead,
we exercise the same decision logic by feeding a FakeConsumer/FakeProducer through a helper
that mirrors the per-message branch in `_run()`.
"""

import json

from .conftest import FakeConsumer
from .conftest import FakeProducer


class FakeMessage:
    """Mimic a confluent_kafka Message just enough for the worker loop's branches."""

    def __init__(self, value: bytes, err=None):
        self._value = value
        self._err = err

    def value(self):
        """Return the message bytes."""
        return self._value

    def error(self):
        """Return the message error (None for a healthy message)."""
        return self._err


def _process_one(worker_module, msg, producer, consumer, simulate_raises=False):
    """Inline reproduction of `_run()`'s per-message branch (kept in sync with main.py)."""
    if msg.error():
        return
    try:
        command = json.loads(msg.value().decode("utf-8"))
    except json.JSONDecodeError:
        consumer.commit(asynchronous=False)
        return

    total_sleep = sum(s["duration"] for s in command.get("steps", []))
    if total_sleep + worker_module.SAFETY_MARGIN_S >= worker_module.MAX_POLL_INTERVAL_S:
        consumer.commit(asynchronous=False)
        return

    try:
        if simulate_raises:
            raise RuntimeError("simulate exploded")
        worker_module.simulate(command, producer)
        producer.flush()
    except Exception:
        return  # NOT committed — redelivery will retry

    consumer.commit(asynchronous=False)


def _good_command():
    return {
        "event_type": "PIPELINE_REQUESTED",
        "pipeline_id": "pid-good",
        "workflow_id": 1,
        "workflow_version_id": 1,
        "version_number": 1,
        "workflow_name": "wf",
        "parameter_values": {},
        "steps": [
            {"name": "a", "duration": 0, "failure_prob": 0.0, "step_order": 0, "step_type": "processing"},
        ],
    }


def test_poison_message_is_committed_and_skipped(worker_module):
    """Unparseable JSON commits the offset and produces nothing."""
    producer = FakeProducer()
    consumer = FakeConsumer()
    msg = FakeMessage(b"{not json")

    _process_one(worker_module, msg, producer, consumer)

    assert consumer.commit_count == 1
    assert producer.produced == []


def test_step_count_guard_skips_oversize_command(worker_module):
    """A command whose total sleep exceeds the ceiling is committed and skipped."""
    cmd = _good_command()
    cmd["steps"] = [
        {"name": f"s{i}", "duration": 100, "failure_prob": 0.0, "step_order": i, "step_type": "processing"}
        for i in range(6)
    ]  # 600s total — over the 570s working ceiling
    producer = FakeProducer()
    consumer = FakeConsumer()
    msg = FakeMessage(json.dumps(cmd).encode())

    _process_one(worker_module, msg, producer, consumer)

    assert consumer.commit_count == 1
    assert producer.produced == [], "simulate() must not run for oversize commands"


def test_happy_command_is_committed_after_flush(worker_module):
    """A normal command runs, flushes, and commits exactly once."""
    producer = FakeProducer()
    consumer = FakeConsumer()
    msg = FakeMessage(json.dumps(_good_command()).encode())

    _process_one(worker_module, msg, producer, consumer)

    assert producer.flush_count == 1
    assert consumer.commit_count == 1
    assert producer.produced[0]["value"]["event_type"] == "STARTED"


def test_simulate_failure_does_not_commit(worker_module):
    """If simulate() raises, the offset is NOT committed (will be redelivered)."""
    producer = FakeProducer()
    consumer = FakeConsumer()
    msg = FakeMessage(json.dumps(_good_command()).encode())

    _process_one(worker_module, msg, producer, consumer, simulate_raises=True)

    assert consumer.commit_count == 0
