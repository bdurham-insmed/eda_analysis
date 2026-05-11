import json
import os
import random
import signal
import time

from confluent_kafka import Consumer
from confluent_kafka import Producer
from dotenv import load_dotenv

load_dotenv()

KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

# Step-count guard parameters. `max.poll.interval.ms` is 600 000 ms; we leave 30 s of
# headroom for STARTED/STEP events, broadcast latency, and producer flush.
MAX_POLL_INTERVAL_S = 600
SAFETY_MARGIN_S = 30

producer = Producer({"bootstrap.servers": KAFKA_BROKER})
_running = True


def _handle_sigterm(signum, frame):
    """Set the loop sentinel so the worker stops between commands on SIGTERM/SIGINT."""
    global _running
    _running = False


def produce_pipeline_event(
    producer: Producer,
    pipeline_id: str,
    workflow_name: str,
    event_type: str,
    *,
    step_name: str | None = None,
    status: str | None = None,
    error: str | None = None,
    steps: list[dict] | None = None,
    workflow_id: int | None = None,
    workflow_version_id: int | None = None,
    version_number: int | None = None,
    parameter_values: dict | None = None,
) -> None:
    """Emit a single pipeline event onto the `pipeline-events` topic.

    No per-event `flush()` is performed; callers must `flush()` before committing the
    consumer offset to guarantee at-least-once delivery.
    """
    event = {
        "pipeline_id": pipeline_id,
        "name": workflow_name,
        "event_type": event_type,
        "timestamp": time.time(),
    }
    if event_type == "STARTED":
        event["workflow_id"] = workflow_id
        event["workflow_version_id"] = workflow_version_id
        event["version_number"] = version_number
        event["parameter_values"] = parameter_values or {}
        event["steps"] = steps or []
    if step_name:
        event["step_name"] = step_name
    if status:
        event["status"] = status
    if error:
        event["error"] = error
    producer.produce("pipeline-events", key=pipeline_id, value=json.dumps(event))


def simulate(command: dict, producer: Producer) -> None:
    """Run the pipeline simulation described by `command`, emitting Kafka events as it progresses.

    `duration` and `failure_prob` for each step are read directly from the command payload —
    they were rolled by `pipeline_initiator` and are NOT re-rolled here. The failure decision
    (`random.random() < failure_prob`) is still re-rolled, which means failure outcomes are
    not deterministic across redeliveries — accepted limitation for a simulator.
    """
    pipeline_id = command["pipeline_id"]
    workflow_name = command["workflow_name"]
    steps = command["steps"]
    status = "RUNNING"

    produce_pipeline_event(
        producer,
        pipeline_id,
        workflow_name,
        "STARTED",
        status=status,
        steps=steps,
        workflow_id=command.get("workflow_id"),
        workflow_version_id=command.get("workflow_version_id"),
        version_number=command.get("version_number"),
        parameter_values=command.get("parameter_values"),
    )
    for step in steps:
        step_name = step["name"]
        produce_pipeline_event(
            producer,
            pipeline_id,
            workflow_name,
            "STEP_STARTED",
            step_name=step_name,
            status=status,
        )
        time.sleep(step["duration"])
        if random.random() < step["failure_prob"]:
            status = "FAILED"
            produce_pipeline_event(
                producer,
                pipeline_id,
                workflow_name,
                "STEP_FAILED",
                step_name=step_name,
                status=status,
                error=f"Step {step_name} failed due to error.",
            )
            produce_pipeline_event(
                producer,
                pipeline_id,
                workflow_name,
                "FAILED",
                status=status,
                error=f"Pipeline {pipeline_id} failed at step {step_name}.",
            )
            return
        produce_pipeline_event(
            producer,
            pipeline_id,
            workflow_name,
            "STEP_COMPLETED",
            step_name=step_name,
            status="COMPLETED",
        )

    produce_pipeline_event(producer, pipeline_id, workflow_name, "COMPLETED", status="COMPLETED")


def _run() -> None:
    """Subscribe to `pipeline-commands` and run each command to completion before committing."""
    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT, _handle_sigterm)

    consumer = Consumer(
        {
            "bootstrap.servers": KAFKA_BROKER,
            "group.id": "simulator-worker",
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
            "max.poll.interval.ms": MAX_POLL_INTERVAL_S * 1000,
        },
    )
    consumer.subscribe(["pipeline-commands"])

    try:
        while _running:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                print(f"Consumer error: {msg.error()}")
                continue
            try:
                command = json.loads(msg.value().decode("utf-8"))
            except json.JSONDecodeError as e:
                # Poison message: log + commit + skip to avoid crash-looping the partition.
                print(f"[POISON] failed to decode command: {e}; committing and skipping")
                consumer.commit(asynchronous=False)
                continue

            total_sleep = sum(s["duration"] for s in command.get("steps", []))
            if total_sleep + SAFETY_MARGIN_S >= MAX_POLL_INTERVAL_S:
                # Treat as poison: running this command would exceed max.poll.interval.ms
                # and get us evicted from the consumer group.
                print(
                    f"[SKIP] pipeline_id={command.get('pipeline_id')} "
                    f"total_sleep={total_sleep}s exceeds ceiling "
                    f"({MAX_POLL_INTERVAL_S - SAFETY_MARGIN_S}s); committing and skipping",
                )
                consumer.commit(asynchronous=False)
                continue

            try:
                simulate(command, producer)
                producer.flush()
            except Exception as e:
                # Do NOT commit — the next restart will redeliver and retry.
                print(f"[ERROR] simulate() failed for pipeline_id={command.get('pipeline_id')}: {e}")
                continue

            consumer.commit(asynchronous=False)
    finally:
        consumer.close()


if __name__ == "__main__":
    _run()
