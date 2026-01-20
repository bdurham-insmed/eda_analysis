# Pipeline Initiator Service

The Pipeline Initiator is a microservice responsible for starting new data processing pipelines based on workflow requests. It exposes a REST API for triggering pipelines and simulates pipeline execution, emitting events to Kafka for downstream consumers.

## Features

- REST API to start pipelines based on predefined workflows
- Simulates pipeline steps, including random failures
- Publishes pipeline events to Kafka for monitoring and orchestration
- Written in Python using FastAPI

## Kafka Producer

This service uses a **Kafka producer** to publish events to the `pipeline-events` topic. Each event describes the state of a pipeline (started, step started, step failed, completed, etc.). Downstream services (i.e. state_tracker) will consume these events to react to pipeline changes.

**Key Kafka Producer Concepts:**

- **Producer**: Sends messages (events) to Kafka topics.
- **Topic**: Logical channel in Kafka (here, `pipeline-events`) where events are published.
- **Key**: Used for partitioning; here, the pipeline ID is used as the key.
- **Value**: The event payload, serialized as JSON.

## API Endpoints

- `GET /workflows` — List available workflows and their parameters
- `POST /jobs` — Start a new pipeline request with specified workflow and parameters

## Example Event Structure

```json
{
  "pipeline_id": "uuid",
  "name": "RNA-Seq Analysis",
  "event_type": "STEP_STARTED",
  "timestamp": 1710000000.0,
  "step_name": "data_ingestion",
  "status": "RUNNING"
}
```

## Running the Pipeline Initiator Service

This service is intended to be run as part of a Docker Compose setup.
Please refer to the main project README for instructions on setting up and running the entire system.
Ensure you have Docker and Docker Compose installed.

## Related Concepts

- **Kafka Consumer**: Downstream services consume the events produced by this service to track pipeline states and trigger actions. Please see [state_tracker/README.md](../state_tracker/README.md) for more details.
