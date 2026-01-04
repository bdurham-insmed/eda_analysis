
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from uuid import uuid4
import json
from confluent_kafka import Producer
import time
import random
from threading import Thread
import os
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="Pipeline Initiator Service")
KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
kafka_producer = Producer({"bootstrap.servers": KAFKA_BROKER})

class PipelineRequest(BaseModel):
    workflow_id: str
    parameters: dict = {}

class Steps(BaseModel):
    name: str
    duration: int
    failure_prob: float



# in-mem for valid workflows
WORKFLOWS = {
    "rnaseq": {
        "name": "RNA-Seq Analysis",
        "description": "Pipeline for RNA-Seq data processing and analysis.",
        "parameters": [
            {"name": "fastq_files", "type": "list", "description": "List of input FASTQ files.", "required": "true"},
            {"name": "reference_genome", "type": "string", "description": "Reference genome version.", "options": ["hg19", "hg38"], "default": "hg38"},
            {"name": "strandness", "type": "string", "description": "Direction of strand", "options": ["forward", "reverse", "unstranded"], "default": "unstranded"}
        ],
    },
    "variant_calling": {
        "name": "Variant Calling Pipeline",
        "description": "Pipeline for calling variants from sequencing data.",
        "parameters": [
            {"name": "bam_files", "type": "list", "description": "List of input BAM files.", "required": "true"},
            {"name": "reference_genome", "type": "string", "description": "Reference genome version.", "options": ["hg19", "hg38"], "default": "hg38"},
            {"name": "caller", "type": "string", "description": "Variant caller to use.", "options": ["GATK", "FreeBayes"], "default": "GATK"},
        ],
    }
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PipelineSimulator:
    def __init__(self, pipeline_id: str, name: str, kafka_producer: Producer, steps: list[Steps] = None):
        self.pipeline_id = pipeline_id
        self.name = name
        self.steps = steps if steps else [
            {"name": "data_ingestion", "duration": random.randint(2, 5), "failure_prob": 0.05},
            {"name": "data_processing", "duration": random.randint(3, 7), "failure_prob": 0.03},
            {"name": "model_training", "duration": random.randint(5, 10), "failure_prob": 0.02},
            {"name": "evaluation", "duration": random.randint(2, 4), "failure_prob": 0.04},
            {"name": "report", "duration": random.randint(1, 3), "failure_prob": 0.001}
        ]
        self.kafka_producer = kafka_producer
        self.status = "PENDING"

    def produce_event(self, event_type: str, step_name: str = None, status: str = None, error: str = None, steps: str = None):
        event = {
            "pipeline_id": self.pipeline_id,
            "name": self.name,
            "event_type": event_type,
            "timestamp": time.time()
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

    def simulate(self):
        self.status = "RUNNING"
        self.produce_event(event_type="STARTED", status=self.status, steps=str(self.steps))
        for step in self.steps:
            self.produce_event(event_type="STEP_STARTED", step_name=step["name"], status=self.status)
            time.sleep(step["duration"])
            if random.random() < step["failure_prob"]:
                self.status = "FAILED"
                self.produce_event(event_type="STEP_FAILED", step_name=step["name"], status=self.status, error=f"Step {step['name']} failed due to error.")
                self.produce_event(event_type="FAILED", status=self.status, error=f"Pipeline {self.pipeline_id} failed at step {step['name']}.")
                return
            self.produce_event(event_type="STEP_COMPLETED", step_name=step["name"], status="COMPLETED")

        self.status = "COMPLETED"
        self.produce_event(event_type=self.status, status=self.status)

@app.get("/workflows")
def list_workflows():
    return [
        {"id": id_, "name": details["name"], "description": details["description"], "parameters": details["parameters"]
         } for id_, details in WORKFLOWS.items()
    ]

@app.post("/start-pipeline")
def start_pipeline(request: PipelineRequest):
    if request.workflow_id not in WORKFLOWS:
        raise HTTPException(status_code=400, detail="Invalid workflow_id provided.")
    workflow = WORKFLOWS[request.workflow_id]
    allowed_params = {param["name"] for param in workflow["parameters"]}
    unknown_params = set(request.parameters.keys()) - allowed_params

    if unknown_params:
        raise HTTPException(status_code=400, detail=f"Unknown parameters provided: {', '.join(unknown_params)}")

    pipeline_id = str(uuid4())
    params = request.parameters
    if params.get("simulate", True):
        simulator = PipelineSimulator(pipeline_id, workflow["name"], kafka_producer)
        thread = Thread(target=simulator.simulate)
        thread.start()
    else:
        raise HTTPException(status_code=501, detail="No real pipeline execution implemented.")

    return {"pipeline_id": pipeline_id}