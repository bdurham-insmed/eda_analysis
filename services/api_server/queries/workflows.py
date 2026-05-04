"""
Workflow CRUD: metadata + archive flag. Version contents live in queries.versions.
"""

from queries.shared import StaleRevisionError
from queries.shared import validate_parameter_ids
from queries.versions import create_version
from queries.versions import publish_version
from schemas import WorkflowIn
from schemas import WorkflowMetadataUpdateIn
from sqlalchemy import text
from sqlalchemy.engine import Connection


def list_workflows(conn: Connection, include_archived: bool) -> list[dict]:
    """
    Workflow summaries with version counts and the most-recent published version.
    """
    archived_filter = "" if include_archived else " WHERE w.archived_at IS NULL"
    rows = conn.execute(
        text(f"""
            SELECT
                w.id,
                w.name,
                w.description,
                w.archived_at,
                (SELECT COUNT(*) FROM workflow_versions v WHERE v.workflow_id = w.id) AS version_count,
                (SELECT MAX(version_number) FROM workflow_versions v WHERE v.workflow_id = w.id) AS latest_version_number,
                (
                    SELECT v.id FROM workflow_versions v
                    WHERE v.workflow_id = w.id
                      AND v.status = 'published'
                      AND v.archived_at IS NULL
                    ORDER BY v.version_number DESC LIMIT 1
                ) AS latest_published_id,
                (
                    SELECT v.version_number FROM workflow_versions v
                    WHERE v.workflow_id = w.id
                      AND v.status = 'published'
                      AND v.archived_at IS NULL
                    ORDER BY v.version_number DESC LIMIT 1
                ) AS latest_published_number
            FROM workflows w
            {archived_filter}
            ORDER BY w.id DESC
        """),
    ).fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "description": r[2],
            "archived_at": r[3],
            "version_count": r[4],
            "latest_version_number": r[5],
            "latest_published_version_id": r[6],
            "latest_published_version_number": r[7],
        }
        for r in rows
    ]


def get_workflow(conn: Connection, workflow_id: int) -> dict | None:
    """
    Fetch a workflow with its version summaries (no nested params/steps —
    use get_workflow_version for that).
    """
    wf_row = conn.execute(
        text("""
            SELECT id, name, description, revision, created_at, updated_at, archived_at
            FROM workflows WHERE id = :id
        """),
        {"id": workflow_id},
    ).fetchone()
    if wf_row is None:
        return None
    version_rows = conn.execute(
        text("""
            SELECT id, workflow_id, version_number, status, description,
                   created_at, published_at, archived_at
            FROM workflow_versions
            WHERE workflow_id = :id
            ORDER BY version_number DESC
        """),
        {"id": workflow_id},
    ).fetchall()
    return {
        "id": wf_row[0],
        "name": wf_row[1],
        "description": wf_row[2],
        "revision": wf_row[3],
        "created_at": wf_row[4],
        "updated_at": wf_row[5],
        "archived_at": wf_row[6],
        "versions": [
            {
                "id": v[0],
                "workflow_id": v[1],
                "version_number": v[2],
                "status": v[3],
                "description": v[4],
                "created_at": v[5],
                "published_at": v[6],
                "archived_at": v[7],
            }
            for v in version_rows
        ],
    }


def create_workflow(conn: Connection, payload: WorkflowIn) -> int:
    """
    Insert a workflow + a v1 version with the supplied content. If
    `publish_initial_version` is true on the payload, v1 is published in the same
    transaction. Returns the new workflow id.
    """
    validate_parameter_ids(conn, payload.initial_version.parameter_ids)
    wf_id = conn.execute(
        text("""
            INSERT INTO workflows (name, description)
            VALUES (:name, :description)
            RETURNING id
        """),
        {"name": payload.name, "description": payload.description},
    ).scalar_one()
    version_id = create_version(
        conn,
        workflow_id=wf_id,
        version_number=1,
        content=payload.initial_version,
    )
    if payload.publish_initial_version:
        publish_version(conn, version_id)
    return wf_id


def update_workflow_metadata(
    conn: Connection,
    workflow_id: int,
    payload: WorkflowMetadataUpdateIn,
) -> None:
    """
    Optimistic-locked update of the workflow's name + description.
    """
    archived_row = conn.execute(
        text("SELECT archived_at FROM workflows WHERE id = :id"),
        {"id": workflow_id},
    ).fetchone()
    if archived_row is None:
        raise LookupError("workflow_not_found")
    if archived_row[0] is not None:
        raise ValueError("workflow_archived")
    result = conn.execute(
        text("""
            UPDATE workflows
            SET name = :name,
                description = :description,
                revision = revision + 1,
                updated_at = NOW()
            WHERE id = :id AND revision = :expected
            RETURNING revision
        """),
        {
            "id": workflow_id,
            "name": payload.name,
            "description": payload.description,
            "expected": payload.revision,
        },
    )
    if result.rowcount == 0:
        current = conn.execute(
            text("SELECT revision FROM workflows WHERE id = :id"),
            {"id": workflow_id},
        ).scalar_one_or_none()
        raise StaleRevisionError(current)


def archive_workflow(conn: Connection, workflow_id: int) -> bool:
    """Archive a workflow. Returns True if the row exists."""
    result = conn.execute(
        text("""
            UPDATE workflows SET archived_at = NOW(), updated_at = NOW()
            WHERE id = :id AND archived_at IS NULL
        """),
        {"id": workflow_id},
    )
    if result.rowcount == 0:
        exists = conn.execute(
            text("SELECT 1 FROM workflows WHERE id = :id"),
            {"id": workflow_id},
        ).fetchone()
        return exists is not None
    return True


def unarchive_workflow(conn: Connection, workflow_id: int) -> bool:
    """Clear archived_at on a workflow. Returns True if the row exists."""
    result = conn.execute(
        text("""
            UPDATE workflows SET archived_at = NULL, updated_at = NOW()
            WHERE id = :id AND archived_at IS NOT NULL
        """),
        {"id": workflow_id},
    )
    if result.rowcount == 0:
        exists = conn.execute(
            text("SELECT 1 FROM workflows WHERE id = :id"),
            {"id": workflow_id},
        ).fetchone()
        return exists is not None
    return True
