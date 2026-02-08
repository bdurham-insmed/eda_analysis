import json
import os
import random
import time
from threading import Thread
from uuid import uuid4

from confluent_kafka import Producer
from dotenv.main import load_dotenv
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import status
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

load_dotenv()
type WorkflowType = dict[str, str | list[dict[str, str | list[str]]]]
app = FastAPI(title="Pipeline Initiator Service")
KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
kafka_producer = Producer({"bootstrap.servers": KAFKA_BROKER})


class PipelineRequest(BaseModel):
    """
    Request model for starting a new pipeline job.
    """

    workflow_id: str
    parameters: dict = {}
    count: int


class Step(BaseModel):
    """
    Model representing a step in the pipeline.
    """

    name: str
    duration: int
    failure_prob: float | None = None


# in-mem for valid workflows
WORKFLOWS: dict[str, dict[str, str | list[dict[str, str | list[str]]]]] = {
    "rnaseq": {
        "name": "RNA-Seq Analysis",
        "description": "Pipeline for RNA-Seq data processing and analysis.",
        "parameters": [
            {
                "name": "fastq_files",
                "type": "list",
                "description": "List of input FASTQ files.",
                "required": "true",
            },
            {
                "name": "reference_genome",
                "type": "string",
                "description": "Reference genome version.",
                "options": ["hg19", "hg38"],
                "default": "hg38",
            },
            {
                "name": "strandness",
                "type": "string",
                "description": "Direction of strand",
                "options": ["forward", "reverse", "unstranded"],
                "default": "unstranded",
            },
        ],
    },
    "variant_calling": {
        "name": "Variant Calling Pipeline",
        "description": "Pipeline for calling variants from sequencing data.",
        "parameters": [
            {
                "name": "bam_files",
                "type": "list",
                "description": "List of input BAM files.",
                "required": "true",
            },
            {
                "name": "reference_genome",
                "type": "string",
                "description": "Reference genome version.",
                "options": ["hg19", "hg38"],
                "default": "hg38",
            },
            {
                "name": "caller",
                "type": "string",
                "description": "Variant caller to use.",
                "options": ["GATK", "FreeBayes"],
                "default": "GATK",
            },
        ],
    },
}

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
        name: str,
        producer: Producer,
        steps: list[Step] | None = None,
    ):
        self.pipeline_id = pipeline_id
        self.name = name
        self.steps = (
            steps
            if steps
            else [
                Step(
                    name="data_ingestion",
                    duration=random.randint(2, 5),
                    failure_prob=0.05,
                ),
                Step(
                    name="data_processing",
                    duration=random.randint(3, 7),
                    failure_prob=0.03,
                ),
                Step(
                    name="model_training",
                    duration=random.randint(5, 10),
                    failure_prob=0.02,
                ),
                Step(name="evaluation", duration=random.randint(2, 4), failure_prob=0.04),
                Step(name="report", duration=random.randint(1, 3), failure_prob=0.001),
            ]
        )
        self.kafka_producer = producer
        self.status = "PENDING"

    def produce_event(
        self,
        event_type: str,
        step_name: str | None = None,
        status: str | None = None,
        error: str | None = None,
        steps: str | None = None,
    ) -> None:
        """
        Produces a pipeline event to send to Kafka.
        :param event_type: Event type (e.g. STARTED, STEP_STARTED, STEP_COMPLETED, FAILED).
        :param step_name: Step name for STEP_STARTED and STEP_COMPLETED events.
        :param status: Pipeline status for STARTED and FAILED events.
        :param error: Error message for FAILED events.
        :param steps: JSON-encoded list of steps for STARTED events.
        """
        event = {
            "pipeline_id": self.pipeline_id,
            "name": self.name,
            "event_type": event_type,
            "timestamp": time.time(),
        }
        if steps:
            event["steps"] = steps
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
        """
        Simulates the pipeline execution by iterating through the steps, producing events, and handling failures.
        """
        self.status = "RUNNING"
        self.produce_event(
            event_type="STARTED",
            status=self.status,
            steps=str([step.model_dump() for step in self.steps]),
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


@app.get("/workflows")
def list_workflows() -> list[dict]:
    """
    Lists all available workflows.
    :return: List of workflow details.
    """
    return [
        {
            "id": id_,
            "name": details["name"],
            "description": details["description"],
            "parameters": details["parameters"],
        }
        for id_, details in WORKFLOWS.items()
    ]


@app.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
def start_jobs(request: PipelineRequest) -> dict:
    """
    Starts a new pipeline job based on the provided workflow ID and parameters.
    Validates the workflow ID and parameters before starting the job.
    If request.count is provided, starts the specified number of pipeline jobs with the same parameters.

    :param request: Pipeline request containing workflow ID and parameters.
    :return: A dictionary containing the pipeline ID.
    """
    if request.workflow_id not in WORKFLOWS:
        raise HTTPException(status_code=400, detail="Invalid workflow_id provided.")
    workflow = WORKFLOWS[request.workflow_id]
    allowed_params = {param["name"] for param in workflow["parameters"] if isinstance(param, dict)}
    unknown_params = set(request.parameters.keys()) - allowed_params

    if unknown_params:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown parameters provided: {', '.join(unknown_params)}",
        )

    if request.count and 2500 >= request.count > 0:
        for _ in range(request.count):
            pipeline_start(workflow, request.parameters)
    else:
        raise HTTPException(status_code=400, detail="Invalid count provided. Must be between 1 and 2500.")
    return {"message": "Pipeline job(s) have been received."}


def pipeline_start(workflow: WorkflowType, parameters: dict) -> None:
    """
    Starts a pipeline job by creating a PipelineSimulator instance and running it in a separate thread.
    :param workflow: Workflow details containing name and parameters.
    :param parameters: Parameters for the pipeline execution.
    :return: None
    """
    pipeline_id = str(uuid4())
    if parameters.get("simulate", True):
        simulator = PipelineSimulator(pipeline_id, str(workflow["name"]), kafka_producer)
        thread = Thread(target=simulator.simulate)
        thread.start()
    else:
        raise HTTPException(status_code=501, detail="No real pipeline execution implemented.")
