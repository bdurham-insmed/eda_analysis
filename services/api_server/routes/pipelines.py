"""
Pipeline read endpoints.
"""

import queries
from db import engine
from fastapi import APIRouter
from fastapi import HTTPException

router = APIRouter()


@router.get("/pipelines")
def list_pipelines() -> list[dict]:
    """List all pipelines."""
    with engine.connect() as connection:
        return queries.list_pipelines(connection)


@router.get("/pipelines/{pipeline_id}")
def get_pipeline(pipeline_id: str) -> dict:
    """Fetch a single pipeline with its steps."""
    with engine.connect() as connection:
        pipeline = queries.get_pipeline(connection, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail={"error": "pipeline_not_found"})
    return pipeline
