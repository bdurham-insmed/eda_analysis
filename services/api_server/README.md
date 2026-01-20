# API Server Service

This service provides a REST API for querying pipeline states and uses WebSockets for real-time updates.

## Features

- REST API for pipeline monitoring
- Written in Python using FastAPI
- WebSocket support for real-time updates
- Connects to Kafka and internal state storage
- Designed for integration with React/TypeScript frontend

## Endpoints

- `GET /pipelines` — List all pipelines and their states
- `GET /pipelines/<id>` — Get state for a specific pipeline
- `POST /internal/broadcast` — Broadcast event to websocket clients

## Configuration

- Kafka connection settings via environment variables or config file
- Optional database connection for persistent state

## Running the API Server Service

This service is intended to be run as part of a Docker Compose setup.
Please refer to the main project README for instructions on setting up and running the entire system.
Ensure you have Docker and Docker Compose installed.
