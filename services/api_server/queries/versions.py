"""
Workflow version CRUD + lifecycle (draft/publish/archive/clone).
"""

from queries.shared import StaleRevisionError
from queries.shared import validate_parameter_ids
from schemas import WorkflowVersionContentIn
from schemas import WorkflowVersionUpdateIn
from sqlalchemy import text
from sqlalchemy.engine import Connection


def create_version(
    conn: Connection,
    *,
    workflow_id: int,
    version_number: int,
    content: WorkflowVersionContentIn,
) -> int:
    """
    Insert a new draft version + its parameter mappings + steps. Returns version id.
    """
    new_id = conn.execute(
        text("""
            INSERT INTO workflow_versions (workflow_id, version_number, status, description)
            VALUES (:wid, :vnum, 'draft', :description)
            RETURNING id
        """),
        {"wid": workflow_id, "vnum": version_number, "description": content.description},
    ).scalar_one()
    for pid in content.parameter_ids:
        conn.execute(
            text("""
                INSERT INTO workflow_version_parameters (workflow_version_id, parameter_id)
                VALUES (:vid, :pid)
            """),
            {"vid": new_id, "pid": pid},
        )
    for step in content.steps:
        conn.execute(
            text("""
                INSERT INTO workflow_version_steps
                    (workflow_version_id, step_order, step_name, step_type)
                VALUES (:vid, :step_order, :step_name, :step_type)
            """),
            {
                "vid": new_id,
                "step_order": step.step_order,
                "step_name": step.step_name,
                "step_type": step.step_type,
            },
        )
    return new_id


def get_workflow_version(conn: Connection, version_id: int) -> dict | None:
    """
    Fetch a workflow version with parameters and steps.
    """
    row = conn.execute(
        text("""
            SELECT id, workflow_id, version_number, status, description,
                   revision, created_at, published_at, archived_at
            FROM workflow_versions WHERE id = :id
        """),
        {"id": version_id},
    ).fetchone()
    if row is None:
        return None
    param_rows = conn.execute(
        text("""
            SELECT wp.id, wp.name, wp.type, wp.description, wp.options, wp.required,
                   wp.default_value, wp.archived_at
            FROM workflow_parameters wp
            JOIN workflow_version_parameters m ON m.parameter_id = wp.id
            WHERE m.workflow_version_id = :id
            ORDER BY wp.id
        """),
        {"id": version_id},
    ).fetchall()
    step_rows = conn.execute(
        text("""
            SELECT id, step_order, step_name, step_type
            FROM workflow_version_steps
            WHERE workflow_version_id = :id
            ORDER BY step_order
        """),
        {"id": version_id},
    ).fetchall()
    return {
        "id": row[0],
        "workflow_id": row[1],
        "version_number": row[2],
        "status": row[3],
        "description": row[4],
        "revision": row[5],
        "created_at": row[6],
        "published_at": row[7],
        "archived_at": row[8],
        "parameters": [
            {
                "id": p[0],
                "name": p[1],
                "type": p[2],
                "description": p[3],
                "options": p[4],
                "required": p[5],
                "default_value": p[6],
                "archived_at": p[7],
            }
            for p in param_rows
        ],
        "steps": [{"id": s[0], "step_order": s[1], "step_name": s[2], "step_type": s[3]} for s in step_rows],
    }


def _next_version_number(conn: Connection, workflow_id: int) -> int:
    cur = conn.execute(
        text("""
            SELECT COALESCE(MAX(version_number), 0) + 1
            FROM workflow_versions WHERE workflow_id = :wid
        """),
        {"wid": workflow_id},
    ).scalar_one()
    return int(cur)


def create_version_from_content(
    conn: Connection,
    workflow_id: int,
    content: WorkflowVersionContentIn,
) -> int:
    """
    Add a new draft version with explicit content.
    """
    archived_row = conn.execute(
        text("SELECT archived_at FROM workflows WHERE id = :id"),
        {"id": workflow_id},
    ).fetchone()
    if archived_row is None:
        raise LookupError("workflow_not_found")
    if archived_row[0] is not None:
        raise ValueError("workflow_archived")
    validate_parameter_ids(conn, content.parameter_ids)
    return create_version(
        conn,
        workflow_id=workflow_id,
        version_number=_next_version_number(conn, workflow_id),
        content=content,
    )


