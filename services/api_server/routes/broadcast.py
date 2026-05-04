"""
WebSocket subscription and the internal broadcast endpoint state_tracker calls.
"""

from fastapi import APIRouter
from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from pydantic import BaseModel
from websocket_manager import manager

router = APIRouter()


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


@router.websocket("/ws/pipelines")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket clients subscribe here for live pipeline updates."""
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.post("/internal/broadcast")
async def broadcast_event(payload: BroadcastPayload):
    """Internal endpoint used by state_tracker to fan out events to WebSocket clients."""
    await manager.broadcast(payload.model_dump())
