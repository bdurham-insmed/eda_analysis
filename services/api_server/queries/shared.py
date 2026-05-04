"""
Shared exceptions and helpers used across query submodules.
"""

from sqlalchemy import text
from sqlalchemy.engine import Connection


class StaleRevisionError(Exception):
    """
    Raised when an optimistic-lock check fails on workflows or workflow_versions.
    """

    def __init__(self, current_revision: int | None) -> None:
        super().__init__("stale_revision")
        self.current_revision = current_revision


def validate_parameter_ids(conn: Connection, parameter_ids: list[int]) -> None:
    """
    Ensure every parameter id exists and is not archived.
    """
    if not parameter_ids:
        return
    rows = conn.execute(
        text("SELECT id, archived_at FROM workflow_parameters WHERE id = ANY(:ids)"),
        {"ids": parameter_ids},
    ).fetchall()
    found = {r[0]: r[1] for r in rows}
    missing = [pid for pid in parameter_ids if pid not in found]
    if missing:
        raise ValueError(f"unknown_parameter_ids: {missing}")
    archived = [pid for pid, archived_at in found.items() if archived_at is not None]
    if archived:
        raise ValueError(f"archived_parameter_ids: {archived}")
