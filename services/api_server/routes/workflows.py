"""
Workflow CRUD endpoints. Version content is managed in routes.versions.
"""

import queries
from db import engine
from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Response
from fastapi import status
from schemas import WorkflowIn
from schemas import WorkflowMetadataUpdateIn
from schemas import WorkflowOut
from schemas import WorkflowSummary
from sqlalchemy.exc import IntegrityError

router = APIRouter()


@router.get("/workflows")
def list_workflows(include_archived: bool = False) -> list[WorkflowSummary]:
    """List workflow summaries."""
    with engine.connect() as connection:
        rows = queries.list_workflows(connection, include_archived)
    return [WorkflowSummary(**row) for row in rows]


@router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: int) -> WorkflowOut:
    """Fetch a workflow with version summaries."""
    with engine.connect() as connection:
        wf = queries.get_workflow(connection, workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail={"error": "workflow_not_found"})
    return WorkflowOut(**wf)


@router.post("/workflows", status_code=status.HTTP_201_CREATED)
def create_workflow(payload: WorkflowIn) -> WorkflowOut:
    """Create a workflow and a v1 draft populated with the supplied content."""
    try:
        with engine.begin() as connection:
            new_id = queries.create_workflow(connection, payload)
            wf = queries.get_workflow(connection, new_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})
    except IntegrityError as exc:
        if "workflows_name" in str(exc.orig):
            raise HTTPException(status_code=409, detail={"error": "duplicate_name"})
        raise HTTPException(status_code=400, detail={"error": "integrity_error"})
    return WorkflowOut(**wf)


@router.put("/workflows/{workflow_id}")
def update_workflow_metadata(workflow_id: int, payload: WorkflowMetadataUpdateIn) -> WorkflowOut:
    """Update a workflow's name + description (metadata only). Optimistic-locked."""
    try:
        with engine.begin() as connection:
            queries.update_workflow_metadata(connection, workflow_id, payload)
            wf = queries.get_workflow(connection, workflow_id)
    except LookupError:
        raise HTTPException(status_code=404, detail={"error": "workflow_not_found"})
    except queries.StaleRevisionError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "stale_revision", "current_revision": exc.current_revision},
        )
    except ValueError as exc:
        message = str(exc)
        if message == "workflow_archived":
            raise HTTPException(status_code=409, detail={"error": "workflow_archived"})
        raise HTTPException(status_code=400, detail={"error": message})
    except IntegrityError as exc:
        if "workflows_name" in str(exc.orig):
            raise HTTPException(status_code=409, detail={"error": "duplicate_name"})
        raise HTTPException(status_code=400, detail={"error": "integrity_error"})
    return WorkflowOut(**wf)


@router.post("/workflows/{workflow_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_workflow(workflow_id: int) -> Response:
    """Archive a workflow. Idempotent."""
    with engine.begin() as connection:
        exists = queries.archive_workflow(connection, workflow_id)
    if not exists:
        raise HTTPException(status_code=404, detail={"error": "workflow_not_found"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/workflows/{workflow_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
def unarchive_workflow(workflow_id: int) -> Response:
    """Unarchive a workflow. Idempotent."""
    with engine.begin() as connection:
        exists = queries.unarchive_workflow(connection, workflow_id)
    if not exists:
        raise HTTPException(status_code=404, detail={"error": "workflow_not_found"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
