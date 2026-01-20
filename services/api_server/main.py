import logging
import os

from dotenv.main import load_dotenv
from fastapi import FastAPI
from fastapi import Request
from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from fastapi import status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy import text

load_dotenv()

app = FastAPI(title="Pipeline Monitoring API Server")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@db/postgres")
engine = create_engine(DATABASE_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """
    Handles validation errors for incoming requests.

    :param request: The incoming request.
    :param exc: The validation error.
    :return: A JSON response with the error details.
    """
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logging.error(f"{request}: {exc_str}")
    content = {"status_code": 422, "message": exc_str, "data": None}
    return JSONResponse(content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class BroadcastPayload(BaseModel):
    """
    Payload model for broadcasting pipeline events.
    """

    pipeline_id: str
    name: str
    status: str
    event_type: str
    step_name: str | None = None
    timestamp: float


class ConnectionManager:
    """
    Connection manager to keep track of active websocket connections.
    """

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """
        Accepts a new websocket connection and adds it to the active connections list.
        :param websocket: The new websocket connection.
        """
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """
        Removes a websocket connection from the active connections list.
        :param websocket: The websocket connection to remove.
        """
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        """
        Broadcasts a message to all active websocket connections.
        :param message: The message to broadcast.
        """
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()


@app.get("/pipelines")
def list_pipelines() -> list[dict]:
    """
    Retrieves a list of all pipelines from the database.
    :return: A list of pipelines.
    """
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT id, name, status, start_time, end_time FROM pipelines ORDER BY start_time DESC")
        ).fetchall()
        pipelines = [
            {
                "id": row[0],
                "name": row[1],
                "status": row[2],
                "start_time": row[3],
                "end_time": row[4],
            }
            for row in result
        ]
    return pipelines


@app.get("/pipelines/{pipeline_id}")
def get_pipeline(pipeline_id: str) -> dict:
    """
    Retrieves a pipeline by ID from the database.
    :param pipeline_id: The ID of the pipeline to retrieve.
    :return: A dictionary containing the pipeline details.
    """
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT id, name, status, start_time, end_time FROM pipelines WHERE id = :id"),
            {"id": pipeline_id},
        ).fetchone()
        if result is None:
            return {"error": "Pipeline not found"}
        steps = connection.execute(
            text("SELECT step_name, status, start_time, end_time FROM pipeline_steps WHERE pipeline_id = :id"),
            {"id": pipeline_id},
        )
        pipeline = {
            "id": result[0],
            "name": result[1],
            "status": result[2],
            "start_time": result[3],
            "end_time": result[4],
            "steps": [
                {
                    "name": step[0],
                    "status": step[1],
                    "start_time": step[2],
                    "end_time": step[3],
                }
                for step in steps
            ],
        }
    return pipeline


@app.websocket("/ws/pipelines")
async def websocket_endpoint(websocket: WebSocket):
    """
    Websocket endpoint for receiving pipeline status updates.
    :param websocket: The websocket connection.
    """
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/internal/broadcast")
async def broadcast_event(payload: BroadcastPayload):
    """
    Broadcasts a pipeline event to all connected websocket clients.
    :param payload: The event payload.
    """
    await manager.broadcast(payload.model_dump())
