import asyncio
import json
import os
import time

import aiohttp
from confluent_kafka import Consumer
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy import text

load_dotenv()

KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@db/postgres")
API_BROADCAST_URL = os.getenv("API_BROADCAST_URL", "http://api:8000/internal/broadcast")


async def send_broadcast(
    pipeline_id: str,
    name: str,
    status: str,
    event_type: str,
    step_name: str | None = None,
) -> None:
    """
    Sends a broadcast message to the API server about the pipeline event update.
    """
    payload = {
        "pipeline_id": pipeline_id,
        "name": name,
        "status": status,
        "event_type": event_type,
        "step_name": step_name,
        "timestamp": time.time(),
    }

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(API_BROADCAST_URL, json=payload, timeout=2) as resp:
                if resp.status != 200:
                    print(f"Broadcast failed with status code: {resp.status}")
                else:
                    print(f"Broadcast successful with status code: {resp.status}")
        except Exception as e:
            print(f"Failed to send broadcast: {e}")


def calculate_pipeline_status(event: dict, current_steps: list) -> str:
    """
    Calculates the overall pipeline status based on the event and current step statuses.
    """
    if event["event_type"] in ["FAILED", "STEP_FAILED"]:
        return "FAILED"
    completed_steps = {step["name"] for step in current_steps if step["status"] == "COMPLETED"}
    if len(completed_steps) == len(current_steps):
        return "COMPLETED"
    return "RUNNING"


def process_event(event: dict, *, engine, kafka_consumer, broadcast: bool = True) -> None:
    """
    Processes a single pipeline event. Extracted from the main loop so it is unit-testable.
    """
    pipeline_id = event["pipeline_id"]
    event_type = event["event_type"]
    name = event["name"]

    with engine.begin() as connection:
        if event_type == "STARTED":
            steps = event["steps"]
            if not isinstance(steps, list):
                raise ValueError(f"STARTED event has malformed steps payload: {type(steps)}")
            connection.execute(
                text("""
                INSERT INTO pipelines
                    (id, name, status, start_time, workflow_id, workflow_version_id, parameter_values)
                VALUES
                    (:pipeline_id, :name, 'RUNNING', NOW(),
                     :workflow_id, :workflow_version_id, CAST(:parameter_values AS JSONB))
                ON CONFLICT (id) DO NOTHING
                """),
                {
                    "pipeline_id": pipeline_id,
                    "name": name,
                    "workflow_id": event.get("workflow_id"),
                    "workflow_version_id": event.get("workflow_version_id"),
                    "parameter_values": json.dumps(event.get("parameter_values") or {}),
                },
            )
            for step in steps:
                connection.execute(
                    text("""
                    INSERT INTO pipeline_steps (pipeline_id, step_name, status, start_time, step_order, step_type)
                    VALUES (:pipeline_id, :step_name, 'PENDING', NULL, :step_order, :step_type)
                    ON CONFLICT (pipeline_id, step_name) DO NOTHING
                    """),
                    {
                        "pipeline_id": pipeline_id,
                        "step_name": step["name"],
                        "step_order": step.get("step_order"),
                        "step_type": step.get("step_type"),
                    },
                )
        connection.execute(
            text("""
            INSERT INTO events (pipeline_id, event_type, timestamp, payload)
            VALUES (:pipeline_id, :event_type, NOW(), :payload)
            """),
            {
                "pipeline_id": pipeline_id,
                "event_type": event_type,
                "payload": json.dumps(event),
            },
        )
        if event_type == "STEP_STARTED":
            connection.execute(
                text("""
                UPDATE pipeline_steps
                SET status = 'RUNNING', start_time = NOW()
                WHERE pipeline_id = :pipeline_id AND step_name = :step_name
                """),
                {"pipeline_id": pipeline_id, "step_name": event["step_name"]},
            )
        elif event_type in ["STEP_COMPLETED", "STEP_FAILED"]:
            step_status = "COMPLETED" if event_type == "STEP_COMPLETED" else "FAILED"
            connection.execute(
                text("""
                UPDATE pipeline_steps
                SET status = :status, end_time = NOW()
                WHERE pipeline_id = :pipeline_id AND step_name = :step_name
                """),
                {
                    "status": step_status,
                    "pipeline_id": pipeline_id,
                    "step_name": event["step_name"],
                },
            )
        elif event_type in ["COMPLETED", "FAILED"]:
            step_status = "COMPLETED" if event_type == "COMPLETED" else "FAILED"
            connection.execute(
                text("""
                    UPDATE pipeline_steps
                    SET status   = 'CANCELLED'
                    WHERE pipeline_id = :pipeline_id
                      AND status = 'PENDING'
                    """),
                {"pipeline_id": pipeline_id, "step_status": step_status},
            )
            connection.execute(
                text("""
                UPDATE pipelines
                SET status = :step_status, end_time = NOW()
                WHERE id = :pipeline_id
                """),
                {"pipeline_id": pipeline_id, "step_status": step_status},
            )

        steps_result = connection.execute(
            text("SELECT step_name, status FROM pipeline_steps WHERE pipeline_id = :pipeline_id"),
            {"pipeline_id": pipeline_id},
        ).fetchall()
        current_steps = [{"name": row[0], "status": row[1]} for row in steps_result]
        new_status = calculate_pipeline_status(event, current_steps)
        if broadcast:
            asyncio.run(
                send_broadcast(
                    pipeline_id=pipeline_id,
                    name=name,
                    status=new_status,
                    event_type=event_type,
                    step_name=event.get("step_name"),
                ),
            )
        kafka_consumer.commit()


def _run() -> None:
    """
    Entry point: subscribe to the topic and process events forever.
    """
    engine = create_engine(DATABASE_URL)
    kafka_consumer = Consumer(
        {
            "bootstrap.servers": KAFKA_BROKER,
            "group.id": "state-tracker",
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        },
    )
    kafka_consumer.subscribe(topics=["pipeline-events"])
    while True:
        msg = kafka_consumer.poll(1.0)
        if msg is None:
            continue
        if msg.error():
            print(f"Consumer error: {msg.error()}")
            continue
        try:
            event = json.loads(msg.value().decode("utf-8"))
            process_event(event, engine=engine, kafka_consumer=kafka_consumer)
        except Exception as e:
            print(f"Failed to process message: {e}")


if __name__ == "__main__":
    _run()
