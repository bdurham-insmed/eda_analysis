import json
import logging
import os
import random
import re
import time
from threading import Thread
from uuid import uuid4

from confluent_kafka import Producer
from dotenv.main import load_dotenv
from fastapi import FastAPI
from fastapi import File
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi import status
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy import text
from starlette.middleware.cors import CORSMiddleware
from upload_file_handler.main import get_bucket
from upload_file_handler.main import upload_stream

load_dotenv()

app = FastAPI(title="Pipeline Initiator Service")
KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@db/postgres")
kafka_producer = Producer({"bootstrap.servers": KAFKA_BROKER})
engine = create_engine(DATABASE_URL)
logger = logging.getLogger(__name__)

GCS_URI_PATTERN = re.compile(r"^gs://[^/]+/.+")


class PipelineRequest(BaseModel):
    """
    Request model for starting a new pipeline job. Targets a specific workflow version.
    """

    workflow_version_id: int
    parameters: dict = {}
    count: int


class Step(BaseModel):
    """A single simulated step in a pipeline run."""

    name: str
    duration: int
    failure_prob: float | None = None


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PipelineSimulator:
    """
    Pipeline simulator that simulates a pipeline execution by publishing pipeline events to Kafka.
    """

    def __init__(
        self,
        pipeline_id: str,
        workflow_id: int,
        workflow_version_id: int,
        version_number: int,
        workflow_name: str,
        parameter_values: dict,
        db_steps: list[dict],
        producer: Producer,
    ):
        self.pipeline_id = pipeline_id
        self.workflow_id = workflow_id
        self.workflow_version_id = workflow_version_id
        self.version_number = version_number
        self.workflow_name = workflow_name
        self.parameter_values = parameter_values
        self.steps = [
            Step(
                name=db_step["step_name"],
                duration=random.randint(2, 7),
                failure_prob=random.uniform(0.01, 0.05),
            )
            for db_step in db_steps
        ]
        self.steps_for_event = [
            {
                "name": s.name,
                "duration": s.duration,
                "failure_prob": s.failure_prob,
                "step_order": db_steps[i]["step_order"],
                "step_type": db_steps[i]["step_type"],
            }
            for i, s in enumerate(self.steps)
        ]
        self.kafka_producer = producer
        self.status = "PENDING"

    def produce_event(
        self,
        event_type: str,
        step_name: str | None = None,
        status: str | None = None,
        error: str | None = None,
        steps: list[dict] | None = None,
    ) -> None:
        """Emit a single pipeline event onto the Kafka topic."""
        event = {
            "pipeline_id": self.pipeline_id,
            "name": self.workflow_name,
            "event_type": event_type,
            "timestamp": time.time(),
        }
        if event_type == "STARTED":
            event["workflow_id"] = self.workflow_id
            event["workflow_version_id"] = self.workflow_version_id
            event["version_number"] = self.version_number
            event["parameter_values"] = self.parameter_values
            event["steps"] = steps if steps is not None else self.steps_for_event
        if step_name:
            event["step_name"] = step_name
        if status:
            event["status"] = status
        if error:
            event["error"] = error
        try:
            self.kafka_producer.produce("pipeline-events", key=self.pipeline_id, value=json.dumps(event))
            self.kafka_producer.flush()
        except Exception as e:
            print(f"Failed to produce event: {e}")

    def simulate(self) -> None:
        """Run the pipeline simulation, emitting Kafka events as it progresses."""
        self.status = "RUNNING"
        self.produce_event(
            event_type="STARTED",
            status=self.status,
            steps=self.steps_for_event,
        )
        for step in self.steps:
            self.produce_event(event_type="STEP_STARTED", step_name=step.name, status=self.status)
            time.sleep(step.duration)
            if random.random() < step.failure_prob:
                self.status = "FAILED"
                self.produce_event(
                    event_type="STEP_FAILED",
                    step_name=step.name,
                    status=self.status,
                    error=f"Step {step.name} failed due to error.",
                )
                self.produce_event(
                    event_type="FAILED",
                    status=self.status,
                    error=f"Pipeline {self.pipeline_id} failed at step {step.name}.",
                )
                return
            self.produce_event(event_type="STEP_COMPLETED", step_name=step.name, status="COMPLETED")

        self.status = "COMPLETED"
        self.produce_event(event_type=self.status, status=self.status)


def _validate_parameter_value(name: str, value: object, param: dict) -> None:
    ptype = param["type"]
    options = param["options"]
    if ptype == "boolean":
        if not isinstance(value, bool):
            raise HTTPException(400, {"error": "invalid_type", "parameter": name, "expected": "boolean"})
    elif ptype == "number":
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise HTTPException(400, {"error": "invalid_type", "parameter": name, "expected": "number"})
    elif ptype == "string":
        if not isinstance(value, str):
            raise HTTPException(400, {"error": "invalid_type", "parameter": name, "expected": "string"})
    elif ptype == "select":
        if not isinstance(value, str):
            raise HTTPException(400, {"error": "invalid_type", "parameter": name, "expected": "string"})
        if options and value not in options:
            raise HTTPException(400, {"error": "invalid_option", "parameter": name, "value": value})
    elif ptype == "file":
        if not isinstance(value, str) or not GCS_URI_PATTERN.match(value):
            raise HTTPException(400, {"error": "invalid_gcs_uri", "parameter": name})


