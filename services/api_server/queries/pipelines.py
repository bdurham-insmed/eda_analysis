"""
Pipeline read queries.
"""

from sqlalchemy import text
from sqlalchemy.engine import Connection


def list_pipelines(conn: Connection) -> list[dict]:
    """
    List all pipelines with workflow + version association columns projected.
    """
    rows = conn.execute(
        text("""
            SELECT
                p.id, p.name, p.status, p.start_time, p.end_time,
                p.workflow_id, p.workflow_version_id, p.parameter_values,
                wv.version_number
            FROM pipelines p
            LEFT JOIN workflow_versions wv ON wv.id = p.workflow_version_id
            ORDER BY p.start_time DESC
        """),
    ).fetchall()
    return [
        {
            "id": row[0],
            "name": row[1],
            "status": row[2],
            "start_time": row[3],
            "end_time": row[4],
            "workflow_id": row[5],
            "workflow_version_id": row[6],
            "parameter_values": row[7],
            "version_number": row[8],
        }
        for row in rows
    ]


def get_pipeline(conn: Connection, pipeline_id: str) -> dict | None:
    """
    Fetch a single pipeline (with steps), or None if missing.
    """
    row = conn.execute(
        text("""
            SELECT
                p.id, p.name, p.status, p.start_time, p.end_time,
                p.workflow_id, p.workflow_version_id, p.parameter_values,
                wv.version_number
            FROM pipelines p
            LEFT JOIN workflow_versions wv ON wv.id = p.workflow_version_id
            WHERE p.id = :id
        """),
        {"id": pipeline_id},
    ).fetchone()
    if row is None:
        return None
    step_rows = conn.execute(
        text("""
            SELECT step_name, status, start_time, end_time, step_order, step_type
            FROM pipeline_steps WHERE pipeline_id = :id
            ORDER BY step_order NULLS LAST, start_time NULLS LAST, id
        """),
        {"id": pipeline_id},
    ).fetchall()
    return {
        "id": row[0],
        "name": row[1],
        "status": row[2],
        "start_time": row[3],
        "end_time": row[4],
        "workflow_id": row[5],
        "workflow_version_id": row[6],
        "parameter_values": row[7],
        "version_number": row[8],
        "steps": [
            {
                "name": s[0],
                "status": s[1],
                "start_time": s[2],
                "end_time": s[3],
                "step_order": s[4],
                "step_type": s[5],
            }
            for s in step_rows
        ],
    }