def clone_version(
    conn: Connection,
    workflow_id: int,
    source_version_id: int,
) -> int:
    """
    Create a new draft version cloned from an existing one. Source can be in any
    status; clone is always a fresh draft. Returns the new version id.
    """
    archived_row = conn.execute(
        text("SELECT archived_at FROM workflows WHERE id = :id"),
        {"id": workflow_id},
    ).fetchone()
    if archived_row is None:
        raise LookupError("workflow_not_found")
    if archived_row[0] is not None:
        raise ValueError("workflow_archived")
    src = conn.execute(
        text("""
            SELECT workflow_id, description FROM workflow_versions WHERE id = :id
        """),
        {"id": source_version_id},
    ).fetchone()
    if src is None or src[0] != workflow_id:
        raise LookupError("source_version_not_found")
    new_number = _next_version_number(conn, workflow_id)
    new_id = conn.execute(
        text("""
            INSERT INTO workflow_versions (workflow_id, version_number, status, description)
            VALUES (:wid, :vnum, 'draft', :description)
            RETURNING id
        """),
        {"wid": workflow_id, "vnum": new_number, "description": src[1]},
    ).scalar_one()
    conn.execute(
        text("""
            INSERT INTO workflow_version_parameters (workflow_version_id, parameter_id)
            SELECT :new_id, parameter_id FROM workflow_version_parameters
            WHERE workflow_version_id = :src_id
        """),
        {"new_id": new_id, "src_id": source_version_id},
    )
    conn.execute(
        text("""
            INSERT INTO workflow_version_steps
                (workflow_version_id, step_order, step_name, step_type)
            SELECT :new_id, step_order, step_name, step_type
            FROM workflow_version_steps
            WHERE workflow_version_id = :src_id
        """),
        {"new_id": new_id, "src_id": source_version_id},
    )
    return new_id


def update_version(
    conn: Connection,
    version_id: int,
    payload: WorkflowVersionUpdateIn,
) -> None:
    """
    Optimistic-locked update of a draft version. Refuses if published or archived.
    """
    row = conn.execute(
        text("""
            SELECT status, archived_at, revision FROM workflow_versions WHERE id = :id
        """),
        {"id": version_id},
    ).fetchone()
    if row is None:
        raise LookupError("version_not_found")
    status, archived_at, _revision = row
    if archived_at is not None:
        raise ValueError("version_archived")
    if status != "draft":
        raise ValueError("version_not_draft")
    validate_parameter_ids(conn, payload.parameter_ids)
    result = conn.execute(
        text("""
            UPDATE workflow_versions
            SET description = :description,
                revision = revision + 1
            WHERE id = :id AND revision = :expected
            RETURNING revision
        """),
        {
            "id": version_id,
            "description": payload.description,
            "expected": payload.revision,
        },
    )
    if result.rowcount == 0:
        current = conn.execute(
            text("SELECT revision FROM workflow_versions WHERE id = :id"),
            {"id": version_id},
        ).scalar_one_or_none()
        raise StaleRevisionError(current)
    conn.execute(
        text("DELETE FROM workflow_version_parameters WHERE workflow_version_id = :id"),
        {"id": version_id},
    )
    conn.execute(
        text("DELETE FROM workflow_version_steps WHERE workflow_version_id = :id"),
        {"id": version_id},
    )
    for pid in payload.parameter_ids:
        conn.execute(
            text("""
                INSERT INTO workflow_version_parameters (workflow_version_id, parameter_id)
                VALUES (:vid, :pid)
            """),
            {"vid": version_id, "pid": pid},
        )
    for step in payload.steps:
        conn.execute(
            text("""
                INSERT INTO workflow_version_steps
                    (workflow_version_id, step_order, step_name, step_type)
                VALUES (:vid, :step_order, :step_name, :step_type)
            """),
            {
                "vid": version_id,
                "step_order": step.step_order,
                "step_name": step.step_name,
                "step_type": step.step_type,
            },
        )


def publish_version(conn: Connection, version_id: int) -> None:
    """
    Promote a draft to published. Refuses if archived.
    """
    row = conn.execute(
        text("SELECT status, archived_at FROM workflow_versions WHERE id = :id"),
        {"id": version_id},
    ).fetchone()
    if row is None:
        raise LookupError("version_not_found")
    status, archived_at = row
    if archived_at is not None:
        raise ValueError("version_archived")
    if status == "published":
        return
    conn.execute(
        text("""
            UPDATE workflow_versions
            SET status = 'published',
                published_at = NOW(),
                revision = revision + 1
            WHERE id = :id
        """),
        {"id": version_id},
    )


def archive_version(conn: Connection, version_id: int) -> bool:
    """Archive a workflow version. Returns True if the row exists."""
    result = conn.execute(
        text("""
            UPDATE workflow_versions
            SET archived_at = NOW(),
                revision = revision + 1
            WHERE id = :id AND archived_at IS NULL
        """),
        {"id": version_id},
    )
    if result.rowcount == 0:
        exists = conn.execute(
            text("SELECT 1 FROM workflow_versions WHERE id = :id"),
            {"id": version_id},
        ).fetchone()
        return exists is not None
    return True


def unarchive_version(conn: Connection, version_id: int) -> bool:
    """Clear archived_at on a workflow version. Returns True if the row exists."""
    result = conn.execute(
        text("""
            UPDATE workflow_versions
            SET archived_at = NULL,
                revision = revision + 1
            WHERE id = :id AND archived_at IS NOT NULL
        """),
        {"id": version_id},
    )
    if result.rowcount == 0:
        exists = conn.execute(
            text("SELECT 1 FROM workflow_versions WHERE id = :id"),
            {"id": version_id},
        ).fetchone()
        return exists is not None
    return True
