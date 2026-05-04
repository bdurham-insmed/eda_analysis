"""
Workflow version endpoints (create draft, edit draft, publish, archive, clone).
"""

import queries
from db import engine
from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Response
from fastapi import status
from schemas import WorkflowVersionCreateIn
from schemas import WorkflowVersionOut
from schemas import WorkflowVersionUpdateIn

router = APIRouter()


@router.post(
    "/workflows/{workflow_id}/versions",
    status_code=status.HTTP_201_CREATED,
)
def create_workflow_version(
    workflow_id: int,
    payload: WorkflowVersionCreateIn,
) -> WorkflowVersionOut:
    """
    Create a new draft version. If `from_version_id` is supplied the new draft is
    cloned from that version's parameters/steps; otherwise the body must include
    explicit `content`.
    """
    try:
        with engine.begin() as connection:
            if payload.from_version_id is not None:
                new_id = queries.clone_version(connection, workflow_id, payload.from_version_id)
            else:
                assert payload.content is not None
                new_id = queries.create_version_from_content(
                    connection,
                    workflow_id,
                    payload.content,
                )
            ver = queries.get_workflow_version(connection, new_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"error": str(exc)})
    except ValueError as exc:
        message = str(exc)
        if message == "workflow_archived":
            raise HTTPException(status_code=409, detail={"error": "workflow_archived"})
        raise HTTPException(status_code=400, detail={"error": message})
    return WorkflowVersionOut(**ver)


@router.get("/workflow-versions/{version_id}")
def get_workflow_version(version_id: int) -> WorkflowVersionOut:
    """Fetch a workflow version with parameters and steps."""
    with engine.connect() as connection:
        ver = queries.get_workflow_version(connection, version_id)
    if ver is None:
        raise HTTPException(status_code=404, detail={"error": "version_not_found"})
    return WorkflowVersionOut(**ver)


@router.put("/workflow-versions/{version_id}")
def update_workflow_version(
    version_id: int,
    payload: WorkflowVersionUpdateIn,
) -> WorkflowVersionOut:
    """Update a draft version. Refuses if the version is published or archived."""
    try:
        with engine.begin() as connection:
            queries.update_version(connection, version_id, payload)
            ver = queries.get_workflow_version(connection, version_id)
    except LookupError:
        raise HTTPException(status_code=404, detail={"error": "version_not_found"})
    except queries.StaleRevisionError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "stale_revision", "current_revision": exc.current_revision},
        )
    except ValueError as exc:
        message = str(exc)
        if message in ("version_archived", "version_not_draft"):
            raise HTTPException(status_code=409, detail={"error": message})
        raise HTTPException(status_code=400, detail={"error": message})
    return WorkflowVersionOut(**ver)


@router.post("/workflow-versions/{version_id}/publish")
def publish_workflow_version(version_id: int) -> WorkflowVersionOut:
    """Promote a draft version to published. Idempotent."""
    try:
        with engine.begin() as connection:
            queries.publish_version(connection, version_id)
            ver = queries.get_workflow_version(connection, version_id)
    except LookupError:
        raise HTTPException(status_code=404, detail={"error": "version_not_found"})
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"error": str(exc)})
    return WorkflowVersionOut(**ver)


@router.post("/workflow-versions/{version_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_workflow_version(version_id: int) -> Response:
    """Archive a workflow version. Idempotent."""
    with engine.begin() as connection:
        exists = queries.archive_version(connection, version_id)
    if not exists:
        raise HTTPException(status_code=404, detail={"error": "version_not_found"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/workflow-versions/{version_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
def unarchive_workflow_version(version_id: int) -> Response:
    """Unarchive a workflow version. Idempotent."""
    with engine.begin() as connection:
        exists = queries.unarchive_version(connection, version_id)
    if not exists:
        raise HTTPException(status_code=404, detail={"error": "version_not_found"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
