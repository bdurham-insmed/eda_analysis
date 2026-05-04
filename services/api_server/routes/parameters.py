"""
Workflow parameter catalog endpoints.
"""

import queries
from db import engine
from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Response
from fastapi import status
from schemas import ParameterIn
from schemas import ParameterOut
from sqlalchemy.exc import IntegrityError

router = APIRouter()


@router.get("/workflow-parameters")
def list_workflow_parameters(include_archived: bool = False) -> list[ParameterOut]:
    """List workflow parameters from the catalog."""
    with engine.connect() as connection:
        rows = queries.list_workflow_parameters(connection, include_archived)
    return [ParameterOut(**row) for row in rows]


@router.post("/workflow-parameters", status_code=status.HTTP_201_CREATED)
def create_workflow_parameter(payload: ParameterIn) -> ParameterOut:
    """Create a new catalog parameter."""
    try:
        with engine.begin() as connection:
            new_id = queries.create_workflow_parameter(connection, payload)
            row = queries.get_workflow_parameter(connection, new_id)
    except IntegrityError as exc:
        if "workflow_parameters_name_key" in str(exc.orig) or "duplicate key" in str(exc.orig):
            raise HTTPException(status_code=409, detail={"error": "duplicate_name"})
        raise HTTPException(status_code=400, detail={"error": "integrity_error"})
    return ParameterOut(**row)


@router.put("/workflow-parameters/{parameter_id}")
def update_workflow_parameter(parameter_id: int, payload: ParameterIn) -> ParameterOut:
    """Update a catalog parameter."""
    try:
        with engine.begin() as connection:
            updated = queries.update_workflow_parameter(connection, parameter_id, payload)
            if not updated:
                raise HTTPException(status_code=404, detail={"error": "parameter_not_found"})
            row = queries.get_workflow_parameter(connection, parameter_id)
    except IntegrityError as exc:
        if "workflow_parameters_name_key" in str(exc.orig) or "duplicate key" in str(exc.orig):
            raise HTTPException(status_code=409, detail={"error": "duplicate_name"})
        raise HTTPException(status_code=400, detail={"error": "integrity_error"})
    return ParameterOut(**row)


@router.post("/workflow-parameters/{parameter_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_workflow_parameter(parameter_id: int) -> Response:
    """Archive a catalog parameter. Idempotent."""
    with engine.begin() as connection:
        exists = queries.archive_workflow_parameter(connection, parameter_id)
    if not exists:
        raise HTTPException(status_code=404, detail={"error": "parameter_not_found"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
