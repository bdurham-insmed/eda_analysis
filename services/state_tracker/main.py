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

engine = create_engine(DATABASE_URL)
kafka_consumer = Consumer(
    {
        "bootstrap.servers": KAFKA_BROKER,
        "group.id": "state-tracker",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    }
)

kafka_consumer.subscribe(topics=["pipeline-events"])


async def send_broadcast(
    pipeline_id: str,
    name: str,
    status: str,
    event_type: str,
    step_name: str | None = None,
) -> None:
    """
    Sends a broadcast message to the API server about the pipeline event update.
    :param pipeline_id: The ID of the pipeline that triggered the event.
    :param name: The name of the workflow that the pipeline uses e.g. RNA-Seq Analysis.
    :param status: The new status of the pipeline.
    :param event_type: The type of event that triggered the pipeline update.
    :param step_name: The name of the step that triggered the event, if applicable.
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
    :param event: The pipeline event.
    :param current_steps: The current step statuses.
    :return: The pipeline status.
    """
    if event["event_type"] in ["FAILED", "STEP_FAILED"]:
        return "FAILED"
    completed_steps = {step["name"] for step in current_steps if step["status"] == "COMPLETED"}
    if len(completed_steps) == len(current_steps):
        return "COMPLETED"
    return "RUNNING"


while True:
    msg = kafka_consumer.poll(1.0)
    if msg is None:
        continue
    if msg.error():
        print(f"Consumer error: {msg.error()}")
        continue

    try:
        event = json.loads(msg.value().decode("utf-8"))
        pipeline_id = event["pipeline_id"]
        event_type = event["event_type"]
        name = event["name"]

        with engine.begin() as connection:
            if event_type == "STARTED":
                connection.execute(
                    text("""
                    INSERT INTO pipelines (id, name, status, start_time)
                    VALUES (:pipeline_id, :name, 'RUNNING', NOW())
                    """),
                    {"pipeline_id": pipeline_id, "name": name},
                )
                step_json = json.dumps(event["steps"])
                steps = eval(json.loads(step_json))
                for step in steps:
                    connection.execute(
                        text("""
                        INSERT INTO pipeline_steps (pipeline_id, step_name, status, start_time)
                        VALUES (:pipeline_id, :step_name, 'PENDING', NULL)
                        """),
                        {"pipeline_id": pipeline_id, "step_name": step["name"]},
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
            is_terminal = new_status in ["COMPLETED", "FAILED"]
            asyncio.run(
                send_broadcast(
                    pipeline_id=pipeline_id,
                    name=name,
                    status=new_status,
                    event_type=event_type,
                    step_name=event.get("step_name"),
                )
            )
            kafka_consumer.commit()
    except Exception as e:
        print(f"Failed to process message: {e}")
