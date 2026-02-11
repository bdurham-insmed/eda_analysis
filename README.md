# Pipeline Monitoring

This repository demonstrates an Event Driven Architecture (EDA) using Apache Kafka, Python and Go. It showcases how to monitor and scale pipeline processing using events.

## Features

- Event-driven pipeline monitoring with Kafka
- Microservices architecture with Python and Go
- Scalable architecture using Docker Compose
- Example of state tracking and event processing
- Real-time pipeline state updates via WebSockets

## Tech Stack

- Python 3.12
- Golang 1.24.5
- Apache Kafka
- React + Vite (TypeScript)
- Docker & Docker Compose
- Postgres

## Project Structure

- [db_init/](db_init)
  - Database initialisation scripts
- [frontend/](frontend)
  - React + TypeScript + Vite frontend for a pipeline monitoring dashboard
- [services/](services)
  - Contains all backend microservices
    - [api_server/](services/api_server)
      - FastAPI service exposing REST endpoints for monitoring, uses WebSocket for real-time updates
    - [pipeline_initiator/](services/pipeline_initiator)
      - FastAPI service to initiate starting pipelines
    - [state_tracker/](services/state_tracker)
      - Consumes events and manages pipeline states (updates DB)
    - [metric_collector/](services/metric_collector)
      - Go service to print pipeline events to stdout (demonstration of multi-language consumers in a single space; may actually do metric collection in future if I have time...)
    - [high_throughput/](services/high_throughput)
      - Go service to produce a high volume of events to Kafka. Just to demonstrate the ability of the system to handle lots of events to a different topic. Doesn't integrate into the pipeline dashboard flow. 
- [docker-compose.yml](docker-compose.yaml)
  - Orchestrates services and Kafka broker

## Deeper Dives
- [Apache Kafka](docs/Apache%20Kafka.md)
- [WebSockets](docs/WebSockets.md)
- [Serverless Architecture](docs/Serverless.md)
- [Event Driven Architecture](docs/Event%20Driven%20Architecture.md)

## Running the Project locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/bdurham-insmed/eda_analysis.git
   cd eda_analysis
   ```
2. **Start services using Docker Compose:**
   ```bash
    docker compose up --build
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
   The frontend dashboard updates pipeline states and events in near real-time using WebSocket integration.
   The API server will expose endpoints to monitor pipeline states and events in real-time.
   The dashboard will update as events are processed. To visualise the events in Kafka UI, navigate to the 'Topics' section and select the `pipeline-events` topic.
6. **Shut down services and clear storage:**
   ```bash
   docker compose down -v
   ```

## WebSocket Integration

The API server receives real-time pipeline state and event updates from the `state_tracker` service, which pushes updates to a dedicated API endpoint. The API server then broadcasts these updates to the frontend via WebSocket, enabling live monitoring of pipeline progress.

- The frontend establishes a WebSocket connection to the API server.
- As the `state_tracker` processes events, it sends state changes to the API server, which relays them to all connected clients.
- This ensures the dashboard reflects the latest pipeline activity in near real-time.

## Consumer Scaling
The `pipeline-events` topic has been partitioned to allow multiple consumers of the same type to read from it concurrently, this is found in the `docker-compose.yml` file under the `kafka-init` section.

In this project, multiple state_tracker instances will be run in parallel.  The number of `state_tracker` services to run is set as 6 in the `docker-compose.yml` file, due to the number of partitions in the Kafka topic.

## Monitoring
Monitoring is implemented using Prometheus and Grafana.
- Prometheus is configured to scrape metrics from `kafka_exporter` service. 
  - Prometheus can be visualised [here](http://localhost:9090). 
- Grafana is set up to build dashboards based on the metrics collected by Prometheus.
  - Grafana can be visualised [here](http://localhost:3001). You can log in with username `admin` and password `admin` to view the dashboard.
  - You will need to build out the Grafana dashboard yourself using the Prometheus data source and the metrics collected by `kafka_exporter`. 
  - There are publicly available Grafana dashboards for Kafka monitoring that you can use as a starting point, such as [this one](https://grafana.com/grafana/dashboards/15465-kafka-exporter-overview/) which is designed for monitoring Kafka clusters.
