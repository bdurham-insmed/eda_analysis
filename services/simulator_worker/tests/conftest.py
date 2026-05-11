import importlib
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_SRC = REPO_ROOT / "services" / "simulator_worker"


class FakeProducer:
    """Test double that records `produce` calls and `flush` invocations."""

    def __init__(self, raise_on_call: int | None = None):
        self.produced: list[dict] = []
        self.flush_count = 0
        self._raise_on_call = raise_on_call

    def produce(self, topic, key=None, value=None):
        """Record a produce call, optionally raising on the Nth call."""
        if self._raise_on_call is not None and len(self.produced) + 1 == self._raise_on_call:
            raise RuntimeError("simulated produce failure")
        self.produced.append({"topic": topic, "key": key, "value": json.loads(value)})

    def flush(self):
        """Record a flush invocation."""
        self.flush_count += 1


class FakeConsumer:
    """Test double — records commits."""

    def __init__(self):
        self.commit_count = 0

    def commit(self, asynchronous=False):
        """Record a commit call."""
        self.commit_count += 1

    def close(self):
        """No-op close; matches the Consumer interface."""


@pytest.fixture
def worker_module(monkeypatch):
    """Import the worker module fresh, with the Kafka broker env stubbed."""
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka-mock:9092")
    sys.path.insert(0, str(SERVICE_SRC))
    sys.modules.pop("main", None)

    from unittest.mock import MagicMock

    monkeypatch.setattr("confluent_kafka.Producer", MagicMock())
    monkeypatch.setattr("confluent_kafka.Consumer", MagicMock())

    module = importlib.import_module("main")
    yield module
    sys.modules.pop("main", None)
    if str(SERVICE_SRC) in sys.path:
        sys.path.remove(str(SERVICE_SRC))
