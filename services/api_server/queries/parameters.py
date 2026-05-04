"""
Workflow parameter catalog CRUD.
"""

from schemas import ParameterIn
from sqlalchemy import text
from sqlalchemy.engine import Connection


def list_workflow_parameters(conn: Connection, include_archived: bool) -> list[dict]:
    """List workflow parameters from the catalog."""
    archived_filter = "" if include_archived else " WHERE archived_at IS NULL"
    rows = conn.execute(
        text(f"""
            SELECT id, name, type, description, options, required, default_value, archived_at
            FROM workflow_parameters
            {archived_filter}
            ORDER BY id DESC
        """),
    ).fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "type": r[2],
            "description": r[3],
            "options": r[4],
            "required": r[5],
            "default_value": r[6],
            "archived_at": r[7],
        }
        for r in rows
    ]


def get_workflow_parameter(conn: Connection, parameter_id: int) -> dict | None:
    """Fetch a single workflow parameter, or None if missing."""
    row = conn.execute(
        text("""
            SELECT id, name, type, description, options, required, default_value, archived_at
            FROM workflow_parameters WHERE id = :id
        """),
        {"id": parameter_id},
    ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0],
        "name": row[1],
        "type": row[2],
        "description": row[3],
        "options": row[4],
        "required": row[5],
        "default_value": row[6],
        "archived_at": row[7],
    }


def create_workflow_parameter(conn: Connection, payload: ParameterIn) -> int:
    """Insert a workflow parameter. Returns the new id."""
    return conn.execute(
        text("""
            INSERT INTO workflow_parameters
                (name, type, description, options, required, default_value)
            VALUES
                (:name, :type, :description, :options, :required, :default_value)
            RETURNING id
        """),
        {
            "name": payload.name,
            "type": payload.type,
            "description": payload.description,
            "options": payload.options,
            "required": payload.required,
            "default_value": payload.default_value,
        },
    ).scalar_one()


def update_workflow_parameter(conn: Connection, parameter_id: int, payload: ParameterIn) -> bool:
    """Update a workflow parameter. Returns True if the row exists."""
    result = conn.execute(
        text("""
            UPDATE workflow_parameters
            SET name = :name,
                type = :type,
                description = :description,
                options = :options,
                required = :required,
                default_value = :default_value
            WHERE id = :id
        """),
        {
            "id": parameter_id,
            "name": payload.name,
            "type": payload.type,
            "description": payload.description,
            "options": payload.options,
            "required": payload.required,
            "default_value": payload.default_value,
        },
    )
    return result.rowcount > 0


def archive_workflow_parameter(conn: Connection, parameter_id: int) -> bool:
    """Archive a workflow parameter. Returns True if the row exists."""
    result = conn.execute(
        text("""
            UPDATE workflow_parameters SET archived_at = NOW()
            WHERE id = :id AND archived_at IS NULL
        """),
        {"id": parameter_id},
    )
    if result.rowcount == 0:
        exists = conn.execute(
            text("SELECT 1 FROM workflow_parameters WHERE id = :id"),
            {"id": parameter_id},
        ).fetchone()
        return exists is not None
    return True
