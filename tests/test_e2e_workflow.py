"""
End-to-end smoke test against a running `docker compose up` stack.

Run with:
    docker compose down -v && docker compose up -d --build
    uv run pytest tests/test_e2e_workflow.py -v
"""

import os
import time
import uuid

import httpx
import pytest

API_BASE = os.getenv("E2E_API_BASE", "http://localhost:8000")
INITIATOR_BASE = os.getenv("E2E_INITIATOR_BASE", "http://localhost:8001")


def _wait_for(url: str, timeout: int = 60) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = httpx.get(url, timeout=2.0)
            if r.status_code < 500:
                return
        except httpx.HTTPError:
            time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {url}")


@pytest.mark.e2e
def test_workflow_creation_and_pipeline_execution():
    """
    Full happy-path E2E:
      1. Create two workflow_parameters (string + select).
      2. Create a workflow with a v1 draft.
      3. Publish v1.
      4. POST /jobs targeting that version.
      5. Poll /pipelines/{id} until terminal; assert workflow_id, version_number,
         name, parameter_values, steps.
    """
    _wait_for(f"{API_BASE}/pipelines")
    _wait_for(f"{INITIATOR_BASE}/docs")

    suffix = uuid.uuid4().hex[:8]
    p_string_body = {
        "name": f"sample_id_{suffix}",
        "type": "string",
        "options": None,
        "required": True,
    }
    p_select_body = {
        "name": f"reference_{suffix}",
        "type": "select",
        "options": ["hg19", "hg38"],
        "default_value": "hg38",
        "required": True,
    }
    r1 = httpx.post(f"{API_BASE}/workflow-parameters", json=p_string_body, timeout=10)
    assert r1.status_code == 201, r1.text
    string_param = r1.json()
    r2 = httpx.post(f"{API_BASE}/workflow-parameters", json=p_select_body, timeout=10)
    assert r2.status_code == 201, r2.text
    select_param = r2.json()

    wf_body = {
        "name": f"e2e-flow-{suffix}",
        "description": "E2E test workflow",
        "initial_version": {
            "parameter_ids": [string_param["id"], select_param["id"]],
            "steps": [
                {"step_order": 0, "step_name": "ingest", "step_type": "processing"},
                {"step_order": 1, "step_name": "analyze", "step_type": "analysis"},
            ],
            "description": "v1",
        },
    }
    rwf = httpx.post(f"{API_BASE}/workflows", json=wf_body, timeout=10)
    assert rwf.status_code == 201, rwf.text
    workflow = rwf.json()
    v1_id = workflow["versions"][0]["id"]

    rpub = httpx.post(f"{API_BASE}/workflow-versions/{v1_id}/publish", timeout=10)
    assert rpub.status_code == 200, rpub.text
    assert rpub.json()["status"] == "published"

    parameter_values = {
        string_param["name"]: "SAMPLE-001",
        select_param["name"]: "hg38",
    }
    rjob = httpx.post(
        f"{INITIATOR_BASE}/jobs",
        json={
            "workflow_version_id": v1_id,
            "parameters": parameter_values,
            "count": 1,
        },
        timeout=10,
    )
    assert rjob.status_code == 202, rjob.text

    pipeline_id = None
    deadline = time.time() + 90
    while time.time() < deadline:
        listing = httpx.get(f"{API_BASE}/pipelines", timeout=10).json()
        candidates = [p for p in listing if p.get("workflow_version_id") == v1_id]
        if candidates:
            pipeline_id = candidates[0]["id"]
            break
        time.sleep(1)
    assert pipeline_id is not None, "Pipeline never appeared"

    deadline = time.time() + 180
    final = None
    while time.time() < deadline:
        detail = httpx.get(f"{API_BASE}/pipelines/{pipeline_id}", timeout=10).json()
        if detail["status"] in ("COMPLETED", "FAILED"):
            final = detail
            break
        time.sleep(2)
    assert final is not None, "Pipeline never reached terminal state"

    assert final["workflow_id"] == workflow["id"]
    assert final["workflow_version_id"] == v1_id
    assert final["version_number"] == 1
    assert final["name"] == workflow["name"]
    assert final["parameter_values"] == parameter_values
    assert len(final["steps"]) == 2
    orders = sorted(s.get("step_order") for s in final["steps"])
    assert orders == [0, 1]
