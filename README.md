# Pipeline Monitoring - An Event Driven Architecture Introduction

This repository demonstrates an Event Driven Architecture (EDA) using Apache Kafka and Python. It showcases how to monitor and scale pipeline processing using events.

## Features

- Event-driven pipeline monitoring with Kafka
- Python-based services for event production and consumption
- Scalable architecture using Docker Compose
- Example of state tracking and event processing

## Tech Stack

- Python 3.12+
- Apache Kafka (using `confluent-kafka` Python library)
- React + Vite (TypeScript) for frontend dashboard
- FastAPI for backend services
- Docker & Docker Compose 
- Postgres

## Project Structure
- [db_init/](db_init) - Database initialization scripts
- [frontend/](frontend) - React + TypeScript + Vite frontend for monitoring dashboards
- [services/](services) - Contains all backend microservices
  - [api_server/](services/api_server) - FastAPI service exposing REST endpoints for monitoring, uses WebSocket for real-time updates
  - [pipeline_initiator/](services/pipeline_initiator) - FastAPI service to initiate starting pipelines
  - [state_tracker/](services/state_tracker) - Consumes events and manage pipeline states (updates DB)
- [docker-compose.yml](docker-compose.yaml) - Orchestrates services and Kafka broker


## Running the Project locally
1. **Clone the repository:**
   ```bash
   git clone https://github.com/bdurham-insmed/eda_analysis.git
   cd eda_analysis
   ```
2. **Start services using Docker Compose:**
   ```bash
    docker-compose up --build
    ```
3. **Access the tools:**
    - **UI**: Open your browser and navigate [here](http://localhost:3000) to view the monitoring dashboard.
    - **General API Server**: Access the API server [here](http://localhost:8000/docs) for interactive API documentation.
    - **Pipeline Initiator API**: Access the pipeline initiator [here](http://localhost:8001/docs) for interactive API documentation.
    - **Postgres DB**: Connect to the Postgres database at `localhost:5455` with username `postgres`, password `password`, and database name `postgres`.
    - **Kafka UI**: Kafka UI is accessible [here](http://localhost:8090).

4. **Run Pipelines**
Using the UI, you can start pipelines that will generate events by selecting one of the available pipelines under the 'Start a New Pipeline' section.
   1. Navigate [here](http://localhost:3000).
   2. Go to the 'Start a New Pipeline' section.
   3. Click on RNA-Seq Analysis or Variant Calling Pipeline button.
   4. Fill in required details in the form, fill in number of pipelines to run - mainly for showcasing event driven architecture with multiple pipelines.
   5. Click 'Start Pipeline' to initiate the pipeline(s).

5. **Monitor Events:**
   The API server will expose endpoints to monitor pipeline states and events in real-time.
   The dashboard will update as events are processed. To visualise the events in Kafka UI, navigate to the 'Topics' section and select the `pipeline_events` topic.
6. **Shut down services and clear storage:**
   ```bash
   docker-compose down -v
   ```
   
## Scaling
Multiple state_tracker instances can be run in parallel, currently it's set as 3 in the `docker-compose.yml` file. 

Kafka's consumer group mechanism ensures events are distributed and processed efficiently, 
improving fault tolerance and scalability.

The topic will be partitioned to allow multiple consumers to read from it concurrently, this is found in the `docker-compose.yml` file under the kafka-init section.

A maximum of 6 state_tracker instances can be run in parallel with the current topic partitioning - more can be run but will not improve performance. 
To scale up the number of state_tracker instances, run:
```bash
docker-compose up --scale state_tracker=6
```


## Future Improvements
This is a simple demonstration of an event driven architecture, with only a single producer and consumer.
Future improvements could include:
* Integrate real pipeline workflows (e.g., directly in Nextflow via nf-kafka or via custom script generating events)
* Add persistent data storage for pipeline results
* Archive old events and pipeline states 
* Allow retries for failed pipeline / pipeline steps
* Implement notification service for pipeline status updates