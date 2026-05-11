import json
import logging
import os
import random
import re
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


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        produce_command(
            workflow_id=workflow_id,
            workflow_version_id=version_id,
            version_number=version_number,
            workflow_name=workflow_name,
            parameter_values=request.parameters,
            db_steps=db_steps,
        )
    kafka_producer.flush()
    return {"message": "Pipeline job(s) have been received."}


def produce_command(
    workflow_id: int,
    workflow_version_id: int,
    version_number: int,
    workflow_name: str,
    parameter_values: dict,
    db_steps: list[dict],
) -> None:
    """
    Emit a single PIPELINE_REQUESTED command onto the `pipeline-commands` topic.

    Step `duration` and `failure_prob` are rolled here once and embedded in the payload so
    the worker does not re-roll on redelivery; timing of a run is therefore deterministic
    across retries.
    """
    pipeline_id = str(uuid4())
    steps = [
        {
            "name": db_step["step_name"],
            "duration": random.randint(0, 1),
            "failure_prob": random.uniform(0.01, 0.05),
            "step_order": db_step["step_order"],
            "step_type": db_step["step_type"],
        }
        for db_step in db_steps
    ]
    command = {
        "event_type": "PIPELINE_REQUESTED",
        "pipeline_id": pipeline_id,
        "workflow_id": workflow_id,
        "workflow_version_id": workflow_version_id,
        "version_number": version_number,
        "workflow_name": workflow_name,
        "parameter_values": parameter_values,
        "steps": steps,
    }
    try:
        kafka_producer.produce("pipeline-commands", key=pipeline_id, value=json.dumps(command))
    except Exception as e:
        logger.exception("Failed to enqueue PIPELINE_REQUESTED command: %s", e)
        raise


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
