def _make_param(client, name="ref_genome", type_="select", options=None, default_value="hg38"):
    body = {
        "name": name,
        "type": type_,
        "options": options if options is not None else ["hg19", "hg38"],
        "default_value": default_value,
        "required": False,
    }
    res = client.post("/workflow-parameters", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _make_workflow(client, name="my-flow", parameter_ids=None, steps=None):
    body = {
        "name": name,
        "description": "test",
        "initial_version": {
            "parameter_ids": parameter_ids or [],
            "steps": steps
            or [
                {"step_order": 0, "step_name": "ingest", "step_type": "processing"},
                {"step_order": 1, "step_name": "analyze", "step_type": "analysis"},
            ],
            "description": "v1",
        },
    }
    return client.post("/workflows", json=body)


def test_create_workflow_creates_v1_draft(client):
    """
    POST /workflows creates a workflow plus a v1 draft. GET returns the workflow with versions.
    """
    param = _make_param(client)
    res = _make_workflow(client, parameter_ids=[param["id"]])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "my-flow"
    assert body["revision"] == 1
    assert len(body["versions"]) == 1
    v1 = body["versions"][0]
    assert v1["version_number"] == 1
    assert v1["status"] == "draft"

    detail = client.get(f"/workflow-versions/{v1['id']}").json()
    assert len(detail["parameters"]) == 1
    assert len(detail["steps"]) == 2


def test_version_label_round_trip(client):
    """
    A version_label set on create round-trips through GET, and update can change it.
    """
    body = {
        "name": "labelled",
        "description": None,
        "initial_version": {
            "parameter_ids": [],
            "steps": [{"step_order": 0, "step_name": "go", "step_type": "processing"}],
            "description": None,
            "version_label": "1.0.0",
        },
    }
    res = client.post("/workflows", json=body)
    assert res.status_code == 201
    v1 = res.json()["versions"][0]
    assert v1["version_label"] == "1.0.0"

    detail = client.get(f"/workflow-versions/{v1['id']}").json()
    assert detail["version_label"] == "1.0.0"

    updated = client.put(
        f"/workflow-versions/{v1['id']}",
        json={
            "parameter_ids": [],
            "steps": [{"step_order": 0, "step_name": "go", "step_type": "processing"}],
            "description": None,
            "version_label": "1.1.0",
            "revision": detail["revision"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["version_label"] == "1.1.0"


def test_create_workflow_publish_initial_version(client):
    """
    POST /workflows with publish_initial_version=true publishes v1 in the same transaction.
    """
    body = {
        "name": "instant-publish",
        "description": None,
        "initial_version": {
            "parameter_ids": [],
            "steps": [
                {"step_order": 0, "step_name": "go", "step_type": "processing"},
            ],
            "description": "shipped on day one",
        },
        "publish_initial_version": True,
    }
    res = client.post("/workflows", json=body)
    assert res.status_code == 201, res.text
    wf = res.json()
    assert len(wf["versions"]) == 1
    v1 = wf["versions"][0]
    assert v1["status"] == "published"
    assert v1["published_at"] is not None


def test_duplicate_name_returns_409(client):
    """
    Creating two workflows with the same name returns a 409 with `duplicate_name`.
    """
    _make_workflow(client, name="dup")
    res = _make_workflow(client, name="dup")
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "duplicate_name"


def test_zero_step_workflow_rejected(client):
    """
    A workflow whose initial version has no steps must be rejected.
    """
    body = {
        "name": "no-steps",
        "description": None,
        "initial_version": {"parameter_ids": [], "steps": [], "description": None},
    }
    res = client.post("/workflows", json=body)
    assert res.status_code == 422


def test_metadata_put_revision_round_trip(client):
    """
    PUT /workflows/{id} (metadata) with the correct revision succeeds and bumps revision.
    """
    create = _make_workflow(client, name="upd")
    wid = create.json()["id"]
    body = {"name": "upd-renamed", "description": "new", "revision": 1}
    res = client.put(f"/workflows/{wid}", json=body)
    assert res.status_code == 200
    assert res.json()["revision"] == 2
    assert res.json()["name"] == "upd-renamed"


def test_metadata_put_stale_revision_returns_409(client):
    """
    PUT /workflows/{id} with a stale revision returns 409 with current_revision in body.
    """
    create = _make_workflow(client, name="stale")
    wid = create.json()["id"]
    body = {"name": "stale", "description": None, "revision": 99}
    res = client.put(f"/workflows/{wid}", json=body)
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["error"] == "stale_revision"
    assert detail["current_revision"] == 1


def test_archive_filters_list(client):
    """
    Archiving hides a workflow from the default list, but `?include_archived=true` shows it.
    """
    create = _make_workflow(client, name="archive-me")
    wid = create.json()["id"]
    res = client.post(f"/workflows/{wid}/archive")
    assert res.status_code == 204
    listed = client.get("/workflows").json()
    assert all(item["id"] != wid for item in listed)
    listed_all = client.get("/workflows?include_archived=true").json()
    assert any(item["id"] == wid for item in listed_all)


def test_get_unknown_workflow_returns_404(client):
    """
    GET /workflows/{id} for a missing id returns 404.
    """
    res = client.get("/workflows/9999")
    assert res.status_code == 404


def test_delete_draft_version(client):
    """
    DELETE on a draft version removes it; DELETE on a published version returns 409.
    """
    create = _make_workflow(client, name="deletable")
    wf = create.json()
    v1_id = wf["versions"][0]["id"]

    # delete the draft v1
    res = client.delete(f"/workflow-versions/{v1_id}")
    assert res.status_code == 204
    assert client.get(f"/workflow-versions/{v1_id}").status_code == 404

    # create a new draft, publish it, then deletion should be refused
    new_v = client.post(
        f"/workflows/{wf['id']}/versions",
        json={
            "content": {
                "parameter_ids": [],
                "steps": [{"step_order": 0, "step_name": "x", "step_type": "processing"}],
                "description": None,
            },
        },
    ).json()
    client.post(f"/workflow-versions/{new_v['id']}/publish")
    refused = client.delete(f"/workflow-versions/{new_v['id']}")
    assert refused.status_code == 409
    assert refused.json()["detail"]["error"] == "version_not_draft"


def test_version_lifecycle(client):
    """
    Draft -> publish -> clone -> archive cycle.
    """
    param = _make_param(client, name="p1")
    create = _make_workflow(client, name="lifecycle", parameter_ids=[param["id"]])
    wf = create.json()
    v1_id = wf["versions"][0]["id"]

    pub = client.post(f"/workflow-versions/{v1_id}/publish")
    assert pub.status_code == 200
    assert pub.json()["status"] == "published"

    edit = client.put(
        f"/workflow-versions/{v1_id}",
        json={
            "parameter_ids": [param["id"]],
            "steps": [{"step_order": 0, "step_name": "x", "step_type": "processing"}],
            "description": "should fail",
            "revision": pub.json()["revision"],
        },
    )
    assert edit.status_code == 409
    assert edit.json()["detail"]["error"] == "version_not_draft"

    clone = client.post(f"/workflows/{wf['id']}/versions", json={"from_version_id": v1_id})
    assert clone.status_code == 201
    v2 = clone.json()
    assert v2["version_number"] == 2
    assert v2["status"] == "draft"
    assert len(v2["parameters"]) == 1
    assert len(v2["steps"]) == 2

    archive = client.post(f"/workflow-versions/{v1_id}/archive")
    assert archive.status_code == 204
    detail = client.get(f"/workflow-versions/{v1_id}").json()
    assert detail["archived_at"] is not None