@app.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
def start_jobs(request: PipelineRequest) -> dict:
    """
    Starts pipeline runs against a specific workflow version. The version must be
    published and not archived; the parent workflow must not be archived.
    """
    if not (1 <= request.count <= 2500):
        raise HTTPException(status_code=400, detail="Invalid count provided. Must be between 1 and 2500.")

    with engine.connect() as conn:
        version_row = conn.execute(
            text("""
                SELECT v.id, v.workflow_id, v.version_number, v.status, v.archived_at,
                       w.name, w.archived_at AS workflow_archived_at
                FROM workflow_versions v
                JOIN workflows w ON w.id = v.workflow_id
                WHERE v.id = :id
            """),
            {"id": request.workflow_version_id},
        ).fetchone()
        if version_row is None:
            raise HTTPException(status_code=404, detail={"error": "version_not_found"})
        (
            version_id,
            workflow_id,
            version_number,
            version_status,
            version_archived_at,
            workflow_name,
            workflow_archived_at,
        ) = version_row
        if workflow_archived_at is not None:
            raise HTTPException(status_code=409, detail={"error": "workflow_archived"})
        if version_archived_at is not None:
            raise HTTPException(status_code=409, detail={"error": "version_archived"})
        if version_status != "published":
            raise HTTPException(status_code=409, detail={"error": "version_not_published"})

        param_rows = conn.execute(
            text("""
                SELECT wp.id, wp.name, wp.type, wp.options, wp.required, wp.default_value, wp.archived_at
                FROM workflow_parameters wp
                JOIN workflow_version_parameters m ON m.parameter_id = wp.id
                WHERE m.workflow_version_id = :id
            """),
            {"id": version_id},
        ).fetchall()
        step_rows = conn.execute(
            text("""
                SELECT step_name, step_order, step_type
                FROM workflow_version_steps
                WHERE workflow_version_id = :id
                ORDER BY step_order
            """),
            {"id": version_id},
        ).fetchall()

    if not step_rows:
        raise HTTPException(status_code=400, detail={"error": "version_has_no_steps"})

    catalog = {
        row[1]: {
            "id": row[0],
            "name": row[1],
            "type": row[2],
            "options": row[3],
            "required": row[4],
            "default_value": row[5],
            "archived_at": row[6],
        }
        for row in param_rows
    }
    for param_name, param in catalog.items():
        if param["archived_at"] is not None:
            raise HTTPException(
                status_code=409,
                detail={"error": "parameter_archived", "parameter": param_name},
            )
    unknown = set(request.parameters.keys()) - catalog.keys()
    if unknown:
        raise HTTPException(
            status_code=400,
            detail={"error": "unknown_parameters", "parameters": sorted(unknown)},
        )
    for param_name, param in catalog.items():
        if param_name in request.parameters:
            _validate_parameter_value(param_name, request.parameters[param_name], param)
        elif param["required"]:
            raise HTTPException(
                status_code=400,
                detail={"error": "missing_required_parameter", "parameter": param_name},
            )

    if os.getenv("GCS_BUCKET"):
        bucket = get_bucket()
        for param_name, param in catalog.items():
            if param["type"] != "file":
                continue
            value = request.parameters.get(param_name)
            if not isinstance(value, str) or not value.startswith("gs://"):
                continue
            _, _, object_path = value.removeprefix("gs://").partition("/")
            if not bucket.blob(object_path).exists():
                raise HTTPException(
                    status_code=400,
                    detail={"error": "file_not_found", "parameter": param_name},
                )
    else:
        for param_name, param in catalog.items():
            if param["type"] == "file":
                logger.warning("GCS_BUCKET unset; skipping file-existence check for %s", param_name)

    db_steps = [{"step_name": row[0], "step_order": row[1], "step_type": row[2]} for row in step_rows]
    for _ in range(request.count):
        pipeline_start(
            workflow_id=workflow_id,
            workflow_version_id=version_id,
            version_number=version_number,
            workflow_name=workflow_name,
            parameter_values=request.parameters,
            db_steps=db_steps,
        )
    return {"message": "Pipeline job(s) have been received."}


def pipeline_start(
    workflow_id: int,
    workflow_version_id: int,
    version_number: int,
    workflow_name: str,
    parameter_values: dict,
    db_steps: list[dict],
) -> None:
    """
    Starts a pipeline job by creating a PipelineSimulator instance and running it in a separate thread.
    """
    pipeline_id = str(uuid4())
    simulator = PipelineSimulator(
        pipeline_id=pipeline_id,
        workflow_id=workflow_id,
        workflow_version_id=workflow_version_id,
        version_number=version_number,
        workflow_name=workflow_name,
        parameter_values=parameter_values,
        db_steps=db_steps,
        producer=kafka_producer,
    )
    thread = Thread(target=simulator.simulate)
    thread.start()


@app.post("/uploads")
async def upload(
    workflow_version_id: int = Form(...),
    parameter_name: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    """
    Uploads a file for a workflow version's file-typed parameter to GCS.
    """
    max_bytes = int(os.getenv("MAX_UPLOAD_BYTES", 5_368_709_120))
    logger.info(
        "upload received content_type=%s filename=%s version=%s param=%s",
        file.content_type,
        file.filename,
        workflow_version_id,
        parameter_name,
    )
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT wp.type, v.workflow_id
                FROM workflow_parameters wp
                JOIN workflow_version_parameters m ON m.parameter_id = wp.id
                JOIN workflow_versions v ON v.id = m.workflow_version_id
                WHERE m.workflow_version_id = :vid
                  AND wp.name = :pname
                  AND wp.archived_at IS NULL
            """),
            {"vid": workflow_version_id, "pname": parameter_name},
        ).fetchone()
    if row is None:
        raise HTTPException(404, {"error": "unknown_parameter"})
    if row[0] != "file":
        raise HTTPException(400, {"error": "wrong_parameter_type", "type": row[0]})
    return await upload_stream(file, max_bytes, row[1])
